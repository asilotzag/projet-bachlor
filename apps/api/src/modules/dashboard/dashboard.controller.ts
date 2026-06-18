import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';

// ─── Home dashboard (role-specific) ─────────────────────────────────────────

export async function getHomeDashboard(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;

  // ── ADMIN ────────────────────────────────────────────────────────────────
  if (role === 'ADMIN') {
    const [totalUsers, activeProjects, pendingLeaves, storageAgg, recentDocs, recentTasks, recentLeaves] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.leaveRequest.count({ where: { status: 'EN_ATTENTE' } }),
      prisma.document.aggregate({ _sum: { size: true } }),
      prisma.document.findMany({
        take: 5, orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, uploadedBy: { select: { fullName: true } }, createdAt: true },
      }),
      prisma.task.findMany({
        take: 5, orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, status: true, updatedAt: true, assignee: { select: { fullName: true } } },
      }),
      prisma.leaveRequest.findMany({
        take: 5, orderBy: { createdAt: 'desc' },
        include: { employee: { include: { user: { select: { fullName: true } } } } },
      }),
    ]);

    const activity = [
      ...recentDocs.map((d) => ({
        kind: 'doc' as const, id: d.id, title: d.title,
        actor: d.uploadedBy.fullName, at: d.createdAt.toISOString(), link: '/documents',
      })),
      ...recentTasks.map((t) => ({
        kind: 'task' as const, id: t.id, title: t.title,
        actor: t.assignee?.fullName ?? '—', at: t.updatedAt.toISOString(), link: '/tasks', extra: t.status,
      })),
      ...recentLeaves.map((l) => ({
        kind: 'leave' as const, id: String(l.id), title: `Congé — ${l.employee.user.fullName}`,
        actor: l.employee.user.fullName, at: l.createdAt.toISOString(), link: '/hr', extra: l.status,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10);

    res.json({ role: 'ADMIN', totalUsers, activeProjects, pendingLeaves, storageBytes: storageAgg._sum.size ?? 0, activity });
    return;
  }

  // ── RH ───────────────────────────────────────────────────────────────────
  if (role === 'RH') {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [employees, pendingLeaves, expiringContracts] = await Promise.all([
      prisma.employee.findMany({
        where: { user: { isActive: true } },
        include: {
          user: { select: { id: true, fullName: true } },
          department: { select: { name: true } },
          attendances: { where: { date: todayUTC }, take: 1 },
        },
        orderBy: { user: { fullName: 'asc' } },
      }),
      prisma.leaveRequest.findMany({
        where: { status: 'EN_ATTENTE' },
        orderBy: { createdAt: 'asc' },
        include: { employee: { include: { user: { select: { id: true, fullName: true } } } } },
        take: 20,
      }),
      prisma.contract.findMany({
        where: { endDate: { gte: todayUTC, lte: monthEnd }, isActive: true },
        include: {
          employee: {
            include: {
              user: { select: { id: true, fullName: true } },
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { endDate: 'asc' },
      }),
    ]);

    res.json({
      role: 'RH',
      attendance: employees.map((e) => ({
        employeeId: e.id,
        userId: e.userId,
        fullName: e.user.fullName,
        department: e.department?.name ?? null,
        attendance: e.attendances[0] ? { status: e.attendances[0].status } : null,
      })),
      pendingLeaves,
      expiringContracts,
    });
    return;
  }

  // ── MANAGER ──────────────────────────────────────────────────────────────
  if (role === 'MANAGER') {
    const supervised = await prisma.employee.findMany({
      where: { managerId: userId },
      select: { userId: true },
    });
    const teamIds = [userId, ...supervised.map((e) => e.userId)];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    nextWeek.setHours(23, 59, 59, 999);

    const [projects, teamTaskGroups, upcomingDeadlines] = await Promise.all([
      prisma.project.findMany({
        where: { managerId: userId },
        include: { tasks: { select: { status: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: { assigneeId: { in: teamIds } },
        _count: { id: true },
      }),
      prisma.task.findMany({
        where: { dueDate: { gte: today, lte: nextWeek }, status: { not: 'DONE' }, assigneeId: { in: teamIds } },
        orderBy: { dueDate: 'asc' },
        select: { id: true, title: true, dueDate: true, priority: true, status: true, assignee: { select: { fullName: true } } },
        take: 15,
      }),
    ]);

    res.json({
      role: 'MANAGER',
      projects: projects.map((p) => ({
        id: p.id, name: p.name, status: p.status, color: p.color,
        totalTasks: p.tasks.length,
        doneTasks: p.tasks.filter((t) => t.status === 'DONE').length,
      })),
      teamTasksSummary: Object.fromEntries(teamTaskGroups.map((g) => [g.status, g._count.id])),
      upcomingDeadlines,
    });
    return;
  }

  // ── EMPLOYE ──────────────────────────────────────────────────────────────
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  nextWeek.setHours(23, 59, 59, 999);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [myTasks, approvedLeaves, upcomingMeetings, unreadNotifications] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: userId, status: { not: 'DONE' } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: { employee: { userId }, status: 'APPROUVE', startDate: { gte: yearStart } },
      select: { startDate: true, endDate: true, type: true },
    }),
    prisma.meeting.findMany({
      where: {
        OR: [{ createdById: userId }, { attendees: { some: { userId } } }],
        startAt: { gte: today, lte: nextWeek },
      },
      orderBy: { startAt: 'asc' },
      select: { id: true, title: true, startAt: true, endAt: true, location: true },
      take: 5,
    }),
    prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  let leaveDaysUsed = 0;
  for (const leave of approvedLeaves) {
    if (leave.type === 'CONGE_PAYE') {
      leaveDaysUsed += Math.round((leave.endDate.getTime() - leave.startDate.getTime()) / 86_400_000) + 1;
    }
  }

  res.json({
    role: 'EMPLOYE',
    myTasks,
    leaveBalance: { used: leaveDaysUsed, total: 25 },
    upcomingMeetings,
    unreadNotifications,
  });
}

// ─── Admin rich dashboard ─────────────────────────────────────────────────────

export async function getAdminDashboard(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const next30 = new Date(now.getTime() + 30 * 86400000);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    totalEmployes, totalManagers, projetsActifs, docsAgg, congesEnAttente, tachesOuvertes,
    evolutionEmployes, repartitionProjets, productiviteParDept, presencesRaw,
    recentDocs, recentTasks, contratsExpirant, projetsEnRetardData, congesAValider,
  ] = await Promise.all([
    prisma.employee.count({ where: { user: { isActive: true } } }),
    prisma.user.count({ where: { role: { name: 'MANAGER' }, isActive: true } }),
    prisma.project.count({ where: { status: 'ACTIVE' } }),
    prisma.document.aggregate({ _sum: { size: true }, _count: { id: true } }),
    prisma.leaveRequest.count({ where: { status: 'EN_ATTENTE' } }),
    prisma.task.count({ where: { status: { not: 'DONE' } } }),
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR("hireDate", 'YYYY-MM') AS month, COUNT(*) AS count
      FROM "Employee" WHERE "hireDate" >= ${sixMonthsAgo}
      GROUP BY month ORDER BY month`,
    prisma.project.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.$queryRaw<{ dept: string; done: bigint }[]>`
      SELECT COALESCE(d.name, 'Sans département') AS dept, COUNT(t.id) AS done
      FROM "Task" t
      LEFT JOIN "Employee" e ON e."userId" = t."assigneeId"
      LEFT JOIN "Department" d ON d.id = e."departmentId"
      WHERE t.status = 'DONE'
      GROUP BY dept ORDER BY done DESC LIMIT 8`,
    prisma.$queryRaw<{ month: string; status: string; count: bigint }[]>`
      SELECT TO_CHAR(date, 'YYYY-MM') AS month, status, COUNT(*) AS count
      FROM "Attendance" WHERE date >= ${sixMonthsAgo}
      GROUP BY month, status ORDER BY month`,
    prisma.document.findMany({
      take: 5, orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true, uploadedBy: { select: { fullName: true } }, category: { select: { name: true } } },
    }),
    prisma.task.findMany({
      take: 5, orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, status: true, updatedAt: true, assignee: { select: { fullName: true } } },
    }),
    prisma.contract.findMany({
      where: { endDate: { gte: now, lte: next30 }, isActive: true },
      include: { employee: { include: { user: { select: { fullName: true } }, department: { select: { name: true } } } } },
      orderBy: { endDate: 'asc' }, take: 10,
    }),
    prisma.project.findMany({
      where: { status: 'ACTIVE', tasks: { some: { status: { not: 'DONE' }, dueDate: { lt: now } } } },
      include: { tasks: { where: { status: { not: 'DONE' }, dueDate: { lt: now } }, select: { dueDate: true } }, manager: { select: { fullName: true } } },
      take: 5,
    }),
    prisma.leaveRequest.findMany({
      where: { status: 'EN_ATTENTE' },
      include: { employee: { include: { user: { select: { id: true, fullName: true } } } } },
      orderBy: { createdAt: 'asc' }, take: 10,
    }),
  ]);

  const monthsSet = new Set<string>();
  for (const r of presencesRaw) monthsSet.add(r.month);
  const presencesMensuelles = Array.from(monthsSet).sort().map((month) => {
    const entry: Record<string, any> = { month };
    for (const r of presencesRaw) { if (r.month === month) entry[r.status] = Number(r.count); }
    return entry;
  });

  const recentActivity = [
    ...recentDocs.map((d) => ({ kind: 'doc' as const, id: d.id, title: d.title, actor: d.uploadedBy.fullName, at: d.createdAt.toISOString(), extra: d.category?.name })),
    ...recentTasks.map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, actor: t.assignee?.fullName ?? '—', at: t.updatedAt.toISOString(), extra: t.status })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);

  res.json({
    kpis: { totalEmployes, totalManagers, projetsActifs, docsCount: docsAgg._count.id, docsBytes: docsAgg._sum.size ?? 0, congesEnAttente, tachesOuvertes },
    charts: {
      evolutionEmployes: evolutionEmployes.map((r) => ({ month: r.month, count: Number(r.count) })),
      repartitionProjets: repartitionProjets.map((r) => ({ status: r.status, count: r._count.id })),
      productiviteParDept: (productiviteParDept as any[]).map((r) => ({ dept: r.dept, done: Number(r.done) })),
      presencesMensuelles,
    },
    widgets: {
      recentActivity,
      derniersDocuments: recentDocs.map((d) => ({ id: d.id, title: d.title, by: d.uploadedBy.fullName, category: d.category?.name ?? null, at: d.createdAt.toISOString() })),
      contratsExpirant: contratsExpirant.map((c) => ({ id: c.id, type: c.type, endDate: (c.endDate as Date).toISOString(), employee: { fullName: c.employee.user.fullName, dept: c.employee.department?.name ?? null } })),
      projetsEnRetard: projetsEnRetardData.map((p) => ({
        id: p.id, name: p.name, manager: p.manager.fullName, overdueCount: p.tasks.length,
        maxDaysLate: Math.max(0, ...p.tasks.map((t) => Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / 86400000))),
      })),
      congesAValider: congesAValider.map((l) => ({ id: l.id, type: l.type, reason: l.reason ?? null, startDate: l.startDate.toISOString(), endDate: l.endDate.toISOString(), employee: { fullName: l.employee.user.fullName } })),
    },
  });
}

// ─── RH rich dashboard ────────────────────────────────────────────────────────

export async function getRHDashboard(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const weekDay = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - weekDay); weekStart.setHours(0, 0, 0, 0);
  const last30 = new Date(now.getTime() - 30 * 86400000);
  const last6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const next60 = new Date(now.getTime() + 60 * 86400000);

  const [
    totalEmployes, attendanceToday, congesEnAttente, contratsExpirantCeMois,
    congesAValider, nouveauxEmployes, allEmployesBirthday, contratsARenouveler,
    presenceSemaineRaw, absenteismeRaw, repartitionConges, evolutionEffectifsRaw,
  ] = await Promise.all([
    prisma.employee.count({ where: { user: { isActive: true } } }),
    prisma.attendance.groupBy({ by: ['status'], _count: { id: true }, where: { date: todayUTC } }),
    prisma.leaveRequest.count({ where: { status: 'EN_ATTENTE' } }),
    prisma.contract.count({ where: { endDate: { gte: monthStart, lte: monthEnd }, isActive: true } }),
    prisma.leaveRequest.findMany({
      where: { status: 'EN_ATTENTE' },
      include: { employee: { include: { user: { select: { id: true, fullName: true } } } } },
      orderBy: { createdAt: 'asc' }, take: 10,
    }),
    prisma.employee.findMany({
      where: { hireDate: { gte: last30 }, user: { isActive: true } },
      include: { user: { select: { fullName: true, email: true } }, department: { select: { name: true } } },
      orderBy: { hireDate: 'desc' }, take: 10,
    }),
    prisma.employee.findMany({
      where: { birthDate: { not: null }, user: { isActive: true } },
      include: { user: { select: { fullName: true } }, department: { select: { name: true } } },
      take: 50,
    }),
    prisma.contract.findMany({
      where: { endDate: { gte: monthEnd, lte: next60 }, isActive: true },
      include: { employee: { include: { user: { select: { fullName: true } }, department: { select: { name: true } } } } },
      orderBy: { endDate: 'asc' }, take: 10,
    }),
    prisma.attendance.groupBy({ by: ['status'], _count: { id: true }, where: { date: { gte: weekStart, lte: todayUTC } } }),
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR(date, 'YYYY-MM') AS month, COUNT(*) AS count
      FROM "Attendance" WHERE status IN ('ABSENT', 'RETARD') AND date >= ${last6Months}
      GROUP BY month ORDER BY month`,
    prisma.leaveRequest.groupBy({ by: ['type'], _count: { id: true } }),
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR("hireDate", 'YYYY-MM') AS month, COUNT(*) AS count
      FROM "Employee" WHERE "hireDate" >= ${last6Months}
      GROUP BY month ORDER BY month`,
  ]);

  const currentMonth = now.getMonth() + 1;
  const anniversairesDuMois = allEmployesBirthday
    .filter((e) => e.birthDate && new Date(e.birthDate).getMonth() + 1 === currentMonth)
    .map((e) => ({ fullName: e.user.fullName, dept: e.department?.name ?? null, birthDate: e.birthDate!.toISOString(), age: now.getFullYear() - new Date(e.birthDate!).getFullYear() }));

  res.json({
    kpis: {
      employes: totalEmployes,
      presentsAujourdhui: attendanceToday.find((a) => a.status === 'PRESENT')?._count.id ?? 0,
      absentsAujourdhui: attendanceToday.find((a) => a.status === 'ABSENT')?._count.id ?? 0,
      congesEnAttente,
      contratsExpirantCeMois,
    },
    charts: {
      absenteisme: (absenteismeRaw as any[]).map((r) => ({ month: r.month, count: Number(r.count) })),
      repartitionConges: repartitionConges.map((r) => ({ type: r.type, count: r._count.id })),
      evolutionEffectifs: (evolutionEffectifsRaw as any[]).map((r) => ({ month: r.month, count: Number(r.count) })),
    },
    widgets: {
      congesAValider: congesAValider.map((l) => ({ id: l.id, type: l.type, reason: l.reason ?? null, startDate: l.startDate.toISOString(), endDate: l.endDate.toISOString(), employee: { fullName: l.employee.user.fullName } })),
      nouveauxEmployes: nouveauxEmployes.map((e) => ({ fullName: e.user.fullName, email: e.user.email, dept: e.department?.name ?? null, hireDate: e.hireDate.toISOString() })),
      anniversairesDuMois,
      contratsARenouveler: contratsARenouveler.map((c) => ({ id: c.id, type: c.type, endDate: (c.endDate as Date).toISOString(), employee: { fullName: c.employee.user.fullName, dept: c.employee.department?.name ?? null } })),
      presenceSemaine: Object.fromEntries(presenceSemaineRaw.map((r) => [r.status, r._count.id])),
    },
  });
}

// ─── Manager rich dashboard ───────────────────────────────────────────────────

export async function getManagerDashboard(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000); weekAgo.setHours(0, 0, 0, 0);
  const next7 = new Date(now.getTime() + 7 * 86400000);

  const [supervisedEmployees, managedProjects] = await Promise.all([
    prisma.employee.findMany({ where: { managerId: userId }, select: { userId: true, user: { select: { fullName: true } } } }),
    prisma.project.findMany({
      where: { managerId: userId },
      include: { tasks: { select: { id: true, status: true, assigneeId: true, dueDate: true, assignee: { select: { fullName: true } } } } },
    }),
  ]);

  const teamUserIds = [userId, ...supervisedEmployees.map((e) => e.userId)];

  const [tachesEnRetard, terminesCetteSemaine, reunionsAVenir, deadlinesProches, employesEnConge] = await Promise.all([
    prisma.task.count({ where: { assigneeId: { in: teamUserIds }, status: { not: 'DONE' }, dueDate: { lt: now } } }),
    prisma.task.count({ where: { assigneeId: { in: teamUserIds }, status: 'DONE', updatedAt: { gte: weekAgo } } }),
    prisma.meeting.count({ where: { startAt: { gte: now }, OR: [{ createdById: userId }, { attendees: { some: { userId } } }] } }),
    prisma.task.findMany({
      where: { assigneeId: { in: teamUserIds }, status: { not: 'DONE' }, dueDate: { gte: now, lte: next7 } },
      select: { id: true, title: true, dueDate: true, priority: true, status: true, assignee: { select: { fullName: true } } },
      orderBy: { dueDate: 'asc' }, take: 10,
    }),
    prisma.leaveRequest.findMany({
      where: { status: 'APPROUVE', startDate: { lte: now }, endDate: { gte: now }, employee: { userId: { in: teamUserIds } } },
      include: { employee: { include: { user: { select: { fullName: true } } } } },
    }),
  ]);

  const allTeamTasks = managedProjects.flatMap((p) => p.tasks);

  const kanbanResume: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
  for (const t of allTeamTasks) { if (kanbanResume[t.status] !== undefined) kanbanResume[t.status]++; }

  const chargeMap: Record<string, { name: string; count: number }> = {};
  for (const t of allTeamTasks.filter((t) => t.status !== 'DONE')) {
    if (!t.assigneeId) continue;
    if (!chargeMap[t.assigneeId]) chargeMap[t.assigneeId] = { name: t.assignee?.fullName ?? '—', count: 0 };
    chargeMap[t.assigneeId].count++;
  }

  const prodMap: Record<string, { name: string; done: number; inProgress: number; todo: number }> = {};
  for (const t of allTeamTasks) {
    if (!t.assigneeId) continue;
    if (!prodMap[t.assigneeId]) prodMap[t.assigneeId] = { name: t.assignee?.fullName ?? '—', done: 0, inProgress: 0, todo: 0 };
    if (t.status === 'DONE') prodMap[t.assigneeId].done++;
    else if (t.status === 'IN_PROGRESS') prodMap[t.assigneeId].inProgress++;
    else prodMap[t.assigneeId].todo++;
  }

  const projetsAvancement = managedProjects.map((p) => {
    const total = p.tasks.length;
    const done = p.tasks.filter((t) => t.status === 'DONE').length;
    return { id: p.id, name: p.name, status: p.status, color: p.color, total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  });

  const statusCounts: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
  for (const t of allTeamTasks) { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; }

  res.json({
    kpis: { mesProjets: managedProjects.length, tachesEnRetard, terminesCetteSemaine, membresEquipe: supervisedEmployees.length, reunionsAVenir },
    charts: {
      progressionProjet: projetsAvancement.map((p) => ({ name: p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name, pct: p.pct, done: p.done, total: p.total })),
      repartitionTaches: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      productiviteEquipe: Object.values(prodMap),
    },
    widgets: {
      projetsAvancement,
      kanbanResume,
      deadlinesProches: deadlinesProches.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate!.toISOString(), priority: t.priority, status: t.status, assignee: t.assignee })),
      chargeEquipe: Object.values(chargeMap).sort((a, b) => b.count - a.count),
      employesEnConge: employesEnConge.map((l) => ({ fullName: l.employee.user.fullName, type: l.type, startDate: l.startDate.toISOString(), endDate: l.endDate.toISOString() })),
    },
  });
}

// ─── Employee rich dashboard ──────────────────────────────────────────────────

export async function getEmployeeDashboard(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const next7 = new Date(now.getTime() + 7 * 86400000);

  const [myTasks, reunionsAujourdhui, reunionsAVenir, approvedLeaves, myLeaves, docsRecents, unreadNotifs, tasksDoneThisMonth] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: userId, status: { not: 'DONE' } },
      include: { project: { select: { id: true, name: true } }, createdBy: { select: { fullName: true } } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    }),
    prisma.meeting.count({ where: { startAt: { gte: today, lt: tomorrow }, OR: [{ createdById: userId }, { attendees: { some: { userId } } }] } }),
    prisma.meeting.findMany({
      where: { startAt: { gte: now, lte: next7 }, OR: [{ createdById: userId }, { attendees: { some: { userId } } }] },
      orderBy: { startAt: 'asc' },
      select: { id: true, title: true, startAt: true, endAt: true, location: true },
      take: 5,
    }),
    prisma.leaveRequest.findMany({ where: { employee: { userId }, status: 'APPROUVE', startDate: { gte: yearStart } }, select: { type: true, startDate: true, endDate: true } }),
    prisma.leaveRequest.findMany({ where: { employee: { userId } }, select: { id: true, type: true, status: true, startDate: true, endDate: true, reason: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.document.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, createdAt: true, uploadedBy: { select: { fullName: true } }, category: { select: { name: true } } } }),
    prisma.notification.findMany({ where: { userId, isRead: false }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.task.findMany({ where: { assigneeId: userId, status: 'DONE', updatedAt: { gte: monthStart } }, select: { updatedAt: true, project: { select: { name: true } } } }),
  ]);

  let leaveDaysUsed = 0;
  for (const l of approvedLeaves) {
    if (l.type === 'CONGE_PAYE') leaveDaysUsed += Math.round((l.endDate.getTime() - l.startDate.getTime()) / 86400000) + 1;
  }

  const daysInMonth: string[] = [];
  const cur = new Date(monthStart);
  while (cur <= now) { daysInMonth.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
  const doneByDay: Record<string, number> = {};
  for (const d of daysInMonth) doneByDay[d] = 0;
  for (const t of tasksDoneThisMonth) { const d = t.updatedAt.toISOString().slice(0, 10); if (doneByDay[d] !== undefined) doneByDay[d]++; }

  const projMap: Record<string, number> = {};
  for (const t of [...myTasks, ...tasksDoneThisMonth]) { const n = (t as any).project?.name ?? 'Sans projet'; projMap[n] = (projMap[n] ?? 0) + 1; }

  res.json({
    kpis: {
      tachesAujourdhui: myTasks.filter((t) => t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) < tomorrow).length,
      tachesEnRetard: myTasks.filter((t) => t.dueDate && new Date(t.dueDate) < today).length,
      soldeCongés: { used: leaveDaysUsed, total: 25 },
      reunionsAujourdhui,
    },
    charts: {
      tachesCeMois: daysInMonth.map((d) => ({ day: d, count: doneByDay[d] })),
      tachesParProjet: Object.entries(projMap).map(([name, count]) => ({ name, count })),
    },
    widgets: {
      prochainesTaches: myTasks.slice(0, 5),
      notifications: unreadNotifs.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString() })),
      docsRecents: docsRecents.map((d) => ({ id: d.id, title: d.title, by: d.uploadedBy.fullName, category: d.category?.name ?? null, at: d.createdAt.toISOString() })),
      reunionsAVenir: reunionsAVenir.map((m) => ({ id: m.id, title: m.title, location: m.location, startAt: m.startAt.toISOString(), endAt: m.endAt.toISOString() })),
      congesDemandes: myLeaves.map((l) => ({ id: l.id, type: l.type, status: l.status, reason: l.reason ?? null, startDate: l.startDate.toISOString(), endDate: l.endDate.toISOString(), createdAt: l.createdAt.toISOString() })),
    },
  });
}

// ─── Legacy stats ─────────────────────────────────────────────────────────────

export async function getStats(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const [
    totalDocuments,
    totalProjects,
    totalEmployees,
    pendingLeaves,
    tasksByStatus,
    docsByCategory,
    leavesByMonth,
    recentDocuments,
    recentTasks,
    attendanceToday,
    myTasks,
  ] = await Promise.all([
    // KPIs
    prisma.document.count(),
    prisma.project.count(),
    prisma.employee.count(),
    prisma.leaveRequest.count({ where: { status: 'EN_ATTENTE' } }),

    // Distribution tâches par statut
    prisma.task.groupBy({ by: ['status'], _count: { id: true } }),

    // Documents par catégorie (top 6)
    prisma.document.groupBy({
      by: ['categoryId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 6,
    }),

    // Demandes de congé des 6 derniers mois
    prisma.$queryRaw<{ month: string; count: number }[]>`
      SELECT TO_CHAR("startDate", 'YYYY-MM') AS month, COUNT(*)::int AS count
      FROM "LeaveRequest"
      WHERE "startDate" >= NOW() - INTERVAL '6 months'
      GROUP BY month ORDER BY month
    `,

    // 5 derniers documents
    prisma.document.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { category: { select: { name: true } }, uploadedBy: { select: { fullName: true } } },
    }),

    // 5 dernières tâches
    prisma.task.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: {
        project: { select: { name: true } },
        assignee: { select: { fullName: true } },
      },
    }),

    // Présences du jour
    prisma.attendance.groupBy({
      by: ['status'],
      _count: { id: true },
      where: {
        date: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
    }),

    // Tâches assignées à l'utilisateur courant
    prisma.task.findMany({
      where: { assigneeId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  // Tâches que j'ai assignées à quelqu'un d'autre (pour review)
  const tasksIAssigned = await prisma.task.findMany({
    where: { createdById: userId, assigneeId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, fullName: true } },
    },
  });

  // Résoudre les noms des catégories pour le graphique
  const categoryIds = docsByCategory.map((d) => d.categoryId).filter(Boolean) as number[];
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  res.json({
    kpis: {
      totalDocuments,
      totalProjects,
      totalEmployees,
      pendingLeaves,
    },
    charts: {
      tasksByStatus: tasksByStatus.map((t) => ({ status: t.status, count: t._count.id })),
      docsByCategory: docsByCategory.map((d) => ({
        name: d.categoryId ? (catMap[d.categoryId] ?? 'Sans catégorie') : 'Sans catégorie',
        count: d._count.id,
      })),
      leavesByMonth: (leavesByMonth as any[]).map((l) => ({ month: l.month, count: Number(l.count) })),
      attendanceToday: attendanceToday.map((a) => ({ status: a.status, count: a._count.id })),
    },
    recent: {
      documents: recentDocuments,
      tasks: recentTasks,
    },
    myTasks,
    tasksIAssigned,
  });
}
