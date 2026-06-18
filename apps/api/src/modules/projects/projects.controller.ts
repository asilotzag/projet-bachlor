import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import * as notifSvc from '../../services/notificationService.js';

const projectInclude = {
  manager: { select: { id: true, fullName: true } },
  members: { include: { user: { select: { id: true, fullName: true, email: true } } } },
  _count: { select: { tasks: true } },
} as const;

// Includes task statuses so the frontend can render a progress bar
const projectListInclude = {
  manager: { select: { id: true, fullName: true } },
  members: { include: { user: { select: { id: true, fullName: true, email: true } } } },
  _count: { select: { tasks: true } },
  tasks: { select: { status: true } },
} as const;

const ProjectSchema = z.object({
  name:        z.string().min(1).max(120),
  description: z.string().optional(),
  color:       z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  dueDate:     z.string().datetime().optional().nullable(),
  status:      z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
});

export async function listProjects(req: Request, res: Response): Promise<void> {
  const { role, userId } = req.user!;
  // ADMIN/RH see everything; MANAGER and EMPLOYÉ see only managed or member projects
  const where = (role === 'ADMIN' || role === 'RH')
    ? {}
    : { OR: [{ managerId: userId }, { members: { some: { userId } } }] };

  const projects = await prisma.project.findMany({
    where,
    include: projectListInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(projects);
}

export async function getProject(req: Request, res: Response): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      ...projectInclude,
      tasks: {
        include: {
          assignee: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { comments: true } },
        },
        orderBy: [{ status: 'asc' }, { position: 'asc' }],
      },
    },
  });
  if (!project) { res.status(404).json({ message: 'Projet introuvable' }); return; }

  const { userId, role } = req.user!;
  if (role !== 'ADMIN' && role !== 'RH') {
    const isMember = project.members.some((m: { userId: string }) => m.userId === userId);
    const isManager = project.managerId === userId;
    if (!isMember && !isManager) {
      res.status(403).json({ message: 'Accès non autorisé' }); return;
    }
  }

  res.json(project);
}

export async function createProject(req: Request, res: Response): Promise<void> {
  const parsed = ProjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() }); return; }

  const project = await prisma.project.create({
    data: { ...parsed.data, managerId: req.user!.userId },
    include: projectInclude,
  });
  res.status(201).json(project);
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  const parsed = ProjectSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: projectInclude,
  });
  res.json(project);
}

export async function deleteProject(req: Request, res: Response): Promise<void> {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

export async function addMember(req: Request, res: Response): Promise<void> {
  const { userId } = z.object({ userId: z.string() }).parse(req.body);
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: req.params.id, userId } },
    create: { projectId: req.params.id, userId },
    update: {},
  });
  res.status(201).json({ message: 'Membre ajouté' });

  // Notification: new project member
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { name: true },
  });
  if (project && userId !== req.user!.userId) {
    void notifSvc.createNotification(
      userId,
      'PROJECT_MEMBER_ADDED',
      'Ajouté à un projet',
      `Vous avez été ajouté au projet "${project.name}"`,
      '/tasks',
    );
  }
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } },
  });
  res.status(204).end();
}
