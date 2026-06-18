import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';
import { getAIProvider } from '../../services/ai/index.js';

// ── Build a rich but compact company snapshot for the AI ──────────────────────

async function buildCompanyContext() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    employees,
    projects,
    taskGroups,
    overdueCounts,
    recentTasks,
    projectTaskGroups,
    projectMembers,
    departments,
  ] = await Promise.all([
    prisma.employee.findMany({
      include: {
        user: { select: { fullName: true, email: true, role: { select: { name: true } } } },
        department: { select: { name: true } },
      },
    }),
    prisma.project.findMany({
      include: { manager: { select: { fullName: true } } },
    }),
    prisma.task.groupBy({ by: ['assigneeId', 'status'], _count: { id: true } }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { status: { not: 'DONE' }, dueDate: { lt: today } },
      _count: { id: true },
    }),
    prisma.task.findMany({
      select: {
        assigneeId: true, title: true, status: true, priority: true, dueDate: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    }),
    prisma.task.groupBy({ by: ['projectId', 'status'], _count: { id: true } }),
    prisma.projectMember.findMany({ include: { user: { select: { fullName: true } } } }),
    prisma.department.findMany({ include: { _count: { select: { employees: true } } } }),
  ]);

  // Per-employee stats
  const employeeSummaries = employees.map((emp) => {
    const groups = taskGroups.filter((g) => g.assigneeId === emp.userId);
    const total   = groups.reduce((s, g) => s + g._count.id, 0);
    const done    = groups.find((g) => g.status === 'DONE')?._count.id ?? 0;
    const inProg  = groups.find((g) => g.status === 'IN_PROGRESS')?._count.id ?? 0;
    const todo    = groups.find((g) => g.status === 'TODO')?._count.id ?? 0;
    const overdue = overdueCounts.find((o) => o.assigneeId === emp.userId)?._count.id ?? 0;
    const empProjects = [...new Set(
      recentTasks.filter((t) => t.assigneeId === emp.userId && t.project).map((t) => t.project!.name),
    )];
    const recent = recentTasks.filter((t) => t.assigneeId === emp.userId).slice(0, 5);

    return {
      nom: emp.user.fullName,
      email: emp.user.email,
      rôle: emp.user.role.name,
      département: emp.department?.name ?? 'Non assigné',
      poste: emp.position,
      tâches: {
        total, terminées: done, enCours: inProg, àFaire: todo, enRetard: overdue,
        tauxCompletion: total > 0 ? `${Math.round((done / total) * 100)}%` : '0%',
      },
      projets: empProjects,
      tâchesRécentes: recent.map((t) => ({
        titre: t.title, statut: t.status, priorité: t.priority,
        projet: t.project?.name ?? 'Autonome',
        échéance: t.dueDate ? t.dueDate.toLocaleDateString('fr-FR') : null,
      })),
    };
  });

  // Per-project stats
  const projectSummaries = projects.map((proj) => {
    const groups  = projectTaskGroups.filter((g) => g.projectId === proj.id);
    const total   = groups.reduce((s, g) => s + g._count.id, 0);
    const done    = groups.find((g) => g.status === 'DONE')?._count.id ?? 0;
    const inProg  = groups.find((g) => g.status === 'IN_PROGRESS')?._count.id ?? 0;
    const members = projectMembers.filter((pm) => pm.projectId === proj.id).map((pm) => pm.user.fullName);

    return {
      nom: proj.name,
      statut: proj.status,
      manager: proj.manager.fullName,
      membres: members,
      tâches: {
        total, terminées: done, enCours: inProg,
        tauxCompletion: total > 0 ? `${Math.round((done / total) * 100)}%` : '0%',
      },
      dateÉchéance: proj.dueDate ? proj.dueDate.toLocaleDateString('fr-FR') : 'Non définie',
    };
  });

  const totalTasks = taskGroups.reduce((s, g) => s + g._count.id, 0);
  const totalDone  = taskGroups.filter((g) => g.status === 'DONE').reduce((s, g) => s + g._count.id, 0);

  return {
    date: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    résumé: {
      totalEmployés: employees.length,
      totalProjets: projects.length,
      totalTâches: totalTasks,
      tauxGlobalCompletion: totalTasks > 0 ? `${Math.round((totalDone / totalTasks) * 100)}%` : '0%',
      départements: departments.map((d) => ({ nom: d.name, effectif: d._count.employees })),
    },
    employés: employeeSummaries,
    projets: projectSummaries,
  };
}

// ── Controller ────────────────────────────────────────────────────────────────

export async function generateReport(req: Request, res: Response): Promise<void> {
  const { query } = req.body as { query: string };

  if (!query?.trim()) {
    res.status(400).json({ message: 'La requête ne peut pas être vide' });
    return;
  }

  try {
    const context = await buildCompanyContext();

    const prompt = `Tu es un générateur de rapports d'entreprise professionnel et expert en analyse de données RH.
Tu dois créer un rapport détaillé, précis et professionnel en français basé sur la requête de l'utilisateur et les données réelles de l'entreprise.

DONNÉES DE L'ENTREPRISE (${context.date}) :
${JSON.stringify(context, null, 2)}

REQUÊTE DE L'UTILISATEUR : "${query}"

Génère un rapport professionnel structuré au format JSON UNIQUEMENT (sans texte avant ou après, sans balises markdown) avec cette structure exacte :
{
  "title": "Titre précis du rapport",
  "period": "Période couverte (ex: Juin 2026 ou Mois en cours)",
  "summary": "Résumé exécutif clair en 2-3 phrases avec les chiffres clés",
  "kpis": [
    { "label": "Nom de l'indicateur", "value": "Valeur numérique ou pourcentage", "trend": "up|down|stable", "detail": "Contexte ou comparaison optionnelle" }
  ],
  "sections": [
    {
      "heading": "Titre de la section",
      "content": "Analyse détaillée avec les données réelles",
      "items": ["Point clé 1 avec données", "Point clé 2 avec données"]
    }
  ],
  "conclusion": "Conclusion avec recommandations actionnables"
}

Instructions strictes :
- Réponds UNIQUEMENT avec le JSON valide, rien d'autre
- Utilise exclusivement les données réelles fournies ci-dessus
- Cite des noms, chiffres et pourcentages réels
- Si la personne ou le projet mentionné n'existe pas dans les données, indique-le clairement dans le résumé
- Génère entre 3 et 5 KPIs pertinents pour la requête
- Génère entre 2 et 4 sections thématiques
- Les items doivent contenir des données chiffrées réelles
- Sois analytique et objectif`;

    const ai = getAIProvider();
    const raw = await ai.generate(prompt);

    // Strip any markdown fences the AI might add
    const cleaned = raw
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/\s*```\s*$/im, '')
      .trim();

    const report = JSON.parse(cleaned);

    res.json({ ...report, query, generatedAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('[reports] error:', err);
    if (err instanceof SyntaxError) {
      res.status(500).json({ message: 'L\'IA n\'a pas retourné un format valide. Veuillez reformuler votre demande.' });
    } else {
      res.status(500).json({ message: 'Erreur lors de la génération du rapport. Réessayez dans quelques instants.' });
    }
  }
}
