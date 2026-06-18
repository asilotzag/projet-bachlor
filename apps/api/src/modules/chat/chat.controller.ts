import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import * as notifSvc from '../../services/notificationService.js';

// ── Shared includes ───────────────────────────────────────────────────────────

const memberInclude = {
  user: { select: { id: true, fullName: true } },
} as const;

const messageInclude = {
  sender: { select: { id: true, fullName: true } },
  // also bring back attachment info for real-time event
} as const;

// ── Access guard helper ───────────────────────────────────────────────────────

async function assertMember(convId: string, userId: string, role: string): Promise<boolean> {
  if (role === 'ADMIN') return true;
  const m = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: convId, userId } },
  });
  return !!m;
}

// ── GET /api/chat/users ───────────────────────────────────────────────────────

export async function listChatUsers(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const users = await prisma.user.findMany({
    where: { isActive: true, id: { not: userId } },
    select: { id: true, fullName: true, role: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
  });
  res.json(users);
}

// ── GET /api/chat/conversations ───────────────────────────────────────────────

export async function listConversations(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;

  const conversations = await prisma.conversation.findMany({
    where: role === 'ADMIN' ? {} : { members: { some: { userId } } },
    include: {
      members: { include: memberInclude },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: messageInclude,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Compute per-conversation unread counts (N+1 but bounded by user's conversation count)
  const result = await Promise.all(
    conversations.map(async (conv) => {
      const myMember = conv.members.find((m) => m.userId === userId);
      // For conversations the user is not a member of (ADMIN overview), unread = 0
      const unreadCount = myMember
        ? await prisma.message.count({
            where: {
              conversationId: conv.id,
              senderId: { not: userId },
              deletedAt: null,
              ...(myMember.lastReadAt ? { createdAt: { gt: myMember.lastReadAt } } : {}),
            },
          })
        : 0;
      return { ...conv, unreadCount, lastMessage: conv.messages[0] ?? null };
    }),
  );

  res.json(result);
}

// ── POST /api/chat/conversations/direct ──────────────────────────────────────

export async function getOrCreateDirect(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const { targetUserId } = z.object({ targetUserId: z.string() }).parse(req.body);

  if (targetUserId === userId) {
    res.status(400).json({ message: 'Impossible de créer une conversation avec soi-même' });
    return;
  }

  // Find existing DM between these two users
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { members: { some: { userId } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
    include: { members: { include: memberInclude } },
  });

  if (existing) { res.json(existing); return; }

  // Create new DM
  const conv = await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      members: {
        create: [{ userId }, { userId: targetUserId }],
      },
    },
    include: { members: { include: memberInclude } },
  });

  res.status(201).json(conv);
}

// ── POST /api/chat/conversations/group ────────────────────────────────────────

export async function createGroup(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;

  if (role === 'EMPLOYE') {
    res.status(403).json({ message: 'Les employés ne peuvent pas créer de groupes' });
    return;
  }

  const { name, memberIds } = z.object({
    name:      z.string().min(1).max(80),
    memberIds: z.array(z.string()).min(1),
  }).parse(req.body);

  // MANAGER can only add their supervised employees
  let allowedIds = memberIds;
  if (role === 'MANAGER') {
    const supervised = await prisma.employee.findMany({
      where: { managerId: userId },
      select: { userId: true },
    });
    const supervisedIds = new Set(supervised.map((e) => e.userId));
    allowedIds = memberIds.filter((id) => supervisedIds.has(id));
  }

  const allMemberIds = [...new Set([userId, ...allowedIds])];

  const conv = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      name,
      members: { create: allMemberIds.map((uid) => ({ userId: uid })) },
    },
    include: { members: { include: memberInclude } },
  });

  res.status(201).json(conv);
}

// ── POST /api/chat/conversations/:id/members ─────────────────────────────────

export async function addMember(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const convId = req.params.id;

  if (!['ADMIN', 'RH', 'MANAGER'].includes(role)) {
    res.status(403).json({ message: 'Seuls ADMIN, RH et MANAGER peuvent ajouter des membres' });
    return;
  }

  const ok = await assertMember(convId, userId, role);
  if (!ok) { res.status(403).json({ message: 'Accès non autorisé' }); return; }

  const { targetUserId } = z.object({ targetUserId: z.string() }).parse(req.body);

  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId: convId, userId: targetUserId } },
    create: { conversationId: convId, userId: targetUserId },
    update: {},
  });

  res.status(201).json({ message: 'Membre ajouté' });
}

// ── DELETE /api/chat/conversations/:id/members/:userId ────────────────────────

export async function removeMember(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const { id: convId, userId: targetId } = req.params;

  const isSelf = targetId === userId;
  const ok = await assertMember(convId, userId, role);
  if (!ok && !isSelf) { res.status(403).json({ message: 'Accès non autorisé' }); return; }

  await prisma.conversationMember.delete({
    where: { conversationId_userId: { conversationId: convId, userId: targetId } },
  });
  res.status(204).end();
}

// ── GET /api/chat/conversations/:id/messages ──────────────────────────────────

export async function getMessages(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const convId = req.params.id;
  const cursor  = req.query.cursor as string | undefined;
  const LIMIT   = 40;

  const ok = await assertMember(convId, userId, role);
  if (!ok) { res.status(403).json({ message: 'Accès non autorisé' }); return; }

  const messages = await prisma.message.findMany({
    where: {
      conversationId: convId,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: LIMIT,
  });

  res.json({
    messages: messages.reverse(), // return chronological order
    hasMore: messages.length === LIMIT,
  });
}

// ── POST /api/chat/conversations/:id/messages ─────────────────────────────────

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const convId = req.params.id;

  const ok = await assertMember(convId, userId, role);
  if (!ok) { res.status(403).json({ message: 'Accès non autorisé' }); return; }

  const file = (req as any).file as Express.Multer.File | undefined;
  const attachmentUrl = file ? `/files/${file.filename}` : undefined;
  const attachmentType = file ? file.mimetype : undefined;

  const body = req.body as Record<string, string>;
  const content = body.content?.trim() ?? '';
  if (!content && !file) { res.status(400).json({ message: 'Message ou pièce jointe requis' }); return; }
  const msgContent = content || (file ? `📎 ${file.originalname}` : '');

  const [message, conv] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: convId,
        senderId: userId,
        content: msgContent,
        attachmentUrl: attachmentUrl ?? null,
        attachmentType: attachmentType ?? null,
      },
      include: messageInclude,
    }),
    prisma.conversation.update({
      where: { id: convId },
      data: { updatedAt: new Date() },
      include: { members: { select: { userId: true } } },
    }),
  ]);

  res.status(201).json(message);

  // Real-time push to all members
  const payload = { conversationId: convId, message };
  for (const { userId: memberId } of conv.members) {
    if (memberId === userId) {
      // Push to sender's OTHER tabs too
      notifSvc.pushChatEvent(memberId, 'chat_message', payload);
    } else if (notifSvc.isUserOnline(memberId)) {
      notifSvc.pushChatEvent(memberId, 'chat_message', payload);
    } else {
      // Offline → persistent notification
      const senderName = message.sender.fullName;
      const title = conv.type === 'GROUP' ? (conv.name ?? 'Groupe') : senderName;
      void notifSvc.createNotification(
        memberId,
        'CHAT_MESSAGE',
        title,
        msgContent.slice(0, 60) + (msgContent.length > 60 ? '…' : ''),
        `/chat?conversationId=${convId}`,
      );
    }
  }
}

// ── PATCH /api/chat/messages/:id ──────────────────────────────────────────────

export async function editMessage(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  const msg = await prisma.message.findUnique({
    where: { id: req.params.id },
    select: { senderId: true, conversationId: true, deletedAt: true },
  });
  if (!msg)            { res.status(404).json({ message: 'Message introuvable' }); return; }
  if (msg.deletedAt)   { res.status(400).json({ message: 'Message supprimé' }); return; }
  if (msg.senderId !== userId) { res.status(403).json({ message: 'Non autorisé' }); return; }

  const { content } = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);

  const updated = await prisma.message.update({
    where: { id: req.params.id },
    data: { content, editedAt: new Date() },
    include: messageInclude,
  });
  res.json(updated);

  // Push edit to all online members
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: msg.conversationId },
    select: { userId: true },
  });
  for (const { userId: mId } of members) {
    notifSvc.pushChatEvent(mId, 'chat_message_edit', { conversationId: msg.conversationId, message: updated });
  }
}

// ── DELETE /api/chat/messages/:id ─────────────────────────────────────────────

export async function deleteMessage(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const msg = await prisma.message.findUnique({
    where: { id: req.params.id },
    select: { senderId: true, conversationId: true },
  });
  if (!msg) { res.status(404).json({ message: 'Message introuvable' }); return; }
  if (msg.senderId !== userId && role !== 'ADMIN') {
    res.status(403).json({ message: 'Non autorisé' }); return;
  }

  const deleted = await prisma.message.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
    include: messageInclude,
  });
  res.json(deleted);

  // Push delete event
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: msg.conversationId },
    select: { userId: true },
  });
  for (const { userId: mId } of members) {
    notifSvc.pushChatEvent(mId, 'chat_message_delete', {
      conversationId: msg.conversationId,
      messageId: req.params.id,
    });
  }
}

// ── PATCH /api/chat/conversations/:id/read ────────────────────────────────────

export async function markRead(req: Request, res: Response): Promise<void> {
  const { userId } = req.user!;
  await prisma.conversationMember.updateMany({
    where: { conversationId: req.params.id, userId },
    data: { lastReadAt: new Date() },
  });
  res.json({ ok: true });
}
