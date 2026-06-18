import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';
import * as notifSvc from '../../services/notificationService.js';
import path from 'path';

// ─── List submissions for a task ─────────────────────────────────────────────

export async function listSubmissions(req: Request, res: Response): Promise<void> {
  const { taskId } = req.params;
  const { userId, role } = req.user!;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, createdById: true, projectId: true,
      project: { select: { managerId: true } } },
  });
  if (!task) { res.status(404).json({ message: 'Tâche introuvable' }); return; }

  // Scope: assignee, creator, project manager, ADMIN/RH always
  const canView = role === 'ADMIN' || role === 'RH' ||
    task.assigneeId === userId || task.createdById === userId ||
    task.project?.managerId === userId;
  if (!canView) { res.status(403).json({ message: 'Accès refusé' }); return; }

  const submissions = await prisma.taskSubmission.findMany({
    where: role === 'EMPLOYE' ? { taskId, userId } : { taskId },
    include: {
      user: { select: { id: true, fullName: true } },
      files: true,
      reviews: {
        include: { reviewer: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(submissions);
}

// ─── Create a submission ──────────────────────────────────────────────────────

export async function createSubmission(req: Request, res: Response): Promise<void> {
  const { taskId } = req.params;
  const { userId, role } = req.user!;
  const { comment, progressPct, hoursSpent, externalLinks } = req.body;
  const files = (req.files as Express.Multer.File[]) ?? [];

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, createdById: true, title: true,
      project: { select: { managerId: true, id: true } } },
  });
  if (!task) { res.status(404).json({ message: 'Tâche introuvable' }); return; }

  // Only task assignee or creator can submit
  const canSubmit = role === 'ADMIN' || task.assigneeId === userId || task.createdById === userId;
  if (!canSubmit) { res.status(403).json({ message: 'Accès refusé' }); return; }

  const parsedLinks: string[] = externalLinks
    ? (typeof externalLinks === 'string' ? JSON.parse(externalLinks) : externalLinks)
    : [];

  const submission = await prisma.taskSubmission.create({
    data: {
      taskId,
      userId,
      comment: comment ?? null,
      progressPct: progressPct ? Number(progressPct) : null,
      hoursSpent: hoursSpent ? Number(hoursSpent) : null,
      externalLinks: parsedLinks.length ? parsedLinks : undefined,
      status: 'EN_COURS',
      files: files.length ? {
        create: files.map((f) => ({
          filename: f.filename,
          originalName: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
        })),
      } : undefined,
    },
    include: {
      user: { select: { id: true, fullName: true } },
      files: true,
      reviews: true,
    },
  });

  // Notify project manager
  if (task.project?.managerId && task.project.managerId !== userId) {
    void notifSvc.createNotification(
      task.project.managerId,
      'NEW_SUBMISSION',
      'Nouvelle contribution',
      `Une contribution a été soumise pour la tâche "${task.title}"`,
      `/tasks?taskId=${taskId}`,
    );
  }

  res.status(201).json(submission);
}

// ─── Review a submission ──────────────────────────────────────────────────────

export async function reviewSubmission(req: Request, res: Response): Promise<void> {
  const { submissionId } = req.params;
  const { userId, role } = req.user!;
  const { decision, comment } = req.body;

  if (!['ACCEPTE', 'REVISION_DEMANDEE'].includes(decision)) {
    res.status(400).json({ message: 'Décision invalide' }); return;
  }

  const submission = await prisma.taskSubmission.findUnique({
    where: { id: submissionId },
    include: {
      task: {
        select: { title: true, projectId: true,
          project: { select: { managerId: true } } },
      },
      user: { select: { id: true, fullName: true } },
      files: true,
    },
  });
  if (!submission) { res.status(404).json({ message: 'Soumission introuvable' }); return; }

  const managerId = submission.task.project?.managerId;
  const canReview = role === 'ADMIN' || role === 'RH' || managerId === userId;
  if (!canReview) { res.status(403).json({ message: 'Accès refusé' }); return; }

  const [review, updated] = await prisma.$transaction([
    prisma.submissionReview.create({
      data: { submissionId, reviewerId: userId, decision, comment: comment ?? null },
    }),
    prisma.taskSubmission.update({
      where: { id: submissionId },
      data: { status: decision },
    }),
  ]);

  // Auto-archive to GED if accepted
  if (decision === 'ACCEPTE' && submission.files.length) {
    await prisma.document.createMany({
      data: submission.files.map((f) => ({
        title: `[Auto] ${path.basename(f.originalName, path.extname(f.originalName))}`,
        filename: f.filename,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        uploadedById: submission.userId,
        isArchived: false,
      })),
    });
  }

  // Notify the submitter
  const notifBody = decision === 'ACCEPTE'
    ? `Votre contribution pour "${submission.task.title}" a été acceptée.`
    : `Une révision est demandée pour votre contribution sur "${submission.task.title}".`;

  if (submission.userId !== userId) {
    void notifSvc.createNotification(
      submission.userId,
      decision === 'ACCEPTE' ? 'SUBMISSION_ACCEPTED' : 'REVISION_REQUESTED',
      decision === 'ACCEPTE' ? 'Contribution acceptée' : 'Révision demandée',
      notifBody,
      `/tasks?taskId=${submission.taskId}`,
    );
  }

  res.json({ review, submission: updated });
}

// ─── Transfer a task ──────────────────────────────────────────────────────────

export async function transferTask(req: Request, res: Response): Promise<void> {
  const { taskId } = req.params;
  const { userId, role } = req.user!;
  const { toUserId, note } = req.body;

  if (!toUserId) { res.status(400).json({ message: 'Destinataire requis' }); return; }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, createdById: true, title: true,
      project: { select: { managerId: true, id: true } } },
  });
  if (!task) { res.status(404).json({ message: 'Tâche introuvable' }); return; }

  const canTransfer = role === 'ADMIN' || task.assigneeId === userId ||
    task.createdById === userId || task.project?.managerId === userId;
  if (!canTransfer) { res.status(403).json({ message: 'Accès refusé' }); return; }

  const toUser = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, fullName: true } });
  if (!toUser) { res.status(404).json({ message: 'Destinataire introuvable' }); return; }

  const [transfer] = await prisma.$transaction([
    prisma.taskTransfer.create({
      data: { taskId, fromUserId: userId, toUserId, note: note ?? null },
    }),
    prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: toUserId },
    }),
  ]);

  void notifSvc.createNotification(
    toUserId,
    'TASK_TRANSFERRED',
    'Tâche transférée',
    `La tâche "${task.title}" vous a été transférée.`,
    `/tasks?taskId=${taskId}`,
  );

  res.json(transfer);
}

// ─── Contribution % by project ────────────────────────────────────────────────

export async function getProjectContributions(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params;
  const { userId, role } = req.user!;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { managerId: true, members: { select: { userId: true } } },
  });
  if (!project) { res.status(404).json({ message: 'Projet introuvable' }); return; }

  const memberIds = [project.managerId, ...project.members.map((m) => m.userId)];
  const isMember = memberIds.includes(userId);
  if (!isMember && role !== 'ADMIN' && role !== 'RH') {
    res.status(403).json({ message: 'Accès refusé' }); return;
  }

  const rows = await prisma.$queryRaw<{ userId: string; fullName: string; cnt: bigint }[]>`
    SELECT s."userId", u."fullName", COUNT(s.id) AS cnt
    FROM "TaskSubmission" s
    JOIN "Task" t ON t.id = s."taskId"
    JOIN "User" u ON u.id = s."userId"
    WHERE t."projectId" = ${projectId}
    GROUP BY s."userId", u."fullName"
  `;

  const total = rows.reduce((acc, r) => acc + Number(r.cnt), 0);

  // EMPLOYE sees only own contribution
  const filtered = role === 'EMPLOYE'
    ? rows.filter((r) => r.userId === userId)
    : rows;

  const contributions = filtered.map((r) => ({
    userId: r.userId,
    fullName: r.fullName,
    count: Number(r.cnt),
    pct: total > 0 ? Math.round((Number(r.cnt) / total) * 100) : 0,
  }));

  res.json({ total, contributions });
}

// ─── Project deliverables ─────────────────────────────────────────────────────

export async function listDeliverables(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params;
  const { userId, role } = req.user!;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { managerId: true, members: { select: { userId: true } } },
  });
  if (!project) { res.status(404).json({ message: 'Projet introuvable' }); return; }

  const isMember = [project.managerId, ...project.members.map((m) => m.userId)].includes(userId);
  if (!isMember && role !== 'ADMIN' && role !== 'RH') {
    res.status(403).json({ message: 'Accès refusé' }); return;
  }

  const deliverables = await prisma.projectDeliverable.findMany({
    where: { projectId },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
    orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
  });

  // Group by category
  const grouped: Record<string, typeof deliverables> = {};
  for (const d of deliverables) {
    const cat = d.category ?? 'Autre';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(d);
  }

  res.json({ deliverables, grouped });
}

export async function createDeliverable(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params;
  const { userId, role } = req.user!;
  const { title, description, category } = req.body;
  const file = req.file;

  if (!file) { res.status(400).json({ message: 'Fichier requis' }); return; }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { managerId: true, members: { select: { userId: true } }, name: true },
  });
  if (!project) { res.status(404).json({ message: 'Projet introuvable' }); return; }

  const isMember = [project.managerId, ...project.members.map((m) => m.userId)].includes(userId);
  if (!isMember && role !== 'ADMIN' && role !== 'RH') {
    res.status(403).json({ message: 'Accès refusé' }); return;
  }

  // Get next version number for same title+category
  const prevCount = await prisma.projectDeliverable.count({
    where: { projectId, title: title ?? file.originalname, category: category ?? null },
  });

  const deliverable = await prisma.projectDeliverable.create({
    data: {
      projectId,
      title: title ?? file.originalname,
      description: description ?? null,
      category: category ?? null,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      version: prevCount + 1,
      uploadedById: userId,
    },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });

  // Notify project manager
  if (project.managerId !== userId) {
    void notifSvc.createNotification(
      project.managerId,
      'DELIVERABLE_UPLOADED',
      'Livrable déposé',
      `Un livrable a été déposé dans le projet "${project.name}".`,
      `/projects/${projectId}`,
    );
  }

  res.status(201).json(deliverable);
}
