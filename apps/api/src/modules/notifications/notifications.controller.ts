import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as notifSvc from '../../services/notificationService.js';

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const limit  = Math.min(Number(req.query.limit  ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);
  const notifs = await notifSvc.getUserNotifications(req.user!.userId, limit, offset);
  res.json(notifs);
}

// ─── Unread count ─────────────────────────────────────────────────────────────

export async function unreadCount(req: Request, res: Response): Promise<void> {
  const count = await notifSvc.getUnreadCount(req.user!.userId);
  res.json({ count });
}

// ─── Mark one as read ─────────────────────────────────────────────────────────

export async function markOneRead(req: Request, res: Response): Promise<void> {
  await notifSvc.markAsRead(req.params.id, req.user!.userId);
  res.json({ ok: true });
}

// ─── Mark all as read ────────────────────────────────────────────────────────

export async function markAllRead(req: Request, res: Response): Promise<void> {
  await notifSvc.markAllAsRead(req.user!.userId);
  res.json({ ok: true });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function removeNotification(req: Request, res: Response): Promise<void> {
  await notifSvc.deleteNotification(req.params.id, req.user!.userId);
  res.status(204).end();
}

// ─── SSE stream ───────────────────────────────────────────────────────────────
// EventSource cannot send custom headers, so the JWT is passed as ?token=<jwt>

export function streamNotifications(req: Request, res: Response): void {
  const token = req.query.token as string | undefined;
  if (!token) { res.status(401).json({ message: 'Token manquant' }); return; }

  let userId: string;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'secret') as { userId: string };
    userId = payload.userId;
  } catch {
    res.status(401).json({ message: 'Token invalide' }); return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering if present
  res.flushHeaders();

  notifSvc.registerSse(userId, res);

  // Heartbeat every 30s to keep the connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    notifSvc.unregisterSse(userId);
  });
}
