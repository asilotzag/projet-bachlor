import type { Request, Response } from 'express';
import { z } from 'zod';
import { getAIProvider } from '../../services/ai/index.js';
import { prisma } from '../../prisma.js';

// ─── Génération de contenu ────────────────────────────────────────────────────

const GenerateSchema = z.object({
  type: z.enum(['task_description', 'job_posting', 'leave_response', 'project_summary', 'report', 'custom']),
  context: z.record(z.string()).optional(),
  customPrompt: z.string().optional(),
});

const TYPE_PROMPTS: Record<string, (ctx: Record<string, string>) => string> = {
  task_description: (ctx) =>
    `Tu es un assistant professionnel pour une application de gestion d'entreprise.
Génère une description détaillée et professionnelle pour la tâche suivante :
- Titre : ${ctx.title ?? 'Non précisé'}
- Projet : ${ctx.project ?? 'Non précisé'}
- Priorité : ${ctx.priority ?? 'MEDIUM'}
La description doit inclure : objectif, critères d'acceptation (3-5 points), livrables attendus.
Réponds en français, format markdown, 150-250 mots.`,

  job_posting: (ctx) =>
    `Tu es un responsable RH. Rédige une offre d'emploi professionnelle pour :
- Poste : ${ctx.position ?? 'Non précisé'}
- Département : ${ctx.department ?? 'Non précisé'}
- Type de contrat : ${ctx.contractType ?? 'CDI'}
Inclure : présentation du poste, missions principales (5 points), profil recherché, avantages.
Réponds en français, format markdown, 200-300 mots.`,

  leave_response: (ctx) =>
    `Tu es un responsable RH. Rédige une réponse formelle à une demande de congé :
- Employé : ${ctx.employeeName ?? 'Non précisé'}
- Type de congé : ${ctx.leaveType ?? 'Non précisé'}
- Période : du ${ctx.startDate ?? '?'} au ${ctx.endDate ?? '?'}
- Décision : ${ctx.decision ?? 'approuvé'}
Ton professionnel et bienveillant, 3-4 phrases.`,

  project_summary: (ctx) =>
    `Tu es un chef de projet. Rédige un résumé exécutif du projet suivant :
- Nom : ${ctx.name ?? 'Non précisé'}
- Description : ${ctx.description ?? 'Non précisé'}
- Tâches terminées : ${ctx.doneTasks ?? '0'} / ${ctx.totalTasks ?? '0'}
- Membres : ${ctx.memberCount ?? '0'}
Inclure : état d'avancement, points clés, recommandations.
Réponds en français, format markdown, 150-200 mots.`,

  report: (ctx) =>
    `Tu es un analyste d'entreprise. Génère un rapport synthétique sur :
- Période : ${ctx.period ?? 'ce mois'}
- Documents traités : ${ctx.documents ?? '0'}
- Tâches complétées : ${ctx.tasksCompleted ?? '0'}
- Congés approuvés : ${ctx.leavesApproved ?? '0'}
Format : résumé exécutif, chiffres clés, points d'attention, recommandations.
Réponds en français, format markdown.`,

  custom: (ctx) => ctx.prompt ?? 'Génère un texte professionnel.',
};

export async function generateContent(req: Request, res: Response): Promise<void> {
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides' }); return; }

  const { type, context = {}, customPrompt } = parsed.data;
  if (type === 'custom' && !customPrompt) {
    res.status(400).json({ message: 'customPrompt requis pour le type custom' });
    return;
  }

  const promptFn = TYPE_PROMPTS[type];
  const prompt = type === 'custom' ? customPrompt! : promptFn({ ...context, prompt: customPrompt ?? '' });

  try {
    const ai = getAIProvider();
    const result = await ai.generate(prompt);
    res.json({ content: result, type });
  } catch (err: any) {
    res.status(503).json({ message: 'Service IA indisponible', detail: err.message });
  }
}

// ─── Insights & anomalies ─────────────────────────────────────────────────────

export async function getInsights(_req: Request, res: Response): Promise<void> {
  // Collecter les données récentes pour analyse
  const [
    overdueTasks,
    pendingLeaves,
    tasksByAssignee,
    lowConfidenceDocs,
    recentProjects,
  ] = await Promise.all([
    // Tâches en retard
    prisma.task.findMany({
      where: { dueDate: { lt: new Date() }, status: { not: 'DONE' } },
      include: { assignee: { select: { fullName: true } }, project: { select: { name: true } } },
      take: 10,
    }),
    // Congés en attente depuis > 3 jours
    prisma.leaveRequest.findMany({
      where: {
        status: 'EN_ATTENTE',
        createdAt: { lt: new Date(Date.now() - 3 * 86400000) },
      },
      include: { employee: { include: { user: { select: { fullName: true } } } } },
      take: 5,
    }),
    // Charge par assigné (tâches actives)
    prisma.task.groupBy({
      by: ['assigneeId'],
      _count: { id: true },
      where: { status: { not: 'DONE' }, assigneeId: { not: null } },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
    // Documents avec analyse IA basse confiance
    prisma.aiAnalysis.findMany({
      where: { confidence: { lt: 0.6 } },
      include: { document: { select: { title: true } } },
      take: 5,
    }),
    // Projets sans activité récente
    prisma.project.findMany({
      where: {
        status: 'ACTIVE',
        updatedAt: { lt: new Date(Date.now() - 7 * 86400000) },
      },
      take: 5,
    }),
  ]);

  // Résoudre les noms des assignés
  const assigneeIds = tasksByAssignee.map((t) => t.assigneeId).filter(Boolean) as string[];
  const assignees = assigneeIds.length
    ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, fullName: true } })
    : [];
  const assigneeMap = Object.fromEntries(assignees.map((a) => [a.id, a.fullName]));

  // Construire les insights sans IA (règles heuristiques)
  const insights: { type: 'warning' | 'info' | 'danger'; title: string; description: string }[] = [];

  if (overdueTasks.length > 0) {
    insights.push({
      type: 'danger',
      title: `${overdueTasks.length} tâche${overdueTasks.length > 1 ? 's' : ''} en retard`,
      description: `Tâches dépassées : ${overdueTasks.slice(0, 3).map((t) => `"${t.title}" (${t.assignee?.fullName ?? 'non assigné'})`).join(', ')}${overdueTasks.length > 3 ? '…' : ''}`,
    });
  }

  if (pendingLeaves.length > 0) {
    insights.push({
      type: 'warning',
      title: `${pendingLeaves.length} demande${pendingLeaves.length > 1 ? 's' : ''} de congé en attente depuis +3 jours`,
      description: `Employés concernés : ${pendingLeaves.map((l) => l.employee.user.fullName).join(', ')}`,
    });
  }

  const overloaded = tasksByAssignee.filter((t) => t._count.id >= 5);
  if (overloaded.length > 0) {
    insights.push({
      type: 'warning',
      title: `Surcharge détectée`,
      description: `${overloaded.map((t) => `${assigneeMap[t.assigneeId!] ?? '?'} (${t._count.id} tâches actives)`).join(', ')}`,
    });
  }

  if (lowConfidenceDocs.length > 0) {
    insights.push({
      type: 'info',
      title: `${lowConfidenceDocs.length} document${lowConfidenceDocs.length > 1 ? 's' : ''} avec analyse IA incertaine`,
      description: `Documents à réviser : ${lowConfidenceDocs.map((d) => d.document.title).join(', ')}`,
    });
  }

  if (recentProjects.length > 0) {
    insights.push({
      type: 'info',
      title: `${recentProjects.length} projet${recentProjects.length > 1 ? 's' : ''} sans activité depuis 7+ jours`,
      description: `Projets inactifs : ${recentProjects.map((p) => p.name).join(', ')}`,
    });
  }

  if (insights.length === 0) {
    insights.push({ type: 'info', title: 'Tout est à jour', description: 'Aucune anomalie détectée. Bonne gestion !' });
  }

  // Résumé IA uniquement avec Gemini (Ollama trop lent pour bloquer la réponse)
  let aiSummary: string | null = null;
  if (process.env.AI_PROVIDER === 'gemini' && process.env.GEMINI_API_KEY) {
    try {
      const ai = getAIProvider();
      const prompt = `Tu es un assistant d'aide à la décision pour une entreprise.
Voici l'état actuel (données du ${new Date().toLocaleDateString('fr-FR')}) :
- ${overdueTasks.length} tâches en retard
- ${pendingLeaves.length} demandes de congé en attente
- ${overloaded.length} employés surchargés
- ${recentProjects.length} projets inactifs
Donne 3 recommandations concrètes et prioritaires en moins de 150 mots. Format: liste à puces.`;
      aiSummary = await ai.generate(prompt);
    } catch {
      // silencieux si IA indisponible
    }
  }

  res.json({ insights, aiSummary });
}
