import { app } from './app.js';
import { startDueDateReminder }    from './jobs/dueDateReminder.js';
import { startAttendanceReminder } from './jobs/attendanceReminder.js';
import { startCalendarReminders }  from './jobs/calendarReminders.js';

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`[api] en écoute sur http://localhost:${PORT}`);
  startDueDateReminder();
  startAttendanceReminder();
  startCalendarReminders();
});
