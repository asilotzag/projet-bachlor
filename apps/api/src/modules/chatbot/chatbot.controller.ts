import type { Request, Response } from 'express';
import * as svc from '../../services/chatbotService.js';

export async function listConversations(req: Request, res: Response): Promise<void> {
  res.json(await svc.getConversations(req.user!.userId));
}

export async function newConversation(req: Request, res: Response): Promise<void> {
  const conv = await svc.createConversation(req.user!.userId, req.body.title);
  res.status(201).json(conv);
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const msgs = await svc.getMessages(req.params.id, req.user!.userId);
  if (!msgs) { res.status(404).json({ message: 'Conversation introuvable' }); return; }
  res.json(msgs);
}

export async function postMessage(req: Request, res: Response): Promise<void> {
  const { content, projectId } = req.body;
  if (!content?.trim()) { res.status(400).json({ message: 'Message vide' }); return; }
  const result = await svc.sendMessage(req.params.id, req.user!.userId, content.trim(), req.user!.role, projectId ?? undefined);
  if (!result) { res.status(404).json({ message: 'Conversation introuvable' }); return; }
  res.json(result);
}

export async function removeConversation(req: Request, res: Response): Promise<void> {
  const ok = await svc.deleteConversation(req.params.id, req.user!.userId);
  if (!ok) { res.status(404).json({ message: 'Conversation introuvable' }); return; }
  res.status(204).end();
}
