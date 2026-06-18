import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import type { HealthResponse } from '@pfe/shared';
import authRouter       from './modules/auth/auth.router.js';
import usersRouter      from './modules/users/users.router.js';
import documentsRouter  from './modules/documents/documents.router.js';
import categoriesRouter from './modules/categories/categories.router.js';
import tagsRouter       from './modules/tags/tags.router.js';
import projectsRouter   from './modules/projects/projects.router.js';
import tasksRouter      from './modules/tasks/tasks.router.js';
import hrRouter         from './modules/hr/hr.router.js';
import dashboardRouter  from './modules/dashboard/dashboard.router.js';
import aiRouter             from './modules/ai/ai.router.js';
import notificationsRouter  from './modules/notifications/notifications.router.js';
import attendanceRouter     from './modules/attendance/attendance.router.js';
import chatRouter           from './modules/chat/chat.router.js';
import calendarRouter       from './modules/calendar/calendar.router.js';
import meetingsRouter       from './modules/meetings/meetings.router.js';
import chatbotRouter        from './modules/chatbot/chatbot.router.js';
import analyticsRouter      from './modules/analytics/analytics.router.js';
import submissionsRouter   from './modules/submissions/submissions.router.js';
import journalRouter       from './modules/journal/journal.router.js';
import wellnessRouter      from './modules/wellness/wellness.router.js';
import templatesRouter     from './modules/templates/templates.router.js';
import supervisionRouter   from './modules/supervision/supervision.router.js';
import reportsRouter       from './modules/reports/reports.router.js';

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/files', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/health', (_req, res) => {
  const body: HealthResponse = { status: 'ok', service: '@pfe/api', version: '0.2.0', time: new Date().toISOString() };
  res.json(body);
});

app.use('/api/auth',       authRouter);
app.use('/api/users',      usersRouter);
app.use('/api/documents',  documentsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/tags',       tagsRouter);
app.use('/api/projects',   projectsRouter);
app.use('/api/tasks',      tasksRouter);
app.use('/api/hr',         hrRouter);
app.use('/api/dashboard',  dashboardRouter);
app.use('/api/ai',             aiRouter);
app.use('/api/notifications',  notificationsRouter);
app.use('/api/attendance',     attendanceRouter);
app.use('/api/chat',           chatRouter);
app.use('/api/calendar',      calendarRouter);
app.use('/api/meetings',      meetingsRouter);
app.use('/api/chatbot',       chatbotRouter);
app.use('/api/analytics',     analyticsRouter);
app.use('/api',               submissionsRouter);
app.use('/api',               journalRouter);
app.use('/api/wellness',      wellnessRouter);
app.use('/api/templates',     templatesRouter);
app.use('/api/supervision',   supervisionRouter);
app.use('/api/reports',      reportsRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(400).json({ message: err.message });
});
