import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(d1: Date, d2: Date) {
  return Math.floor(Math.abs(d2.getTime() - d1.getTime()) / 86400000);
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fillDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);
  while (cur <= end) {
    days.push(isoDay(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// ─── Scope builder ────────────────────────────────────────────────────────────

async function buildScope(userId: string, role: string, departmentId?: number, projectId?: string) {
  if (role === 'ADMIN' || role === 'RH') {
    // Optional filters
    let userIds: string[] | null = null;
    if (departmentId) {
      const emps = await prisma.employee.findMany({
        where: { departmentId },
        select: { userId: true },
      });
      userIds = emps.map((e) => e.userId);
    }
    const projectIds = projectId ? [projectId] : null;
    return { userIds, projectIds, isGlobal: !userIds && !projectIds };
  }

  // MANAGER: scoped to managed projects + supervised team
  const [managedProjects, supervisedEmployees] = await Promise.all([
    prisma.project.findMany({ where: { managerId: userId }, select: { id: true } }),
    prisma.employee.findMany({ where: { managerId: userId }, select: { userId: true } }),
  ]);
  const projectIds = managedProjects.map((p) => p.id);
  const userIds = [userId, ...supervisedEmployees.map((e) => e.userId)];
  return { userIds, projectIds, isGlobal: false };
}

// ─── Main overview endpoint ────────────────────────────────────────────────────

export async function getOverview(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;

  const toDate  = req.query.to   ? new Date(req.query.to as string)   : new Date();
  const fromDate = req.query.from ? new Date(req.query.from as string) : new Date(toDate.getTime() - 7 * 86400000);
  const deptId   = req.query.departmentId ? Number(req.query.departmentId) : undefined;
  const projId   = req.query.projectId as string | undefined;

  fromDate.setUTCHours(0, 0, 0, 0);
  toDate.setUTCHours(23, 59, 59, 999);

  const scope = await buildScope(userId, role, deptId, projId);

  // ── Base task where clause ─────────────────────────────────────────────────
  const taskWhere: any = {};
  if (scope.userIds) taskWhere.assigneeId = { in: scope.userIds };
  if (scope.projectIds) {
    if (taskWhere.assigneeId) {
      taskWhere.OR = [
        { assigneeId: taskWhere.assigneeId },
        { projectId: { in: scope.projectIds } },
      ];
      delete taskWhere.assigneeId;
    } else {
      taskWhere.projectId = { in: scope.projectIds };
    }
  }

  const now = new Date();

  // ── Parallel queries ───────────────────────────────────────────────────────
  const [
    allTasks,
    completedInRange,
    completedLastPeriod,
    projects,
    attendance,
  ] = await Promise.all([
    // All non-deleted tasks in scope (for status dist, workload, overdue)
    prisma.task.findMany({
      where: taskWhere,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        assigneeId: true,
        projectId: true,
        updatedAt: true,
        createdAt: true,
        assignee: { select: { id: true, fullName: true } },
        project:  { select: { id: true, name: true } },
      },
    }),
    // Tasks completed in date range
    prisma.task.findMany({
      where: { ...taskWhere, status: 'DONE', updatedAt: { gte: fromDate, lte: toDate } },
      select: { id: true, assigneeId: true, assignee: { select: { fullName: true } }, updatedAt: true },
    }),
    // Tasks completed in previous equal period (for % comparison)
    prisma.task.findMany({
      where: {
        ...taskWhere,
        status: 'DONE',
        updatedAt: {
          gte: new Date(fromDate.getTime() - (toDate.getTime() - fromDate.getTime())),
          lt: fromDate,
        },
      },
      select: { id: true },
    }),
    // Projects in scope
    scope.projectIds
      ? prisma.project.findMany({
          where: { id: { in: scope.projectIds } },
          select: { id: true, name: true, tasks: { select: { id: true, status: true } } },
        })
      : scope.isGlobal
        ? prisma.project.findMany({
            select: { id: true, name: true, tasks: { select: { id: true, status: true } } },
          })
        : prisma.project.findMany({
            where: { managerId: userId },
            select: { id: true, name: true, tasks: { select: { id: true, status: true } } },
          }),
    // Attendance in range for heatmap
    prisma.attendance.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
        ...(scope.userIds ? { employee: { userId: { in: scope.userIds } } } : {}),
      },
      select: {
        date: true,
        status: true,
        employee: { select: { userId: true, user: { select: { fullName: true } } } },
      },
    }),
  ]);

  // ── A. KPI Highlights ──────────────────────────────────────────────────────

  // Top producer: most tasks completed in range
  const completedByUser: Record<string, { name: string; tasksCompleted: number }> = {};
  for (const t of completedInRange) {
    if (!t.assigneeId) continue;
    if (!completedByUser[t.assigneeId]) {
      completedByUser[t.assigneeId] = { name: t.assignee?.fullName ?? 'Inconnu', tasksCompleted: 0 };
    }
    completedByUser[t.assigneeId].tasksCompleted++;
  }
  const topProducer = Object.values(completedByUser).sort((a, b) => b.tasksCompleted - a.tasksCompleted)[0] ?? null;

  // Most overdue project
  const overdueByProject: Record<string, { name: string; count: number; maxDaysLate: number }> = {};
  for (const t of allTasks) {
    if (!t.project || !t.dueDate || t.status === 'DONE') continue;
    const due = new Date(t.dueDate);
    if (due >= now) continue;
    const daysLate = daysBetween(due, now);
    const pid = t.project.id;
    if (!overdueByProject[pid]) overdueByProject[pid] = { name: t.project.name, count: 0, maxDaysLate: 0 };
    overdueByProject[pid].count++;
    overdueByProject[pid].maxDaysLate = Math.max(overdueByProject[pid].maxDaysLate, daysLate);
  }
  const mostOverdueProject = Object.values(overdueByProject).sort((a, b) => b.count - a.count)[0] ?? null;

  // Tasks completed this week vs last week
  const thisWeekCount  = completedInRange.length;
  const lastWeekCount  = completedLastPeriod.length;
  const changePercent  = lastWeekCount === 0
    ? (thisWeekCount > 0 ? 100 : 0)
    : Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100);

  // Average workload: active tasks per unique assignee
  const activeTasks = allTasks.filter((t) => t.status !== 'DONE' && t.assigneeId);
  const uniqueAssignees = new Set(activeTasks.map((t) => t.assigneeId)).size;
  const avgWorkload = uniqueAssignees === 0 ? 0 : Math.round((activeTasks.length / uniqueAssignees) * 10) / 10;

  // ── B. Productivity chart (completed per day in range) ─────────────────────
  const days = fillDays(fromDate, toDate);
  const completedPerDay: Record<string, number> = {};
  for (const d of days) completedPerDay[d] = 0;
  for (const t of completedInRange) {
    const d = isoDay(new Date(t.updatedAt));
    if (completedPerDay[d] !== undefined) completedPerDay[d]++;
  }
  const productivity = days.map((d) => ({ date: d, count: completedPerDay[d] }));

  // Top-5 per individual (for toggle)
  const top5Users = Object.entries(completedByUser)
    .sort((a, b) => b[1].tasksCompleted - a[1].tasksCompleted)
    .slice(0, 5);
  const byIndividual = days.map((d) => {
    const entry: Record<string, any> = { date: d };
    for (const [uid, info] of top5Users) {
      const cnt = completedInRange.filter(
        (t) => t.assigneeId === uid && isoDay(new Date(t.updatedAt)) === d,
      ).length;
      entry[info.name] = cnt;
    }
    return entry;
  });
  const top5Names = top5Users.map(([, info]) => info.name);

  // ── C. Workload heatmap (tasks completed per day per user) ─────────────────
  const usersForHeatmap = scope.userIds
    ? await prisma.user.findMany({
        where: { id: { in: scope.userIds }, isActive: true },
        select: { id: true, fullName: true },
        take: 15,
      })
    : await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
        take: 15,
      });

  const workloadHeatmap = usersForHeatmap.map((u) => {
    const dayMap: Record<string, number> = {};
    for (const d of days) dayMap[d] = 0;
    for (const t of completedInRange) {
      if (t.assigneeId !== u.id) continue;
      const d = isoDay(new Date(t.updatedAt));
      if (dayMap[d] !== undefined) dayMap[d]++;
    }
    return {
      userId: u.id,
      name: u.fullName,
      days: days.map((d) => ({ date: d, count: dayMap[d] })),
    };
  });

  // ── D. Activity heatmap (attendance per day per user) ─────────────────────
  const activityHeatmap = usersForHeatmap.map((u) => {
    const dayMap: Record<string, string | null> = {};
    for (const d of days) dayMap[d] = null;
    for (const a of attendance) {
      if (a.employee.userId !== u.id) continue;
      const d = isoDay(new Date(a.date));
      if (dayMap[d] !== undefined) dayMap[d] = a.status;
    }
    return {
      userId: u.id,
      name: u.fullName,
      days: days.map((d) => ({ date: d, status: dayMap[d] })),
    };
  });

  // ── E. Team / project productivity ────────────────────────────────────────
  const teamProductivity = projects.slice(0, 10).map((p) => ({
    name: p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name,
    completed: p.tasks.filter((t) => t.status === 'DONE').length,
    remaining: p.tasks.filter((t) => t.status !== 'DONE').length,
  }));

  // ── F. Task status distribution ────────────────────────────────────────────
  const statusCounts: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
  for (const t of allTasks) {
    if (statusCounts[t.status] !== undefined) statusCounts[t.status]++;
  }
  const taskStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  // ── G. Overdue tasks list ─────────────────────────────────────────────────
  const overdueTasks = allTasks
    .filter((t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE')
    .map((t) => ({
      id: t.id,
      title: t.title,
      project: t.project?.name ?? null,
      assignee: t.assignee?.fullName ?? null,
      assigneeId: t.assigneeId,
      daysOverdue: daysBetween(new Date(t.dueDate!), now),
      priority: t.priority,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 20);

  res.json({
    range: { from: fromDate.toISOString(), to: toDate.toISOString() },
    kpis: {
      topProducer,
      mostOverdueProject,
      tasksCompletedThisWeek: { count: thisWeekCount, changePercent },
      avgWorkload,
    },
    productivity,
    byIndividual,
    top5Names,
    workloadHeatmap,
    activityHeatmap,
    teamProductivity,
    taskStatus,
    overdueTasks,
  });
}
