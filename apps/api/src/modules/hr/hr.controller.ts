import type { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../../prisma.js';
import * as notifSvc from '../../services/notificationService.js';

// ─── Schémas Zod ──────────────────────────────────────────────────────────────

const DeptSchema = z.object({ name: z.string().min(1).max(80) });

const EmployeeSchema = z.object({
  userId:       z.string(),
  departmentId: z.number().optional().nullable(),
  managerId:    z.string().optional().nullable(),
  position:     z.string().min(1).max(100),
  phone:        z.string().optional().nullable(),
  address:      z.string().optional().nullable(),
  birthDate:    z.string().datetime().optional().nullable(),
  hireDate:     z.string().datetime().optional(),
});

const ContractSchema = z.object({
  type:      z.enum(['CDI','CDD','STAGE','FREELANCE','APPRENTISSAGE']),
  startDate: z.string().datetime(),
  endDate:   z.string().datetime().optional().nullable(),
  salary:    z.number().optional().nullable(),
  notes:     z.string().optional().nullable(),
  isActive:  z.boolean().optional(),
});

const LeaveSchema = z.object({
  type:      z.enum(['CONGE_PAYE','CONGE_SANS_SOLDE','MALADIE','MATERNITE','PATERNITE','AUTRE']),
  startDate: z.string().datetime(),
  endDate:   z.string().datetime(),
  reason:    z.string().optional(),
});

const ApproveSchema = z.object({
  status: z.enum(['APPROUVE', 'REFUSE']),
});

const AttendanceSchema = z.object({
  employeeId: z.string(),
  date:       z.string(), // YYYY-MM-DD
  checkIn:    z.string().datetime().optional().nullable(),
  checkOut:   z.string().datetime().optional().nullable(),
  status:     z.enum(['PRESENT','ABSENT','RETARD','DEMI_JOURNEE']).optional(),
  notes:      z.string().optional().nullable(),
});

// ─── Utilitaire ───────────────────────────────────────────────────────────────

const employeeInclude = {
  user:       { select: { id: true, fullName: true, email: true, role: { select: { name: true } } } },
  department: true,
  manager:    { select: { id: true, fullName: true, email: true } },
  contracts:  { where: { isActive: true }, orderBy: { startDate: 'desc' as const }, take: 1 },
} as const;

// ─── DÉPARTEMENTS ─────────────────────────────────────────────────────────────

export async function listDepartments(_req: Request, res: Response): Promise<void> {
  const depts = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { employees: true } } },
  });
  res.json(depts);
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  const parsed = DeptSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }
  const dept = await prisma.department.create({ data: parsed.data });
  res.status(201).json(dept);
}

export async function updateDepartment(req: Request, res: Response): Promise<void> {
  const parsed = DeptSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }
  const dept = await prisma.department.update({ where: { id: Number(req.params.id) }, data: parsed.data });
  res.json(dept);
}

export async function deleteDepartment(req: Request, res: Response): Promise<void> {
  await prisma.department.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}

// ─── EMPLOYÉS ─────────────────────────────────────────────────────────────────

export async function listEmployees(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  let where: any = {};
  if (role === 'MANAGER') {
    where = { managerId: userId };
  } else if (role === 'EMPLOYE') {
    where = { userId };
  }
  // ADMIN and RH: no filter (see all)
  const employees = await prisma.employee.findMany({
    where,
    include: employeeInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(employees);
}

export async function getEmployee(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const employee = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: {
      ...employeeInclude,
      contracts: { orderBy: { startDate: 'desc' } },
      leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
      attendances: { orderBy: { date: 'desc' }, take: 30 },
    },
  });
  if (!employee) { res.status(404).json({ message: 'Employé introuvable' }); return; }

  if (role !== 'ADMIN' && role !== 'RH') {
    const allowed = role === 'MANAGER'
      ? employee.managerId === userId
      : employee.userId === userId;
    if (!allowed) { res.status(403).json({ message: 'Accès non autorisé' }); return; }
  }

  res.json(employee);
}

export async function createEmployee(req: Request, res: Response): Promise<void> {
  const parsed = EmployeeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() }); return; }

  const exists = await prisma.employee.findUnique({ where: { userId: parsed.data.userId } });
  if (exists) { res.status(409).json({ message: 'Un profil employé existe déjà pour cet utilisateur' }); return; }

  const employee = await prisma.employee.create({
    data: parsed.data,
    include: employeeInclude,
  });
  res.status(201).json(employee);
}

const CreateFullSchema = z.object({
  fullName:     z.string().min(2).max(100),
  email:        z.string().email(),
  password:     z.string().min(6),
  role:         z.enum(['EMPLOYE', 'MANAGER', 'RH']),
  position:     z.string().min(1).max(100),
  departmentId: z.number().optional().nullable(),
  phone:        z.string().optional().nullable(),
  hireDate:     z.string().datetime().optional(),
});

export async function createFullEmployee(req: Request, res: Response): Promise<void> {
  const parsed = CreateFullSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() }); return;
  }
  const { fullName, email, password, role, position, departmentId, phone, hireDate } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) { res.status(409).json({ message: 'Un compte avec cet email existe déjà' }); return; }

  const roleRecord = await prisma.role.findFirst({ where: { name: role } });
  if (!roleRecord) { res.status(400).json({ message: 'Rôle invalide' }); return; }

  const passwordHash = await bcrypt.hash(password, 12);

  const employee = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { fullName, email, passwordHash, roleId: roleRecord.id },
    });
    return tx.employee.create({
      data: {
        userId: user.id,
        position,
        departmentId: departmentId ?? null,
        phone: phone ?? null,
        hireDate: hireDate ? new Date(hireDate) : new Date(),
      },
      include: employeeInclude,
    });
  });

  res.status(201).json(employee);
}

export async function updateEmployee(req: Request, res: Response): Promise<void> {
  const parsed = EmployeeSchema.partial().omit({ userId: true }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }
  const employee = await prisma.employee.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: employeeInclude,
  });
  res.json(employee);
}

// ─── CONTRATS ─────────────────────────────────────────────────────────────────

export async function listContracts(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;

  if (role !== 'ADMIN' && role !== 'RH') {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      select: { userId: true, managerId: true },
    });
    if (!employee) { res.status(404).json({ message: 'Employé introuvable' }); return; }
    const allowed = role === 'MANAGER'
      ? employee.managerId === userId
      : employee.userId === userId;
    if (!allowed) { res.status(403).json({ message: 'Accès non autorisé' }); return; }
  }

  const contracts = await prisma.contract.findMany({
    where: { employeeId: req.params.id },
    orderBy: { startDate: 'desc' },
  });
  res.json(contracts);
}

export async function createContract(req: Request, res: Response): Promise<void> {
  const parsed = ContractSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }
  // Désactiver les contrats précédents si le nouveau est actif
  if (parsed.data.isActive !== false) {
    await prisma.contract.updateMany({
      where: { employeeId: req.params.id, isActive: true },
      data: { isActive: false },
    });
  }
  const contract = await prisma.contract.create({
    data: { ...parsed.data, employeeId: req.params.id },
  });
  res.status(201).json(contract);

  // Notification: contract created → employee
  const emp2 = await prisma.employee.findUnique({
    where: { id: req.params.id },
    select: { userId: true },
  });
  if (emp2) {
    void notifSvc.createNotification(
      emp2.userId,
      'CONTRACT_CREATED',
      'Nouveau contrat',
      `Un nouveau contrat ${contract.type} a été créé pour vous`,
      '/hr',
    );
  }
}

export async function updateContract(req: Request, res: Response): Promise<void> {
  const parsed = ContractSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }
  const contract = await prisma.contract.update({
    where: { id: Number(req.params.id) },
    data: parsed.data,
    include: { employee: { select: { userId: true } } },
  });
  res.json(contract);

  // Notification: contract updated → employee
  void notifSvc.createNotification(
    contract.employee.userId,
    'CONTRACT_UPDATED',
    'Contrat mis à jour',
    `Votre contrat ${contract.type} a été modifié`,
    '/hr',
  );
}

// ─── CONGÉS ───────────────────────────────────────────────────────────────────

export async function listLeaves(req: Request, res: Response): Promise<void> {
  const { role, userId } = req.user!;
  const { status } = req.query as Record<string, string>;

  const where: any = {};
  if (role === 'ADMIN' || role === 'RH') {
    // no employee filter — see all
  } else if (role === 'MANAGER') {
    // supervised employees + own
    const supervised = await prisma.employee.findMany({
      where: { managerId: userId },
      select: { id: true },
    });
    const ownEmp = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
    const empIds = supervised.map((e) => e.id);
    if (ownEmp) empIds.push(ownEmp.id);
    if (empIds.length === 0) { res.json([]); return; }
    where.employeeId = { in: empIds };
  } else {
    // EMPLOYE: own only
    const emp = await prisma.employee.findUnique({ where: { userId } });
    if (!emp) { res.json([]); return; }
    where.employeeId = emp.id;
  }
  if (status) where.status = status;

  const leaves = await prisma.leaveRequest.findMany({
    where,
    include: {
      employee: { include: { user: { select: { fullName: true } } } },
      approvedBy: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(leaves);
}

export async function myLeaves(req: Request, res: Response): Promise<void> {
  const emp = await prisma.employee.findUnique({ where: { userId: req.user!.userId } });
  if (!emp) { res.json([]); return; }
  const leaves = await prisma.leaveRequest.findMany({
    where: { employeeId: emp.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(leaves);
}

export async function createLeave(req: Request, res: Response): Promise<void> {
  const parsed = LeaveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() }); return; }

  // Trouver le profil employé de l'utilisateur connecté
  const emp = await prisma.employee.findUnique({ where: { userId: req.user!.userId } });
  if (!emp) { res.status(400).json({ message: 'Vous n\'avez pas de profil employé. Contactez les RH.' }); return; }

  const start = new Date(parsed.data.startDate);
  const end   = new Date(parsed.data.endDate);
  if (end < start) { res.status(400).json({ message: 'La date de fin doit être après la date de début' }); return; }

  const leave = await prisma.leaveRequest.create({
    data: { ...parsed.data, employeeId: emp.id },
    include: { employee: { include: { user: { select: { fullName: true } } } } },
  });
  res.status(201).json(leave);

  // Notification: leave submitted → all RH users
  const rhUsers = await prisma.user.findMany({
    where: { isActive: true, role: { name: 'RH' } },
    select: { id: true },
  });
  void notifSvc.createBulkNotifications(
    rhUsers.map((u) => u.id),
    'LEAVE_SUBMITTED',
    'Nouvelle demande de congé',
    `${leave.employee.user.fullName} a soumis une demande de congé`,
    '/hr',
  );
}

export async function approveLeave(req: Request, res: Response): Promise<void> {
  const parsed = ApproveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Statut invalide' }); return; }

  const leave = await prisma.leaveRequest.update({
    where: { id: Number(req.params.id) },
    data: {
      status: parsed.data.status,
      approvedById: req.user!.userId,
      approvedAt: new Date(),
    },
    include: { employee: { include: { user: { select: { id: true, fullName: true } } } } },
  });
  res.json(leave);

  // Notification: leave approved/rejected → employee
  const approved = parsed.data.status === 'APPROUVE';
  void notifSvc.createNotification(
    leave.employee.user.id,
    approved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    approved ? 'Congé approuvé' : 'Congé refusé',
    approved
      ? 'Votre demande de congé a été approuvée'
      : 'Votre demande de congé a été refusée',
    '/hr',
  );
}

// ─── PRÉSENCE ─────────────────────────────────────────────────────────────────

export async function listAttendance(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const { employeeId, month } = req.query as Record<string, string>;
  const where: any = {};

  if (role === 'ADMIN' || role === 'RH') {
    if (employeeId) where.employeeId = employeeId;
  } else if (role === 'MANAGER') {
    const supervised = await prisma.employee.findMany({
      where: { managerId: userId },
      select: { id: true },
    });
    const supervisedIds = supervised.map((e) => e.id);
    if (employeeId) {
      if (!supervisedIds.includes(employeeId)) {
        res.status(403).json({ message: 'Accès non autorisé' }); return;
      }
      where.employeeId = employeeId;
    } else {
      where.employeeId = { in: supervisedIds };
    }
  } else {
    // EMPLOYE: own attendance only
    const emp = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
    if (!emp) { res.json([]); return; }
    where.employeeId = emp.id;
  }

  if (month) {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0);
    where.date = { gte: start, lte: end };
  }
  const records = await prisma.attendance.findMany({
    where,
    include: { employee: { include: { user: { select: { fullName: true } } } } },
    orderBy: [{ date: 'desc' }, { employee: { user: { fullName: 'asc' } } }],
  });
  res.json(records);
}

export async function upsertAttendance(req: Request, res: Response): Promise<void> {
  const parsed = AttendanceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }

  const { employeeId, date, ...rest } = parsed.data;
  const dateObj = new Date(date);

  const record = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date: dateObj } },
    create: { employeeId, date: dateObj, ...rest },
    update: rest,
    include: {
      employee: {
        select: { userId: true, managerId: true, user: { select: { fullName: true } } },
      },
    },
  });
  res.json(record);

  // Notification: attendance anomaly (ABSENT or RETARD) → employee + manager
  const anomalyStatus = record.status === 'ABSENT' || record.status === 'RETARD';
  if (anomalyStatus) {
    const label = record.status === 'ABSENT' ? 'absent(e)' : 'en retard';
    const dateStr = dateObj.toLocaleDateString('fr-FR');
    const recipients: string[] = [record.employee.userId];
    if (record.employee.managerId) recipients.push(record.employee.managerId);
    void notifSvc.createBulkNotifications(
      recipients,
      'ATTENDANCE_ANOMALY',
      'Anomalie de présence',
      `${record.employee.user.fullName} était ${label} le ${dateStr}`,
      '/hr',
    );
  }
}

// ─── ORGANIGRAMME ─────────────────────────────────────────────────────────────

export async function getOrgChart(_req: Request, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: { select: { name: true } },
      employee: {
        select: {
          position: true,
          managerId: true,
          department: { select: { name: true } },
        },
      },
    },
  });

  const nodes = users.map((u) => ({
    id: u.id,
    name: u.fullName,
    role: u.role.name,
    position: u.employee?.position ?? u.role.name,
    department: u.employee?.department?.name ?? null,
    // ADMIN and RH are never subordinate to a manager
    managerId: (u.role.name === 'ADMIN' || u.role.name === 'RH')
      ? null
      : (u.employee?.managerId ?? null),
  }));

  res.json(nodes);
}
