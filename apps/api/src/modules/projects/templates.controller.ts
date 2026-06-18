import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';

export async function listTemplates(_req: Request, res: Response): Promise<void> {
  const templates = await prisma.projectTemplate.findMany({
    include: { tasks: { orderBy: { dayOffset: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  res.json(templates);
}

export async function getTemplate(req: Request, res: Response): Promise<void> {
  const t = await prisma.projectTemplate.findUnique({
    where: { id: req.params.id },
    include: { tasks: { orderBy: { dayOffset: 'asc' } } },
  });
  if (!t) { res.status(404).json({ message: 'Template introuvable' }); return; }
  res.json(t);
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const { name, description, color, tasks = [] } = req.body;
  const template = await prisma.projectTemplate.create({
    data: {
      name,
      description: description ?? null,
      color: color ?? '#3B82F6',
      tasks: {
        create: tasks.map((t: any) => ({
          title: t.title,
          description: t.description ?? null,
          priority: t.priority ?? 'MEDIUM',
          dayOffset: t.dayOffset ?? 0,
        })),
      },
    },
    include: { tasks: true },
  });
  res.status(201).json(template);
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  await prisma.projectTemplate.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

export async function createProjectFromTemplate(req: Request, res: Response): Promise<void> {
  const { templateId } = req.params;
  const { name, description, dueDate, managerId } = req.body;

  const template = await prisma.projectTemplate.findUnique({
    where: { id: templateId },
    include: { tasks: true },
  });
  if (!template) { res.status(404).json({ message: 'Template introuvable' }); return; }

  const effectiveManagerId = managerId ?? req.user!.userId;
  const startDate = new Date();

  const project = await prisma.project.create({
    data: {
      name: name ?? template.name,
      description: description ?? template.description,
      color: template.color,
      dueDate: dueDate ? new Date(dueDate) : null,
      managerId: effectiveManagerId,
      tasks: {
        create: template.tasks.map((t) => ({
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: 'TODO',
          createdById: req.user!.userId,
          dueDate: new Date(startDate.getTime() + t.dayOffset * 86400000),
        })),
      },
    },
    include: {
      manager: { select: { id: true, fullName: true } },
      _count: { select: { tasks: true } },
    },
  });

  res.status(201).json(project);
}
