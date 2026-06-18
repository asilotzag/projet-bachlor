import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';
import { getAIProvider } from '../../services/ai/index.js';

// ─── Work Journal ─────────────────────────────────────────────────────────────

export async function getJournal(req: Request, res: Response): Promise<void> {
  const { userId: targetUserId } = req.params;
  const { userId, role } = req.user!;

  // Self or admin/rh/manager
  if (targetUserId !== userId && role !== 'ADMIN' && role !== 'RH') {
    if (role === 'MANAGER') {
      const supervised = await prisma.employee.findFirst({
        where: { userId: targetUserId, managerId: userId },
      });
      if (!supervised) { res.status(403).json({ message: 'Accès refusé' }); return; }
    } else {
      res.status(403).json({ message: 'Accès refusé' }); return;
    }
  }

  const { from, to, projectId } = req.query as Record<string, string>;

  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const toDate   = to   ? new Date(to)   : new Date();
  fromDate.setUTCHours(0, 0, 0, 0);
  toDate.setUTCHours(23, 59, 59, 999);

  const submissionWhere: any = {
    userId: targetUserId,
    createdAt: { gte: fromDate, lte: toDate },
  };
  if (projectId) submissionWhere.task = { projectId };

  const submissions = await prisma.taskSubmission.findMany({
    where: submissionWhere,
    include: {
      task: {
        select: { id: true, title: true, status: true,
          project: { select: { id: true, name: true } } },
      },
      files: { select: { id: true, originalName: true, size: true } },
      reviews: {
        select: { decision: true, comment: true, createdAt: true,
          reviewer: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalHours = submissions.reduce((acc, s) => acc + (s.hoursSpent ?? 0), 0);
  const totalFiles = submissions.reduce((acc, s) => acc + s.files.length, 0);
  const accepted   = submissions.filter((s) => s.status === 'ACCEPTE').length;

  res.json({
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    summary: {
      total: submissions.length,
      accepted,
      pending: submissions.filter((s) => s.status === 'EN_COURS').length,
      revision: submissions.filter((s) => s.status === 'REVISION_DEMANDEE').length,
      totalHours: Math.round(totalHours * 10) / 10,
      totalFiles,
    },
    entries: submissions,
  });
}

// ─── AI Report Generation ─────────────────────────────────────────────────────

export async function generateReport(req: Request, res: Response): Promise<void> {
  const { userId: targetUserId } = req.params;
  const { userId, role } = req.user!;
  const { type = 'weekly', projectId, saveToGed } = req.body;

  if (targetUserId !== userId && role !== 'ADMIN' && role !== 'RH' && role !== 'MANAGER') {
    res.status(403).json({ message: 'Accès refusé' }); return;
  }

  const now = new Date();
  let fromDate: Date;
  if (type === 'weekly')  fromDate = new Date(now.getTime() - 7 * 86400000);
  else if (type === 'monthly') fromDate = new Date(now.getTime() - 30 * 86400000);
  else fromDate = new Date(now.getTime() - 90 * 86400000); // project/quarterly

  const submissions = await prisma.taskSubmission.findMany({
    where: {
      userId: targetUserId,
      createdAt: { gte: fromDate },
      ...(projectId ? { task: { projectId } } : {}),
    },
    include: {
      task: { select: { title: true, status: true,
        project: { select: { name: true } } } },
      files: { select: { originalName: true } },
      reviews: { select: { decision: true, comment: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });

  const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { fullName: true } });
  const totalHours = submissions.reduce((acc, s) => acc + (s.hoursSpent ?? 0), 0);

  const periodLabel = type === 'weekly' ? 'hebdomadaire' : type === 'monthly' ? 'mensuel' : 'projet';

  const submissionsText = submissions.map((s, i) =>
    `${i + 1}. Tâche: "${s.task.title}" (Projet: ${s.task.project?.name ?? 'Sans projet'}) ` +
    `| Avancement: ${s.progressPct ?? '?'}% | Heures: ${s.hoursSpent ?? '?'}h ` +
    `| Statut: ${s.status} | Fichiers: ${s.files.map((f) => f.originalName).join(', ') || 'aucun'}` +
    (s.comment ? ` | Note: ${s.comment}` : ''),
  ).join('\n');

  const prompt = `Tu es un assistant RH expert. Génère un rapport de travail ${periodLabel} professionnel en français pour ${user?.fullName ?? 'un employé'}.

Période: ${fromDate.toLocaleDateString('fr-FR')} au ${now.toLocaleDateString('fr-FR')}
Total heures déclarées: ${Math.round(totalHours * 10) / 10}h
Nombre de contributions: ${submissions.length}

Contributions:
${submissionsText || 'Aucune contribution enregistrée sur cette période.'}

Génère un rapport structuré avec:
1. Résumé exécutif (2-3 phrases)
2. Réalisations principales (bullet points)
3. Points d'attention / révisions demandées (si applicable)
4. Heures et productivité
5. Recommandations (1-2 points)

Format: texte clair, professionnel, sans markdown excessif.`;

  let reportText: string;
  try {
    const ai = getAIProvider();
    reportText = await ai.generate(prompt);
  } catch {
    reportText = `Rapport ${periodLabel} - ${user?.fullName ?? 'Employé'}\n` +
      `Période: ${fromDate.toLocaleDateString('fr-FR')} - ${now.toLocaleDateString('fr-FR')}\n\n` +
      `Contributions: ${submissions.length}\nHeures totales: ${Math.round(totalHours * 10) / 10}h\n\n` +
      submissions.map((s) => `• ${s.task.title}: ${s.progressPct ?? '?'}% — ${s.status}`).join('\n');
  }

  // Optionally save to GED
  let documentId: string | null = null;
  if (saveToGed) {
    const reportFilename = `rapport_${type}_${targetUserId}_${Date.now()}.txt`;
    const fs = await import('fs/promises');
    const path = await import('path');
    const { UPLOAD_DIR_PATH } = await import('../../lib/storage.js');
    const filePath = path.join(UPLOAD_DIR_PATH, reportFilename);
    await fs.writeFile(filePath, reportText, 'utf-8');

    const doc = await prisma.document.create({
      data: {
        title: `Rapport ${periodLabel} — ${user?.fullName ?? 'Employé'} — ${now.toLocaleDateString('fr-FR')}`,
        filename: reportFilename,
        originalName: `rapport_${type}.txt`,
        mimeType: 'text/plain',
        size: Buffer.byteLength(reportText, 'utf-8'),
        uploadedById: userId,
      },
    });
    documentId = doc.id;
  }

  res.json({ report: reportText, documentId });
}
