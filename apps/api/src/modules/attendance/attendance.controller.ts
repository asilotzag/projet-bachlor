import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import * as notifSvc from '../../services/notificationService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const employeeInclude = {
  user:       { select: { id: true, fullName: true } },
  department: { select: { id: true, name: true } },
} as const;

// ── GET /api/attendance/today ─────────────────────────────────────────────────

export async function getToday(_req: Request, res: Response): Promise<void> {
  const today = todayUTC();

  const employees = await prisma.employee.findMany({
    where: { user: { isActive: true } },
    include: {
      ...employeeInclude,
      attendances: { where: { date: today }, take: 1 },
    },
    orderBy: { user: { fullName: 'asc' } },
  });

  res.json(
    employees.map((emp) => ({
      employeeId:  emp.id,
      fullName:    emp.user.fullName,
      department:  emp.department?.name ?? null,
      attendance:  emp.attendances[0] ?? null,
    })),
  );
}

// ── POST /api/attendance/batch ────────────────────────────────────────────────

const RecordSchema = z.object({
  employeeId: z.string(),
  status:     z.enum(['PRESENT', 'ABSENT', 'RETARD', 'DEMI_JOURNEE']),
  checkIn:    z.string().datetime().optional().nullable(),
  checkOut:   z.string().datetime().optional().nullable(),
  notes:      z.string().optional().nullable(),
});

const BatchSchema = z.object({ records: z.array(RecordSchema).min(1) });

export async function batchUpsert(req: Request, res: Response): Promise<void> {
  const parsed = BatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() });
    return;
  }

  const today = todayUTC();

  await Promise.all(
    parsed.data.records.map(({ employeeId, status, checkIn, checkOut, notes }) =>
      prisma.attendance.upsert({
        where:  { employeeId_date: { employeeId, date: today } },
        create: {
          employeeId, date: today, status,
          checkIn:  checkIn  ? new Date(checkIn)  : null,
          checkOut: checkOut ? new Date(checkOut) : null,
          notes,
        },
        update: {
          status,
          checkIn:  checkIn  ? new Date(checkIn)  : null,
          checkOut: checkOut ? new Date(checkOut) : null,
          notes,
        },
      }),
    ),
  );

  // Anomaly notifications (ABSENT / RETARD) — fire-and-forget
  for (const rec of parsed.data.records) {
    if (rec.status !== 'ABSENT' && rec.status !== 'RETARD') continue;
    const emp = await prisma.employee.findUnique({
      where:  { id: rec.employeeId },
      select: { userId: true, managerId: true, user: { select: { fullName: true } } },
    });
    if (!emp) continue;
    const label   = rec.status === 'ABSENT' ? 'absent(e)' : 'en retard';
    const dateStr = today.toLocaleDateString('fr-FR');
    const recipients = [emp.userId, emp.managerId].filter((id): id is string => !!id);
    void notifSvc.createBulkNotifications(
      recipients,
      'ATTENDANCE_ANOMALY',
      'Anomalie de présence',
      `${emp.user.fullName} était ${label} le ${dateStr}`,
      '/attendance',
    );
  }

  res.json({ saved: parsed.data.records.length });
}

// ── GET /api/attendance/history ───────────────────────────────────────────────

export async function getHistory(req: Request, res: Response): Promise<void> {
  const { from, to, employeeId, departmentId, status } = req.query as Record<string, string>;

  const where: any = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to)   where.date.lte = new Date(to);
  }
  if (employeeId)   where.employeeId = employeeId;
  if (departmentId) where.employee   = { departmentId: Number(departmentId) };
  if (status)       where.status     = status;

  const records = await prisma.attendance.findMany({
    where,
    include: {
      employee: {
        include: {
          user:       { select: { id: true, fullName: true } },
          department: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ date: 'desc' }, { employee: { user: { fullName: 'asc' } } }],
    take: 500,
  });

  res.json(records);
}
