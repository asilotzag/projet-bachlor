import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';
import { getAIProvider } from '../../services/ai/index.js';

export async function generateTasks(req: Request, res: Response): Promise<void> {
  const { id: projectId } = req.params;
  const { goal } = req.body;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true },
  });
  if (!project) { res.status(404).json({ message: 'Projet introuvable' }); return; }

  const prompt = `Tu es un chef de projet expert. Pour le projet suivant, génère une liste de tâches actionnable.

Projet : "${project.name}"
Description : "${project.description ?? 'Non définie'}"
${goal ? `Objectif spécifique : "${goal}"` : ''}

Génère entre 5 et 10 tâches pertinentes. Réponds UNIQUEMENT en JSON valide (sans markdown), avec ce format exact :
[
  {
    "title": "Titre de la tâche",
    "description": "Description courte",
    "priority": "HIGH" | "MEDIUM" | "LOW",
    "dayOffset": 7
  }
]

dayOffset = nombre de jours à partir d'aujourd'hui pour l'échéance.`;

  let tasks: Array<{ title: string; description?: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; dayOffset: number }>;

  try {
    const ai = getAIProvider();
    const raw = await ai.generate(prompt);
    const clean = raw.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim();
    const jsonStart = clean.indexOf('[');
    const jsonEnd = clean.lastIndexOf(']');
    tasks = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    console.error('[generate-tasks] AI error:', err);
    res.status(502).json({ message: 'Erreur de génération IA' });
    return;
  }

  res.json({ tasks });
}

export async function confirmGeneratedTasks(req: Request, res: Response): Promise<void> {
  const { id: projectId } = req.params;
  const { tasks } = req.body as {
    tasks: Array<{ title: string; description?: string; priority: string; dayOffset: number }>;
  };

  if (!Array.isArray(tasks) || tasks.length === 0) {
    res.status(400).json({ message: 'Aucune tâche à créer' });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) { res.status(404).json({ message: 'Projet introuvable' }); return; }

  const now = new Date();
  const created = await prisma.$transaction(
    tasks.map((t) =>
      prisma.task.create({
        data: {
          title: t.title,
          description: t.description ?? null,
          priority: (t.priority as any) ?? 'MEDIUM',
          status: 'TODO',
          projectId,
          createdById: req.user!.userId,
          dueDate: new Date(now.getTime() + (t.dayOffset ?? 7) * 86400000),
        },
      }),
    ),
  );

  res.status(201).json({ created: created.length });
}
