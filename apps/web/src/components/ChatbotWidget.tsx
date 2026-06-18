import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot, X, Send, Plus, Trash2, ChevronLeft, Loader2,
  MessageSquareDot, Sparkles, FolderOpen,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

interface BotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
}

// ─── Quick prompts per role ───────────────────────────────────────────────────

const QUICK_PROMPTS: Record<string, string[]> = {
  EMPLOYE:  ['Mes tâches en retard', 'Mon solde de congés', 'Mes réunions cette semaine', 'Mes notifications'],
  MANAGER:  ['Tâches de mon équipe', 'Mes projets en cours', 'Échéances cette semaine', 'Congés en attente'],
  RH:       ['Présences du jour', 'Congés en attente de validation', 'Contrats expirant ce mois', 'Comment approuver un congé ?'],
  ADMIN:    ['Vue d\'ensemble système', 'Utilisateurs actifs', 'Projets en cours', 'Comment créer un utilisateur ?'],
};

const PROJECT_PROMPTS = [
  'Quelles tâches sont en retard ?',
  'Qui travaille sur ce projet ?',
  'Quel est l\'état d\'avancement ?',
  'Résume les tâches en cours',
];

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function ChatbotWidget() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [showList, setShowList] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Projects list ──
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-chatbot'],
    queryFn: () => api.get('/api/projects').then((r) => r.data),
    enabled: isOpen,
    staleTime: 60_000,
  });

  // ── Conversations list ──
  const { data: conversations = [] } = useQuery<BotConversation[]>({
    queryKey: ['chatbot-conversations'],
    queryFn: () => api.get('/api/chatbot/conversations').then((r) => r.data),
    enabled: isOpen,
    staleTime: 30_000,
  });

  // ── Messages for active conversation ──
  const { data: fetchedMessages } = useQuery<BotMessage[]>({
    queryKey: ['chatbot-messages', activeConvId],
    queryFn: () => api.get(`/api/chatbot/conversations/${activeConvId}/messages`).then((r) => r.data),
    enabled: !!activeConvId,
    staleTime: 0,
  });

  useEffect(() => {
    if (fetchedMessages) setMessages(fetchedMessages);
  }, [fetchedMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Focus input when conversation opens
  useEffect(() => {
    if (activeConvId && !showList) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeConvId, showList]);

  // ── Delete conversation ──
  const deleteConvMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/chatbot/conversations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-conversations'] });
      if (activeConvId) {
        setActiveConvId(null);
        setMessages([]);
        setShowList(true);
      }
      toast.success('Conversation supprimée');
    },
  });

  // ── Send message ──
  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isThinking) return;

    let convId = activeConvId;

    // Create conversation on first message if none active
    if (!convId) {
      try {
        const conv = await api.post('/api/chatbot/conversations', { title: content.slice(0, 60) }).then((r) => r.data);
        qc.invalidateQueries({ queryKey: ['chatbot-conversations'] });
        convId = conv.id;
        setActiveConvId(conv.id);
        setShowList(false);
      } catch {
        toast.error('Erreur lors de la création de la conversation');
        return;
      }
    }

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    const userMsg: BotMessage = { id: tempId, role: 'user', content, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    try {
      const reply = await api.post(`/api/chatbot/conversations/${convId}/messages`, {
        content,
        projectId: selectedProjectId || undefined,
      }).then((r) => r.data);
      setMessages((prev) => [...prev, reply as BotMessage]);
      qc.invalidateQueries({ queryKey: ['chatbot-conversations'] });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error('Erreur lors de l\'envoi du message');
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openConversation = (conv: BotConversation) => {
    setActiveConvId(conv.id);
    setShowList(false);
    qc.invalidateQueries({ queryKey: ['chatbot-messages', conv.id] });
  };

  const role = (user?.role as string) ?? 'EMPLOYE';
  const quickPrompts = selectedProjectId ? PROJECT_PROMPTS : (QUICK_PROMPTS[role] ?? QUICK_PROMPTS.EMPLOYE);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // ── FAB ──
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-xl hover:shadow-2xl hover:scale-110 transition-all flex items-center justify-center group"
        title="Assistant IA"
      >
        <Bot size={22} />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white" />
      </button>
    );
  }

  // ── Panel ──
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[640px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-700 text-white shrink-0">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <Bot size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-none">Assistant IA</p>
          <p className="text-xs text-white/70 mt-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
            {selectedProject ? <span className="truncate max-w-[140px]">📁 {selectedProject.name}</span> : 'En ligne'}
          </p>
        </div>
        {activeConvId && !showList && (
          <button
            onClick={() => { setShowList(true); }}
            className="p-1.5 rounded-lg hover:bg-white/20 transition"
            title="Conversations"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 rounded-lg hover:bg-white/20 transition"
          title="Fermer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Project selector bar */}
      {!showList && (
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen size={13} className="text-slate-400 shrink-0" />
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="flex-1 text-xs text-slate-600 bg-transparent outline-none"
            >
              <option value="">— Contexte général —</option>
              {projects.filter(p => p.status === 'ACTIVE').map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      {showList ? (
        /* Conversation list */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* New conversation button */}
          <div className="p-3 border-b border-slate-100">
            <button
              onClick={() => { setActiveConvId(null); setMessages([]); setShowList(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-sm font-medium transition"
            >
              <Plus size={15} /> Nouvelle conversation
            </button>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-3">
                  <MessageSquareDot size={24} className="text-violet-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">Aucune conversation</p>
                <p className="text-xs text-slate-400 mt-1">Commencez à discuter avec l'assistant</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition ${
                      activeConvId === conv.id ? 'bg-violet-50' : 'hover:bg-slate-50'
                    }`}
                    onClick={() => openConversation(conv)}
                  >
                    <Bot size={14} className="text-violet-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">
                        {conv.title ?? 'Nouvelle conversation'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {conv._count.messages} message{conv._count.messages !== 1 ? 's' : ''} ·{' '}
                        {new Date(conv.updatedAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConvMut.mutate(conv.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 hover:text-red-500 text-slate-400 transition"
                      title="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Message thread */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Active conversation header */}
          {activeConvId && (
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between shrink-0">
              <p className="text-xs text-slate-500 truncate flex-1">
                {conversations.find((c) => c.id === activeConvId)?.title ?? 'Nouvelle conversation'}
              </p>
              {activeConvId && (
                <button
                  onClick={() => deleteConvMut.mutate(activeConvId)}
                  className="p-1 rounded-lg hover:bg-red-50 hover:text-red-500 text-slate-400 transition ml-2 shrink-0"
                  title="Supprimer la conversation"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !isThinking ? (
              /* Empty state with quick prompts */
              <div className="flex flex-col items-center pt-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mb-3">
                  <Sparkles size={20} className="text-violet-500" />
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Comment puis-je vous aider ?</p>
                <p className="text-xs text-slate-400 mb-5">
                  {selectedProject
                    ? `Contexte : ${selectedProject.name}`
                    : 'Posez une question ou choisissez une suggestion'}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      className="px-3 py-1.5 rounded-full border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium transition"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot size={13} className="text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        msg.role === 'user'
                          ? 'bg-violet-600 text-white rounded-br-sm'
                          : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none prose-headings:text-slate-800 prose-headings:font-semibold prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900 prose-code:text-violet-700 prose-code:bg-violet-50 prose-code:px-1 prose-code:rounded [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Thinking indicator */}
                {isThinking && (
                  <div className="flex justify-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                      <Bot size={13} className="text-white" />
                    </div>
                    <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin text-violet-500" />
                      <span className="text-xs text-slate-500">L'assistant réfléchit…</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-100 shrink-0">
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedProject ? `Question sur "${selectedProject.name}"…` : 'Posez votre question…'}
                disabled={isThinking}
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none disabled:opacity-50"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isThinking}
                className="w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white flex items-center justify-center transition shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
            <p className="text-center text-[10px] text-slate-300 mt-1.5">
              {selectedProject ? `📁 ${selectedProject.name} · Données réelles du projet` : 'Les réponses sont basées sur vos données uniquement'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
