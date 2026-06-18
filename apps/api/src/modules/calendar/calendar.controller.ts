import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';

export interface CalendarEvent {
  id: string;
  type: 'TASK' | 'LEAVE' | 'CONTRACT' | 'MEETING';
  title: string;
  start: string;
  end?: string;
  status?: string;
  link: string;
  ownerId?: string;
}

// ── GET /api/calendar/events?from=&to= ────────────────────────────────────────

export async function getCalendarEvents(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const from = new Date(req.query.from as string);
  const to   = new Date(req.query.to   as string);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    res.status(400).json({ message: 'Paramètres from/to invalides' });
    return;
  }

  // Determine which user IDs this user can see (null = all users)
  let scopedIds: string[] | null = null;
  if (role !== 'ADMIN' && role !== 'RH') {
    if (role === 'MANAGER') {
      const supervised = await prisma.employee.findMany({
        where: { managerId: userId },
        select: { userId: true },
      });
      scopedIds = [userId, ...supervised.map((e) => e.userId)];
    } else {
      scopedIds = [userId];
    }
  }

  const events: CalendarEvent[] = [];

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { gte: from, lte: to },
      ...(scopedIds
        ? { assigneeId: { in: scopedIds } }
        : { assigneeId: { not: null } }),
    },
    select: { id: true, title: true, dueDate: true, status: true, assigneeId: true },
  });

  for (const t of tasks) {
    if (!t.dueDate) continue;
    events.push({
      id:      `task-${t.id}`,
      type:    'TASK',
      title:   t.title,
      start:   t.dueDate.toISOString(),
      status:  t.status,
      link:    '/tasks',
      ownerId: t.assigneeId ?? undefined,
    });
  }

  // ── Leave Requests ─────────────────────────────────────────────────────────
  const leaveFilter = scopedIds
    ? { employee: { userId: { in: scopedIds } } }
    : {};

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      startDate: { lte: to },
      endDate:   { gte: from },
      ...leaveFilter,
    },
    include: {
      employee: { include: { user: { select: { id: true, fullName: true } } } },
    },
  });

  for (const l of leaves) {
    events.push({
      id:      `leave-${l.id}`,
      type:    'LEAVE',
      title:   `Congé — ${l.employee.user.fullName}`,
      start:   l.startDate.toISOString(),
      end:     l.endDate.toISOString(),
      status:  l.status,
      link:    '/hr',
      ownerId: l.employee.userId,
    });
  }

  // ── Contracts ──────────────────────────────────────────────────────────────
  const contractFilter = scopedIds
    ? { employee: { userId: { in: scopedIds } } }
    : {};

  const contracts = await prisma.contract.findMany({
    where: {
      endDate:  { gte: from, lte: to },
      isActive: true,
      ...contractFilter,
    },
    include: {
      employee: { include: { user: { select: { id: true, fullName: true } } } },
    },
  });

  for (const c of contracts) {
    if (!c.endDate) continue;
    events.push({
      id:      `contract-${c.id}`,
      type:    'CONTRACT',
      title:   `Fin contrat — ${c.employee.user.fullName}`,
      start:   c.endDate.toISOString(),
      status:  c.type,
      link:    '/hr',
      ownerId: c.employee.userId,
    });
  }

  // ── Meetings ───────────────────────────────────────────────────────────────
  const meetingWhere =
    role === 'ADMIN' || role === 'RH'
      ? { startAt: { lte: to }, endAt: { gte: from } }
      : {
          startAt: { lte: to },
          endAt:   { gte: from },
          OR: [
            { createdById: userId },
            { attendees: { some: { userId } } },
          ],
        };

  const meetings = await prisma.meeting.findMany({
    where: meetingWhere,
    select: {
      id: true, title: true, startAt: true, endAt: true, location: true, createdById: true,
    },
  });

  for (const m of meetings) {
    events.push({
      id:      `meeting-${m.id}`,
      type:    'MEETING',
      title:   m.title,
      start:   m.startAt.toISOString(),
      end:     m.endAt.toISOString(),
      link:    `/calendar?meetingId=${m.id}`,
      ownerId: m.createdById,
    });
  }

  res.json(events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
}
