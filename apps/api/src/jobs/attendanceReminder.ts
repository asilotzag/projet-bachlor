import cron from 'node-cron';
import { prisma } from '../prisma.js';
import { createBulkNotifications } from '../services/notificationService.js';

export function startAttendanceReminder(): void {
  // Run every day at 09:00
  cron.schedule('0 9 * * *', async () => {
    console.log('[cron] Checking if attendance has been recorded today…');

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const count = await prisma.attendance.count({
      where: { date: { gte: today, lt: tomorrow } },
    });

    if (count === 0) {
      const rhUsers = await prisma.user.findMany({
        where: { isActive: true, role: { name: 'RH' } },
        select: { id: true },
      });
      void createBulkNotifications(
        rhUsers.map((u) => u.id),
        'ATTENDANCE_REMINDER',
        'Rappel — Assiduité du jour',
        "L'assiduité des employés n'a pas encore été enregistrée pour aujourd'hui.",
        '/attendance',
      );
      console.log(`[cron] Attendance reminder sent to ${rhUsers.length} RH user(s)`);
    } else {
      console.log(`[cron] Attendance already recorded today (${count} record(s)) — no reminder sent`);
    }
  });

  console.log('[cron] Attendance reminder scheduled at 09:00 daily');
}
