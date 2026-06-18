import cron from 'node-cron';
import { prisma } from '../prisma.js';
import { createNotification } from '../services/notificationService.js';

export function startDueDateReminder(): void {
  // Run every day at 08:00
  cron.schedule('0 8 * * *', async () => {
    console.log('[cron] Checking tasks due in 2 days…');

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 2);
    const start = new Date(targetDate); start.setHours(0, 0, 0, 0);
    const end   = new Date(targetDate); end.setHours(23, 59, 59, 999);

    const tasks = await prisma.task.findMany({
      where: {
        dueDate:    { gte: start, lte: end },
        status:     { not: 'DONE' },
        assigneeId: { not: null },
      },
      select: {
        id: true, title: true, assigneeId: true,
        project: { select: { name: true } },
      },
    });

    for (const task of tasks) {
      if (!task.assigneeId) continue;

      // Deduplicate: skip if we already sent this notification today
      const alreadySent = await prisma.notification.findFirst({
        where: {
          userId: task.assigneeId,
          type:   'TASK_DUE_SOON',
          body:   { contains: task.title },
          createdAt: { gte: start, lte: end },
        },
      });
      if (alreadySent) continue;

      await createNotification(
        task.assigneeId,
        'TASK_DUE_SOON',
        'Tâche à échéance dans 2 jours',
        `"${task.title}"${task.project ? ` (${task.project.name})` : ''} est à rendre dans 2 jours`,
        '/tasks',
      );
    }

    console.log(`[cron] ${tasks.length} tâche(s) vérifiée(s) pour échéance imminente`);
  });

  console.log('[cron] Due-date reminder scheduled at 08:00 daily');
}
