import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import * as notifSvc from '../../services/notificationService.js';

const meetingInclude = {
  createdBy: { select: { id: true, fullName: true } },
  attendees: { include: { user: { select: { id: true, fullName: true } } } },
} as const;

async function notifyAttendees(
  meetingId: string,
  type: 'MEETING_CREATED' | 'MEETING_UPDATED',
  title: string,
  body: string,
  excludeId?: string,
): Promise<void> {
  const attendees = await prisma.meetingAttendee.findMany({
    where: { meetingId },
    select: { userId: true },
  });
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { createdById: true },
  });
  const recipients = [
    ...new Set([
      ...(meeting ? [meeting.createdById] : []),
      ...attendees.map((a) => a.userId),
    ]),
  ].filter((uid) => uid !== excludeId);

  for (const uid of recipients) {
    await notifSvc.createNotification(uid, type, title, body, `/calendar?meetingId=${meetingId}`);
  }
}

// ── POST /api/meetings ────────────────────────────────────────────────────────

export async function createMeeting(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;

  const body = z.object({
    title:       z.string().min(1).max(120),
    description: z.string().optional(),
    startAt:     z.string().datetime(),
    endAt:       z.string().datetime(),
    location:    z.string().optional(),
    attendeeIds: z.array(z.string()).default([]),
  }).parse(req.body);

  if (new Date(body.endAt) <= new Date(body.startAt)) {
    res.status(400).json({ message: 'La fin doit être après le début' });
    return;
  }

  const uniqueAttendees = [...new Set(body.attendeeIds.filter((id) => id !== userId))];

  const meeting = await prisma.meeting.create({
    data: {
      title:       body.title,
      description: body.description,
      startAt:     new Date(body.startAt),
      endAt:       new Date(body.endAt),
      location:    body.location,
      createdById: userId,
      attendees: {
        create: uniqueAttendees.map((uid) => ({ userId: uid })),
      },
    },
    include: meetingInclude,
  });

  res.status(201).json(meeting);

  // Notify all attendees (not the creator)
  const start = new Date(body.startAt).toLocaleString('fr-FR', {
    dateStyle: 'short', timeStyle: 'short',
  });
  await notifyAttendees(
    meeting.id,
    'MEETING_CREATED',
    `Nouvelle réunion : ${body.title}`,
    `Vous êtes invité(e) à "${body.title}" le ${start}`,
    userId,
  );
}

// ── GET /api/meetings/:id ─────────────────────────────────────────────────────

export async function getMeeting(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: meetingInclude,
  });
  if (!meeting) { res.status(404).json({ message: 'Réunion introuvable' }); return; }

  const isInvited = meeting.attendees.some((a) => a.user.id === userId);
  const canSee    = role === 'ADMIN' || role === 'RH' || meeting.createdById === userId || isInvited;
  if (!canSee) { res.status(403).json({ message: 'Accès non autorisé' }); return; }

  res.json(meeting);
}

// ── PATCH /api/meetings/:id ───────────────────────────────────────────────────

export async function updateMeeting(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    select: { createdById: true },
  });
  if (!meeting) { res.status(404).json({ message: 'Réunion introuvable' }); return; }
  if (meeting.createdById !== userId && role !== 'ADMIN') {
    res.status(403).json({ message: 'Seul le créateur ou un admin peut modifier cette réunion' }); return;
  }

  const body = z.object({
    title:       z.string().min(1).max(120).optional(),
    description: z.string().optional(),
    startAt:     z.string().datetime().optional(),
    endAt:       z.string().datetime().optional(),
    location:    z.string().optional(),
  }).parse(req.body);

  const updated = await prisma.meeting.update({
    where: { id: req.params.id },
    data: {
      ...body,
      ...(body.startAt ? { startAt: new Date(body.startAt) } : {}),
      ...(body.endAt   ? { endAt:   new Date(body.endAt)   } : {}),
    },
    include: meetingInclude,
  });
  res.json(updated);

  await notifyAttendees(
    updated.id,
    'MEETING_UPDATED',
    `Réunion modifiée : ${updated.title}`,
    `La réunion "${updated.title}" a été mise à jour`,
    userId,
  );
}

// ── DELETE /api/meetings/:id ──────────────────────────────────────────────────

export async function deleteMeeting(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    select: { createdById: true },
  });
  if (!meeting) { res.status(404).json({ message: 'Réunion introuvable' }); return; }
  if (meeting.createdById !== userId && role !== 'ADMIN') {
    res.status(403).json({ message: 'Non autorisé' }); return;
  }

  await prisma.meeting.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

// ── POST /api/meetings/:id/attendees ──────────────────────────────────────────

export async function addAttendees(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const meetingId = req.params.id;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { createdById: true, title: true, startAt: true },
  });
  if (!meeting) { res.status(404).json({ message: 'Réunion introuvable' }); return; }
  if (meeting.createdById !== userId && role !== 'ADMIN') {
    res.status(403).json({ message: 'Non autorisé' }); return;
  }

  const { userIds } = z.object({ userIds: z.array(z.string()).min(1) }).parse(req.body);

  await prisma.meetingAttendee.createMany({
    data:          userIds.map((uid) => ({ meetingId, userId: uid })),
    skipDuplicates: true,
  });
  res.status(201).json({ message: 'Membres ajoutés' });

  const start = meeting.startAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  for (const uid of userIds) {
    await notifSvc.createNotification(
      uid,
      'MEETING_CREATED',
      `Nouvelle réunion : ${meeting.title}`,
      `Vous êtes invité(e) à "${meeting.title}" le ${start}`,
      `/calendar?meetingId=${meetingId}`,
    );
  }
}

// ── DELETE /api/meetings/:id/attendees/:userId ────────────────────────────────

export async function removeAttendee(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const { id: meetingId, userId: targetId } = req.params;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { createdById: true },
  });
  if (!meeting) { res.status(404).json({ message: 'Réunion introuvable' }); return; }

  const isSelf = targetId === userId;
  if (!isSelf && meeting.createdById !== userId && role !== 'ADMIN') {
    res.status(403).json({ message: 'Non autorisé' }); return;
  }

  await prisma.meetingAttendee.deleteMany({
    where: { meetingId, userId: targetId },
  });
  res.status(204).end();
}
