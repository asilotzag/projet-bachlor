import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';

const Schema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function listCategories(_req: Request, res: Response): Promise<void> {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { documents: true } } },
  });
  res.json(categories);
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() }); return; }
  const cat = await prisma.category.create({ data: parsed.data });
  res.status(201).json(cat);
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const parsed = Schema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }
  const cat = await prisma.category.update({ where: { id: Number(req.params.id) }, data: parsed.data });
  res.json(cat);
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  await prisma.category.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}
