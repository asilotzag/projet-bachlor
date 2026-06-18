import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';
import { createNotification, createBulkNotifications } from '../../services/notificationService.js';

const userSelect = { id: true, fullName: true, email: true, role: { select: { name: true } } };

// ── Mon équipe (avec stats) ────────────────────────────────────────────────────

export async function getMyTeam(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;

  // Admin/RH can view a specific manager's team via ?managerId=
  const managerId = (role === 'ADMIN' || role === 'RH')
    ? (req.query.managerId as string | undefined) ?? userId
    : userId;

  const employees = await prisma.employee.findMany({
    where: { managerId },
    include: {
      user: { select: { ...userSelect, isActive: true } },
      department: { select: { id: true, name: true } },
    },
  });

  if (employees.length === 0) { res.json([]); return; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const memberIds = employees.map((e) => e.userId);

  const [taskGroups, overdueCounts, recentTasks, projectMembers] = await Promise.all([
    prisma.task.groupBy({
      by: ['assigneeId', 'status'],
      where: { assigneeId: { in: memberIds } },
      _count: { id: true },
    }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { assigneeId: { in: memberIds }, status: { not: 'DONE' }, dueDate: { lt: today } },
      _count: { id: true },
    }),
    prisma.task.findMany({
      where: { assigneeId: { in: memberIds } },
      select: {
        id: true, title: true, status: true, priority: true, dueDate: true, assigneeId: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 6 * employees.length,
    }),
    prisma.projectMember.findMany({
      where: { userId: { in: memberIds } },
      include: { project: { select: { id: true, name: true, status: true } } },
    }),
  ]);

  const teamData = employees.map((emp) => {
    const groups = taskGroups.filter((g) => g.assigneeId === emp.userId);
    const total = groups.reduce((s, g) => s + g._count.id, 0);
    const done = groups.find((g) => g.status === 'DONE')?._count.id ?? 0;
    const inProgress = groups.find((g) => g.status === 'IN_PROGRESS')?._count.id ?? 0;
    const todo = groups.find((g) => g.status === 'TODO')?._count.id ?? 0;
    const overdue = overdueCounts.find((o) => o.assigneeId === emp.userId)?._count.id ?? 0;

    return {
      employeeId: emp.id,
      userId: emp.userId,
      position: emp.position,
      managerId: emp.managerId,
      department: emp.department,
      user: emp.user,
      taskStats: { total, done, inProgress, todo, overdue },
      recentTasks: recentTasks.filter((t) => t.assigneeId === emp.userId).slice(0, 5),
      projects: projectMembers.filter((pm) => pm.userId === emp.userId).map((pm) => pm.project),
    };
  });

  res.json(teamData);
}

// ── Demandes de supervision ────────────────────────────────────────────────────

export async function listRequests(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const where = role === 'MANAGER' ? { requesterId: userId } : {};

  const requests = await prisma.supervisionRequest.findMany({
    where,
    include: {
      requester: { select: userSelect },
      employee:  { select: { ...userSelect, employee: { select: { position: true, department: { select: { name: true } } } } } },
      reviewedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests);
}

export async function countPendingRequests(_req: Request, res: Response): Promise<void> {
  const count = await prisma.supervisionRequest.count({ where: { status: 'PENDING' } });
  res.json({ count });
}

export async function createRequest(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const { employeeId, note } = req.body as { employeeId: string; note?: string };

  if (!employeeId) { res.status(400).json({ message: 'employeeId requis' }); return; }

  // Check employee exists and is not already on this manager's team
  const employee = await prisma.employee.findUnique({
    where: { userId: employeeId },
    select: { managerId: true, user: { select: { fullName: true } } },
  });
  if (!employee) { res.status(404).json({ message: 'Employé introuvable' }); return; }
  if (employee.managerId === userId) {
    res.status(409).json({ message: 'Cet employé est déjà dans votre équipe' }); return;
  }

  // Check no existing PENDING request for same pair
  const existing = await prisma.supervisionRequest.findFirst({
    where: { requesterId: userId, employeeId, status: 'PENDING' },
  });
  if (existing) {
    res.status(409).json({ message: 'Une demande est déjà en attente pour cet employé' }); return;
  }

  const request = await prisma.supervisionRequest.create({
    data: { requesterId: userId, employeeId, note: note ?? null },
    include: {
      requester: { select: userSelect },
      employee:  { select: userSelect },
    },
  });

  // Notify ADMIN and RH users
  const admins = await prisma.user.findMany({
    where: { role: { name: { in: ['ADMIN', 'RH'] } }, isActive: true },
    select: { id: true },
  });
  const requesterName = request.requester.fullName;
  const empName = request.employee.fullName;
  void createBulkNotifications(
    admins.map((a) => a.id),
    'SUPERVISION_REQUEST',
    'Nouvelle demande de supervision',
    `${requesterName} demande à superviser ${empName}`,
    '/team',
  );

  res.status(201).json(request);
}

export async function approveRequest(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const { reviewNote } = req.body as { reviewNote?: string };

  const request = await prisma.supervisionRequest.findUnique({
    where: { id: req.params.id },
    include: { requester: { select: userSelect }, employee: { select: userSelect } },
  });
  if (!request) { res.status(404).json({ message: 'Demande introuvable' }); return; }
  if (request.status !== 'PENDING') {
    res.status(409).json({ message: 'Cette demande a déjà été traitée' }); return;
  }

  await prisma.$transaction([
    // Assign employee to manager
    prisma.employee.update({
      where: { userId: request.employeeId },
      data: { managerId: request.requesterId },
    }),
    // Update request status
    prisma.supervisionRequest.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', reviewedById: userId, reviewNote: reviewNote ?? null },
    }),
  ]);

  // Notify manager
  void createNotification(
    request.requesterId,
    'SUPERVISION_APPROVED',
    'Demande approuvée',
    `${request.employee.fullName} a été ajouté(e) à votre équipe`,
    '/team',
  );

  res.json({ message: 'Demande approuvée' });
}

export async function rejectRequest(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const { reviewNote } = req.body as { reviewNote?: string };

  const request = await prisma.supervisionRequest.findUnique({
    where: { id: req.params.id },
    include: { requester: { select: userSelect }, employee: { select: userSelect } },
  });
  if (!request) { res.status(404).json({ message: 'Demande introuvable' }); return; }
  if (request.status !== 'PENDING') {
    res.status(409).json({ message: 'Cette demande a déjà été traitée' }); return;
  }

  await prisma.supervisionRequest.update({
    where: { id: req.params.id },
    data: { status: 'REJECTED', reviewedById: userId, reviewNote: reviewNote ?? null },
  });

  // Notify manager
  void createNotification(
    request.requesterId,
    'SUPERVISION_REJECTED',
    'Demande refusée',
    `La demande pour superviser ${request.employee.fullName} a été refusée`,
    '/team',
  );

  res.json({ message: 'Demande refusée' });
}

// ── Employés disponibles pour demande ─────────────────────────────────────────

export async function getAvailableEmployees(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;

  const employees = await prisma.employee.findMany({
    where: {
      OR: [
        { managerId: null },
        { managerId: { not: userId } },
      ],
      user: { isActive: true },
    },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: { user: { fullName: 'asc' } },
  });

  res.json(employees.map((e) => ({
    id: e.id,
    userId: e.user.id,
    position: e.position,
    managerId: e.managerId,
    user: e.user,
    department: e.department,
  })));
}

export async function removeFromTeam(req: Request, res: Response): Promise<void> {
  const emp = await prisma.employee.findUnique({
    where: { userId: req.params.employeeId },
    select: { managerId: true },
  });
  if (!emp) { res.status(404).json({ message: 'Employé introuvable' }); return; }
  if (!emp.managerId) { res.status(409).json({ message: 'Cet employé n\'est pas supervisé' }); return; }

  await prisma.employee.update({
    where: { userId: req.params.employeeId },
    data: { managerId: null },
  });

  res.json({ message: 'Employé retiré de l\'équipe' });
}
