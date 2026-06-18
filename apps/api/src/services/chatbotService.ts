import { prisma } from '../prisma.js';
import { getAIProvider } from './ai/index.js';

// ── Project context builder ───────────────────────────────────────────────────

async function buildProjectContext(projectId: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        select: {
          title: true, status: true, priority: true, dueDate: true,
          assignee: { select: { fullName: true } },
        },
      },
      members: {
        include: { user: { select: { fullName: true } } },
      },
      manager: { select: { fullName: true } },
    },
  });

  if (!project) return null;

  const overdue = project.tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'DONE');

  return {
    nom: project.name,
    description: project.description ?? '',
    statut: project.status,
    dateEcheance: project.dueDate ? project.dueDate.toLocaleDateString('fr-FR') : 'Non définie',
    manager: project.manager?.fullName ?? 'Non défini',
    membres: project.members.map((m) => ({ nom: m.user.fullName })),
    resumeTaches: {
      total: project.tasks.length,
      terminées: project.tasks.filter((t) => t.status === 'DONE').length,
      enCours: project.tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      àFaire: project.tasks.filter((t) => t.status === 'TODO').length,
      enRetard: overdue.length,
    },
    tachesEnRetard: overdue.map((t) => ({
      titre: t.title,
      assignéÀ: t.assignee?.fullName ?? 'Non assigné',
      écheance: t.dueDate?.toLocaleDateString('fr-FR'),
    })),
    toutesLesTaches: project.tasks.map((t) => ({
      titre: t.title,
      statut: t.status,
      priorité: t.priority,
      assignéÀ: t.assignee?.fullName ?? 'Non assigné',
      écheance: t.dueDate ? t.dueDate.toLocaleDateString('fr-FR') : null,
    })),
  };
}

// ── Context builder ───────────────────────────────────────────────────────────

async function buildContext(userId: string, role: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextWeek = new Date(today.getTime() + 7 * 86400000);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [myTasks, approvedLeaves, unreadNotifs, upcomingMeetings] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: userId },
      select: { title: true, status: true, priority: true, dueDate: true, project: { select: { name: true } } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    }),
    prisma.leaveRequest.findMany({
      where: { employee: { userId }, status: 'APPROUVE', startDate: { gte: yearStart } },
      select: { startDate: true, endDate: true, type: true },
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.meeting.findMany({
      where: {
        OR: [{ createdById: userId }, { attendees: { some: { userId } } }],
        startAt: { gte: today, lte: nextWeek },
      },
      select: { title: true, startAt: true, endAt: true, location: true },
      orderBy: { startAt: 'asc' },
    }),
  ]);

  let leaveDaysUsed = 0;
  for (const l of approvedLeaves) {
    if (l.type === 'CONGE_PAYE') {
      leaveDaysUsed += Math.round((l.endDate.getTime() - l.startDate.getTime()) / 86400000) + 1;
    }
  }

  const overdue = myTasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'DONE');

  const ctx: Record<string, unknown> = {
    date: now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    myTasks: myTasks.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toLocaleDateString('fr-FR') : null,
      project: t.project?.name ?? 'Autonome',
    })),
    overdueTasks: overdue.map((t) => t.title),
    leaveBalance: { used: leaveDaysUsed, total: 25, remaining: 25 - leaveDaysUsed },
    unreadNotifications: unreadNotifs,
    upcomingMeetings: upcomingMeetings.map((m) => ({
      title: m.title,
      startAt: m.startAt.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      endAt: m.endAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      location: m.location,
    })),
  };

  if (role === 'MANAGER') {
    const supervised = await prisma.employee.findMany({
      where: { managerId: userId },
      select: { userId: true, user: { select: { fullName: true } } },
    });
    const teamIds = [userId, ...supervised.map((e) => e.userId)];
    const [taskGroups, pendingLeaves] = await Promise.all([
      prisma.task.groupBy({ by: ['status'], where: { assigneeId: { in: teamIds } }, _count: { id: true } }),
      prisma.leaveRequest.count({ where: { status: 'EN_ATTENTE' } }),
    ]);
    ctx.teamContext = {
      members: supervised.map((e) => e.user.fullName),
      taskSummary: Object.fromEntries(taskGroups.map((g) => [g.status, g._count.id])),
      pendingLeaves,
    };
  }

  if (role === 'RH') {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const [pendingLeaves, expiringContracts] = await Promise.all([
      prisma.leaveRequest.count({ where: { status: 'EN_ATTENTE' } }),
      prisma.contract.count({ where: { isActive: true, endDate: { lte: monthEnd, gte: today } } }),
    ]);
    ctx.rhContext = { pendingLeaves, expiringContracts };
  }

  if (role === 'ADMIN') {
    const [totalUsers, activeProjects, pendingLeaves] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.leaveRequest.count({ where: { status: 'EN_ATTENTE' } }),
    ]);
    ctx.systemContext = { totalUsers, activeProjects, pendingLeaves };
  }

  return ctx;
}

// ── Intent shortcuts (no LLM needed) ─────────────────────────────────────────

function detectIntent(msg: string): string | null {
  const l = msg.toLowerCase();
  const has = (...terms: string[]) => terms.some((t) => l.includes(t));
  if (has('aide', 'help', 'que peux-tu', 'tu fais quoi', 'quoi faire', 'fonctionnalit')) return 'help';
  if (has('tâche', 'tache', 'task', 'retard', 'en cours', 'à faire', 'todo')) return 'tasks';
  if (has('solde', 'congé', 'conge', 'vacance', 'rti', 'jour', 'reste')) return 'leaves';
  if (has('notification', 'notif', 'alerte', 'message non lu')) return 'notifications';
  if (has('réunion', 'reunion', 'meeting', 'rendez-vous', 'agenda', 'calendrier')) return 'meetings';
  if (has('équipe', 'equipe', 'team', 'collaborateur', 'membre')) return 'team';
  if (has('projet', 'project')) return 'projects';
  if (has('présence', 'presence', 'attendance', 'feuille', 'pointage')) return 'attendance';
  if (has('contrat', 'contract', 'expire', 'expir')) return 'contracts';
  if (has('bonjour', 'bonsoir', 'salut', 'hello', 'hi ')) return 'greeting';
  return null;
}

function shortcutReply(intent: string, ctx: Record<string, unknown>): string {
  const tasks = (ctx.myTasks as any[]) ?? [];
  const overdue = (ctx.overdueTasks as string[]) ?? [];
  const bal = (ctx.leaveBalance as { used: number; total: number; remaining: number }) ?? { used: 0, total: 25, remaining: 25 };
  const meetings = (ctx.upcomingMeetings as any[]) ?? [];

  switch (intent) {
    case 'tasks': {
      if (!tasks.length) return 'Vous n\'avez aucune tâche assignée pour le moment. ✅';
      const active = tasks.filter((t: any) => t.status !== 'DONE');
      const lines = active.slice(0, 10).map(
        (t: any) => `- **${t.title}** — ${t.status}, priorité ${t.priority}${t.dueDate ? `, échéance le ${t.dueDate}` : ''}${t.project !== 'Autonome' ? ` *(${t.project})*` : ''}`,
      );
      let reply = `Vous avez **${active.length} tâche(s) active(s)** :\n\n${lines.join('\n')}`;
      if (overdue.length) reply += `\n\n⚠️ **${overdue.length} en retard** : ${overdue.join(', ')}`;
      return reply;
    }
    case 'leaves':
      return `**Solde de congés payés (${new Date().getFullYear()}) :**\n- Jours utilisés : **${bal.used}**\n- Jours restants : **${bal.remaining}** / ${bal.total}`;
    case 'notifications': {
      const n = (ctx.unreadNotifications as number) ?? 0;
      return n === 0
        ? 'Aucune notification non lue en ce moment. ✅'
        : `Vous avez **${n} notification(s) non lue(s)**. Cliquez sur la cloche 🔔 en haut à droite pour les voir.`;
    }
    case 'meetings':
      if (!meetings.length) return 'Aucune réunion prévue dans les 7 prochains jours.';
      return `**Réunions à venir :**\n\n${meetings.map((m: any) => `- **${m.title}** — ${m.startAt} → ${m.endAt}${m.location ? ` 📍 ${m.location}` : ''}`).join('\n')}`;
    default:
      return '';
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getConversations(userId: string) {
  return prisma.chatbotConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } },
  });
}

export async function createConversation(userId: string, title?: string) {
  return prisma.chatbotConversation.create({
    data: { userId, title: title ?? null },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
}

export async function getMessages(conversationId: string, userId: string) {
  const conv = await prisma.chatbotConversation.findFirst({ where: { id: conversationId, userId } });
  if (!conv) return null;
  return prisma.chatbotMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, content: true, createdAt: true },
  });
}

export async function sendMessage(
  conversationId: string,
  userId: string,
  content: string,
  role: string,
  projectId?: string,
) {
  const conv = await prisma.chatbotConversation.findFirst({ where: { id: conversationId, userId } });
  if (!conv) return null;

  // Persist user message
  await prisma.chatbotMessage.create({ data: { conversationId, role: 'user', content } });

  // Auto-title the conversation from first message
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (!conv.title) updateData.title = content.slice(0, 60);
  await prisma.chatbotConversation.update({ where: { id: conversationId }, data: updateData });

  // Build context for this user (and optionally a project)
  const [ctx, projectCtx] = await Promise.all([
    buildContext(userId, role),
    projectId ? buildProjectContext(projectId) : Promise.resolve(null),
  ]);

  // Try intent shortcut first (fast, no LLM) — only when no project context
  const intent = !projectCtx ? detectIntent(content) : null;
  let reply = intent ? shortcutReply(intent, ctx) : '';

  // Full LLM call if no shortcut matched
  if (!reply) {
    // Fetch last 10 messages for context window
    const history = await prisma.chatbotMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
      take: 20,
    });

    const historyText = history
      .slice(-10)
      .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    const fullName = user?.fullName ?? 'Utilisateur';

    const projectSection = projectCtx
      ? `\nContexte du projet sélectionné :\n${JSON.stringify(projectCtx, null, 2)}\n`
      : '';

    const prompt = `Tu es l'assistant IA de l'application "Gestion Entreprise".
Tu parles toujours en français. Tu es concis, professionnel et bienveillant.
Tu t'adresses à ${fullName} (rôle : ${role}).
Date d'aujourd'hui : ${ctx.date}
${projectSection}
Données disponibles pour cet utilisateur :
${JSON.stringify(ctx, null, 2)}

Règles strictes :
- Réponds UNIQUEMENT avec les informations disponibles ci-dessus.
- Si un projet est sélectionné, priorise ses données pour répondre aux questions sur les tâches, membres et retards.
- Si on te demande des données hors portée, refuse poliment.
- Pour les questions de navigation, guide l'utilisateur vers la bonne page de l'app (Tableau de bord, Tâches, RH, Calendrier, Messages, Documents, Rapports).
- Si tu ne sais pas, dis-le clairement.
- Utilise le markdown (gras, listes) pour structurer tes réponses.

${historyText ? `Historique récent :\n${historyText}\n\n` : ''}Utilisateur: ${content}
Assistant:`;

    try {
      const ai = getAIProvider();
      reply = await ai.generate(prompt);
    } catch (err) {
      console.error('[chatbot] AI error:', err);
      reply = 'Désolé, le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.';
    }
  }

  // Persist and return assistant message
  return prisma.chatbotMessage.create({
    data: { conversationId, role: 'assistant', content: reply },
    select: { id: true, role: true, content: true, createdAt: true },
  });
}

export async function deleteConversation(conversationId: string, userId: string) {
  const conv = await prisma.chatbotConversation.findFirst({ where: { id: conversationId, userId } });
  if (!conv) return false;
  await prisma.chatbotConversation.delete({ where: { id: conversationId } });
  return true;
}
