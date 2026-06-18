import type { Response } from 'express';
import { prisma } from '../prisma.js';

// ─── SSE connection registry ───────────────────────────────────────────────────

const sseConnections = new Map<string, Response>();

export function registerSse(userId: string, res: Response): void {
  sseConnections.set(userId, res);
}

export function unregisterSse(userId: string): void {
  sseConnections.delete(userId);
}

function pushSse(userId: string, payload: object): void {
  const res = sseConnections.get(userId);
  if (res) {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      sseConnections.delete(userId);
    }
  }
}

/** Push a named SSE event (e.g. chat_message, chat_unread) to an online user. */
export function pushChatEvent(userId: string, event: string, payload: object): void {
  const res = sseConnections.get(userId);
  if (res) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      sseConnections.delete(userId);
    }
  }
}

/** Broadcast a named SSE event to ALL currently connected users. */
export function broadcastEvent(event: string, payload: object): void {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [userId, res] of sseConnections) {
    try {
      res.write(data);
    } catch {
      sseConnections.delete(userId);
    }
  }
}

/** Returns true if the user has an active SSE connection. */
export function isUserOnline(userId: string): boolean {
  return sseConnections.has(userId);
}

// ─── Core operations ──────────────────────────────────────────────────────────

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  link?: string,
): Promise<void> {
  try {
    const notif = await prisma.notification.create({
      data: { userId, type, title, body, link },
    });
    pushSse(userId, notif);
  } catch {
    // never let notification failures crash the caller
  }
}

export async function createBulkNotifications(
  userIds: string[],
  type: string,
  title: string,
  body: string,
  link?: string,
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  await Promise.all(unique.map((uid) => createNotification(uid, type, title, body, link)));
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
}

export async function markAllAsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

export async function getUserNotifications(
  userId: string,
  limit = 50,
  offset = 0,
) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function deleteNotification(notificationId: string, userId: string): Promise<void> {
  await prisma.notification.deleteMany({ where: { id: notificationId, userId } });
}
