import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import * as notifSvc from '../../services/notificationService.js';

const taskInclude = {
  assignee:  { select: { id: true, fullName: true, role: { select: { name: true } } } },
  createdBy: { select: { id: true, fullName: true, role: { select: { name: true } } } },
  _count:    { select: { comments: true } },
} as const;

const TaskSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  status:      z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']).optional(),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate:     z.string().datetime().optional().nullable(),
  assigneeId:  z.string().optional().nullable(),
  projectId:   z.string().optional().nullable(),
});

const UpdateTaskSchema = TaskSchema.partial().omit({ projectId: true });

const AssigneeUpdateSchema = z.object({
  assigneeNotes:  z.string().optional().nullable(),
  assigneeStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).optional(),
});

// ── PERMISSION HELPERS ────────────────────────────────────────────────────────

async function canAssignTask(
  assignerId: string,
  assignerRole: string,
  assigneeId: string | null | undefined,
): Promise<{ allowed: boolean; message?: string }> {
  // Employees cannot assign tasks
  if (assignerRole === 'EMPLOYE') {
    return { allowed: false, message: 'Les employés ne peuvent pas assigner des tâches' };
  }

  if (!assigneeId) {
    return { allowed: true };
  }

  // Admin can assign to anyone
  if (assignerRole === 'ADMIN') {
    return { allowed: true };
  }

  // Get assignee info
  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    include: { role: true },
  });

  if (!assignee) {
    return { allowed: false, message: 'Utilisateur cible introuvable' };
  }

  // RH can assign to anyone except ADMIN
  if (assignerRole === 'RH') {
    if (assignee.role.name === 'ADMIN') {
      return { allowed: false, message: 'Les RH ne peuvent pas assigner des tâches aux administrateurs' };
    }
    return { allowed: true };
  }

  // Manager can only assign to their supervised employees
  if (assignerRole === 'MANAGER') {
    const supervised = await prisma.employee.findUnique({
      where: { userId: assigneeId },
    });

    if (!supervised) {
      return { allowed: false, message: 'Cet utilisateur n\'est pas un employé' };
    }

    if (supervised.managerId !== assignerId) {
      return { allowed: false, message: 'Vous ne pouvez assigner des tâches qu\'à vos employés supervisés' };
    }

    return { allowed: true };
  }

  return { allowed: false, message: 'Permission non reconnue' };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function buildTaskVisibilityFilter(userId: string, role: string): Promise<any> {
  if (role === 'ADMIN' || role === 'RH') return {};
  if (role === 'MANAGER') {
    const supervised = await prisma.employee.findMany({
      where: { managerId: userId },
      select: { userId: true },
    });
    const supervisedIds = supervised.map((e) => e.userId);
    return {
      OR: [
        { assigneeId: userId },
        { createdById: userId },
        ...(supervisedIds.length ? [{ assigneeId: { in: supervisedIds } }] : []),
      ],
    };
  }
  // EMPLOYE: own tasks only
  return { OR: [{ assigneeId: userId }, { createdById: userId }] };
}

// ── LIST ──────────────────────────────────────────────────────────────────────

export async function listTasks(req: Request, res: Response): Promise<void> {
  const { projectId, status } = req.query as Record<string, string>;
  const { userId, role } = req.user!;

  const visibility = await buildTaskVisibilityFilter(userId, role);

  const tasks = await prisma.task.findMany({
    where: {
      ...visibility,
      ...(projectId ? { projectId } : {}),
      ...(status    ? { status: status as any } : {}),
    },
    include: taskInclude,
    orderBy: [{ status: 'asc' }, { position: 'asc' }],
  });
  res.json(tasks);
}

// ── GET ONE ───────────────────────────────────────────────────────────────────

export async function getTask(req: Request, res: Response): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: {
      ...taskInclude,
      comments: {
        include: { author: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!task) { res.status(404).json({ message: 'Tâche introuvable' }); return; }

  const { userId, role } = req.user!;
  if (role !== 'ADMIN' && role !== 'RH') {
    const isDirectParticipant = task.assigneeId === userId || task.createdById === userId;
    let allowed = isDirectParticipant;
    if (!allowed && role === 'MANAGER' && task.assigneeId) {
      const emp = await prisma.employee.findUnique({
        where: { userId: task.assigneeId },
        select: { managerId: true },
      });
      allowed = emp?.managerId === userId;
    }
    if (!allowed) { res.status(403).json({ message: 'Accès non autorisé' }); return; }
  }

  res.json(task);
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function createTask(req: Request, res: Response): Promise<void> {
  const parsed = TaskSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() }); return; }

  // Get creator's role
  const creator = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { role: true },
  });

  if (!creator) {
    res.status(401).json({ message: 'Utilisateur non trouvé' });
    return;
  }

  // Check assignment permissions
  const canAssign = await canAssignTask(creator.id, creator.role.name, parsed.data.assigneeId);
  if (!canAssign.allowed) {
    res.status(403).json({ message: canAssign.message });
    return;
  }

  const lastTask = await prisma.task.findFirst({
    where: { 
      projectId: parsed.data.projectId ?? null, 
      status: parsed.data.status ?? 'TODO' 
    },
    orderBy: { position: 'desc' },
  });

  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      createdById: req.user!.userId,
      position: (lastTask?.position ?? -1) + 1,
    },
    include: taskInclude,
  });
  res.status(201).json(task);
  notifSvc.broadcastEvent('analytics_refresh', {});

  // Notification: task assigned
  if (task.assigneeId && task.assigneeId !== req.user!.userId) {
    const projectLink = task.projectId ? `/tasks` : `/tasks`;
    void notifSvc.createNotification(
      task.assigneeId,
      'TASK_ASSIGNED',
      'Nouvelle tâche assignée',
      `"${task.title}" vous a été assignée par ${creator.fullName}`,
      projectLink,
    );
  }
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

export async function updateTask(req: Request, res: Response): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { createdBy: { include: { role: true } } },
  });

  if (!task) {
    res.status(404).json({ message: 'Tâche introuvable' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { role: true },
  });

  if (!user) {
    res.status(401).json({ message: 'Utilisateur non trouvé' });
    return;
  }

  // Parse the update request
  const bodySchema = UpdateTaskSchema.merge(AssigneeUpdateSchema);
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() });
    return;
  }

  // If updating assignee, check permissions
  if (parsed.data.assigneeId !== undefined) {
    const canAssign = await canAssignTask(user.id, user.role.name, parsed.data.assigneeId);
    if (!canAssign.allowed) {
      res.status(403).json({ message: canAssign.message });
      return;
    }
  }

  // If updating Kanban status, only assignee, creator or admin can do it
  if (parsed.data.status !== undefined) {
    const isAssignee = task.assigneeId === user.id;
    const isCreator  = task.createdById === user.id;
    const isAdmin    = user.role.name === 'ADMIN';
    if (!isAssignee && !isCreator && !isAdmin) {
      res.status(403).json({ message: "Seul l'assigné, le créateur ou un admin peut changer le statut" });
      return;
    }
  }

  // If updating assignee status/notes, only assignee or task creator or admin can do it
  if (parsed.data.assigneeNotes !== undefined || parsed.data.assigneeStatus !== undefined) {
    const isAssignee = task.assigneeId === user.id;
    const isCreator = task.createdById === user.id;
    const isAdmin = user.role.name === 'ADMIN';

    if (!isAssignee && !isCreator && !isAdmin) {
      res.status(403).json({ message: 'Seul l\'assigné, le créateur ou un admin peut mettre à jour le statut' });
      return;
    }
  }

  const updatedTask = await prisma.task.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: taskInclude,
  });
  res.json(updatedTask);
  notifSvc.broadcastEvent('analytics_refresh', {});
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function deleteTask(req: Request, res: Response): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
  });

  if (!task) {
    res.status(404).json({ message: 'Tâche introuvable' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { role: true },
  });

  if (!user) {
    res.status(401).json({ message: 'Utilisateur non trouvé' });
    return;
  }

  // Only task creator or admin can delete
  if (task.createdById !== user.id && user.role.name !== 'ADMIN') {
    res.status(403).json({ message: 'Seul le créateur ou un admin peut supprimer cette tâche' });
    return;
  }

  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

// ── REORDER (Kanban drag & drop) ──────────────────────────────────────────────

const ReorderSchema = z.object({
  taskId:      z.string(),
  newStatus:   z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']),
  newPosition: z.number().int().min(0),
});

export async function reorderTasks(req: Request, res: Response): Promise<void> {
  const parsed = ReorderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }

  const { taskId, newStatus, newPosition } = parsed.data;

  // Only assignee, creator or ADMIN can move tasks
  const taskForAuth = await prisma.task.findUnique({ where: { id: taskId }, select: { assigneeId: true, createdById: true } });
  if (!taskForAuth) { res.status(404).json({ message: 'Tâche introuvable' }); return; }
  const { userId, role } = req.user!;
  if (taskForAuth.assigneeId !== userId && taskForAuth.createdById !== userId && role !== 'ADMIN') {
    res.status(403).json({ message: "Seul l'assigné, le créateur ou un admin peut déplacer cette tâche" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });

    // Décale les tâches dans la colonne cible pour faire de la place.
    await tx.task.updateMany({
      where: { projectId: task.projectId, status: newStatus, position: { gte: newPosition }, id: { not: taskId } },
      data: { position: { increment: 1 } },
    });

    await tx.task.update({
      where: { id: taskId },
      data: { status: newStatus, position: newPosition },
    });
  });

  res.json({ message: 'Réordonné' });
  notifSvc.broadcastEvent('analytics_refresh', {});

  // Notification: task moved — notify creator + project manager (excluding mover)
  const movedTask = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      project: { select: { managerId: true } },
    },
  });
  if (movedTask) {
    const moverName = (await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }))?.fullName ?? 'Quelqu\'un';
    const LABEL: Record<string, string> = { TODO: 'À faire', IN_PROGRESS: 'En cours', REVIEW: 'En révision', DONE: 'Terminé' };
    const recipients = [...new Set([
      movedTask.createdById,
      movedTask.project?.managerId,
    ].filter((id): id is string => !!id && id !== userId))];
    void notifSvc.createBulkNotifications(
      recipients,
      'TASK_MOVED',
      'Tâche déplacée',
      `"${movedTask.title}" a été déplacée vers "${LABEL[newStatus] ?? newStatus}" par ${moverName}`,
      '/tasks',
    );
  }
}

// ── COMMENTS ──────────────────────────────────────────────────────────────────

export async function listComments(req: Request, res: Response): Promise<void> {
  const comments = await prisma.comment.findMany({
    where: { taskId: req.params.id },
    include: { author: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(comments);
}

export async function addComment(req: Request, res: Response): Promise<void> {
  const { content } = z.object({ content: z.string().min(1) }).parse(req.body);
  const comment = await prisma.comment.create({
    data: { content, taskId: req.params.id, authorId: req.user!.userId },
    include: { author: { select: { id: true, fullName: true } } },
  });
  res.status(201).json(comment);

  // Notification: comment added — notify assignee + task creator (excluding commenter)
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    select: { title: true, assigneeId: true, createdById: true },
  });
  if (task) {
    const recipients = [...new Set([task.assigneeId, task.createdById]
      .filter((id): id is string => !!id && id !== req.user!.userId))];
    void notifSvc.createBulkNotifications(
      recipients,
      'TASK_COMMENT',
      'Nouveau commentaire',
      `${comment.author.fullName} a commenté "${task.title}" : "${content.slice(0, 80)}${content.length > 80 ? '…' : ''}"`,
      '/tasks',
    );
  }
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
  if (!comment) { res.status(404).json({ message: 'Commentaire introuvable' }); return; }
  if (comment.authorId !== req.user!.userId && req.user!.role !== 'ADMIN') {
    res.status(403).json({ message: 'Non autorisé' }); return;
  }
  await prisma.comment.delete({ where: { id: req.params.commentId } });
  res.status(204).end();
}
