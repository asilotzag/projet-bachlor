import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function submitWellness(req: Request, res: Response): Promise<void> {
  const { score, comment } = req.body;
  if (typeof score !== 'number' || score < 1 || score > 10) {
    res.status(400).json({ message: 'Score invalide (1–10)' });
    return;
  }

  const week = getMondayOfWeek(new Date());

  const response = await prisma.wellnessResponse.upsert({
    where: { userId_week: { userId: req.user!.userId, week } },
    update: { score, comment: comment ?? null },
    create: { userId: req.user!.userId, week, score, comment: comment ?? null },
  });

  res.json(response);
}

export async function getMyWellness(req: Request, res: Response): Promise<void> {
  const responses = await prisma.wellnessResponse.findMany({
    where: { userId: req.user!.userId },
    orderBy: { week: 'desc' },
    take: 12,
  });
  res.json(responses);
}

export async function getTeamWellness(req: Request, res: Response): Promise<void> {
  const { role, userId } = req.user!;

  let userIds: string[] | undefined;

  if (role === 'MANAGER') {
    const supervised = await prisma.employee.findMany({
      where: { managerId: userId },
      select: { userId: true },
    });
    userIds = [userId, ...supervised.map((e) => e.userId)];
  }

  const from = new Date();
  from.setDate(from.getDate() - 84);

  const responses = await prisma.wellnessResponse.findMany({
    where: {
      week: { gte: from },
      ...(userIds ? { userId: { in: userIds } } : {}),
    },
    include: { user: { select: { fullName: true } } },
    orderBy: { week: 'desc' },
  });

  const byWeek: Record<string, { week: string; avg: number; count: number; scores: number[] }> = {};
  for (const r of responses) {
    const key = r.week.toISOString().slice(0, 10);
    if (!byWeek[key]) byWeek[key] = { week: key, avg: 0, count: 0, scores: [] };
    byWeek[key].scores.push(r.score);
    byWeek[key].count++;
  }
  for (const w of Object.values(byWeek)) {
    w.avg = Math.round((w.scores.reduce((a, b) => a + b, 0) / w.scores.length) * 10) / 10;
  }

  const thisWeek = getMondayOfWeek(new Date()).toISOString().slice(0, 10);
  const currentAvg = byWeek[thisWeek]?.avg ?? null;

  res.json({
    currentWeekAvg: currentAvg,
    history: Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week)),
    respondedThisWeek: responses.filter((r) => r.week.toISOString().slice(0, 10) === thisWeek).length,
  });
}

export async function checkWellnessStatus(req: Request, res: Response): Promise<void> {
  const week = getMondayOfWeek(new Date());
  const existing = await prisma.wellnessResponse.findUnique({
    where: { userId_week: { userId: req.user!.userId, week } },
  });
  res.json({ responded: !!existing, score: existing?.score ?? null });
}
