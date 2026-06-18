import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';

const Schema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function listTags(_req: Request, res: Response): Promise<void> {
  const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
  res.json(tags);
}

export async function createTag(req: Request, res: Response): Promise<void> {
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }
  const tag = await prisma.tag.create({ data: parsed.data });
  res.status(201).json(tag);
}

export async function deleteTag(req: Request, res: Response): Promise<void> {
  await prisma.tag.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}
