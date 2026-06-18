import cron from 'node-cron';
import { prisma } from '../prisma.js';
import { createNotification } from '../services/notificationService.js';

// ── Meeting reminder (every 5 min — fires when meeting starts in ~60 min) ─────

function startMeetingReminder(): void {
  cron.schedule('*/5 * * * *', async () => {
    const now  = new Date();
    const base = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour ahead
    const windowStart = new Date(base.getTime() - 2.5 * 60 * 1000);
    const windowEnd   = new Date(base.getTime() + 2.5 * 60 * 1000);

    const meetings = await prisma.meeting.findMany({
      where: { startAt: { gte: windowStart, lte: windowEnd } },
      include: {
        attendees: { select: { userId: true } },
      },
    });

    for (const meeting of meetings) {
      const recipients = [
        ...new Set([meeting.createdById, ...meeting.attendees.map((a) => a.userId)]),
      ];
      const startLabel = meeting.startAt.toLocaleString('fr-FR', {
        dateStyle: 'short', timeStyle: 'short',
      });

      for (const uid of recipients) {
        const alreadySent = await prisma.notification.findFirst({
          where: {
            userId: uid,
            type:   'MEETING_REMINDER',
            link:   { contains: meeting.id },
            createdAt: { gte: new Date(now.getTime() - 10 * 60 * 1000) },
          },
        });
        if (alreadySent) continue;

        await createNotification(
          uid,
          'MEETING_REMINDER',
          `Rappel : "${meeting.title}" dans 1 heure`,
          `Votre réunion commence le ${startLabel}`,
          `/calendar?meetingId=${meeting.id}`,
        );
      }
    }
  });

  console.log('[cron] Meeting reminder scheduled every 5 min');
}

// ── Contract expiring in 30 days (daily at 08:00) ─────────────────────────────

function startContractExpiryReminder(): void {
  cron.schedule('0 8 * * *', async () => {
    const target = new Date();
    target.setDate(target.getDate() + 30);
    const start = new Date(target); start.setHours(0, 0, 0, 0);
    const end   = new Date(target); end.setHours(23, 59, 59, 999);

    const contracts = await prisma.contract.findMany({
      where: { endDate: { gte: start, lte: end }, isActive: true },
      include: {
        employee: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });

    const rhUsers = await prisma.user.findMany({
      where: { role: { name: 'RH' }, isActive: true },
      select: { id: true },
    });

    for (const contract of contracts) {
      const name = contract.employee.user.fullName;
      const endLabel = contract.endDate!.toLocaleDateString('fr-FR');
      const body = `Le contrat de ${name} expire le ${endLabel} (dans 30 jours)`;

      // Notify employee
      const empId = contract.employee.userId;
      const empAlreadySent = await prisma.notification.findFirst({
        where: { userId: empId, type: 'CONTRACT_EXPIRING', body: { contains: name }, createdAt: { gte: start, lte: end } },
      });
      if (!empAlreadySent) {
        await createNotification(empId, 'CONTRACT_EXPIRING', 'Votre contrat expire bientôt', body, '/hr');
      }

      // Notify RH
      for (const rh of rhUsers) {
        const rhAlreadySent = await prisma.notification.findFirst({
          where: { userId: rh.id, type: 'CONTRACT_EXPIRING', body: { contains: name }, createdAt: { gte: start, lte: end } },
        });
        if (!rhAlreadySent) {
          await createNotification(rh.id, 'CONTRACT_EXPIRING', 'Contrat expirant bientôt', body, '/hr');
        }
      }
    }

    console.log(`[cron] ${contracts.length} contrat(s) vérifié(s) pour expiration imminente`);
  });

  console.log('[cron] Contract expiry reminder scheduled at 08:00 daily');
}

// ── Task deadline tomorrow (daily at 08:00 — separate schedule slot) ──────────

function startTaskDeadlineTomorrowReminder(): void {
  cron.schedule('5 8 * * *', async () => {
    const target = new Date();
    target.setDate(target.getDate() + 1);
    const start = new Date(target); start.setHours(0, 0, 0, 0);
    const end   = new Date(target); end.setHours(23, 59, 59, 999);

    const tasks = await prisma.task.findMany({
      where: { dueDate: { gte: start, lte: end }, status: { not: 'DONE' }, assigneeId: { not: null } },
      select: { id: true, title: true, assigneeId: true },
    });

    for (const task of tasks) {
      if (!task.assigneeId) continue;

      const alreadySent = await prisma.notification.findFirst({
        where: { userId: task.assigneeId, type: 'TASK_DUE_TOMORROW', body: { contains: task.title }, createdAt: { gte: start, lte: end } },
      });
      if (alreadySent) continue;

      await createNotification(
        task.assigneeId,
        'TASK_DUE_TOMORROW',
        'Tâche à rendre demain',
        `"${task.title}" est à rendre demain`,
        '/tasks',
      );
    }

    console.log(`[cron] ${tasks.length} tâche(s) vérifiée(s) pour échéance demain`);
  });

  console.log('[cron] Task deadline tomorrow reminder scheduled at 08:05 daily');
}

export function startCalendarReminders(): void {
  startMeetingReminder();
  startContractExpiryReminder();
  startTaskDeadlineTomorrowReminder();
}
