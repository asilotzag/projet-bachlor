import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageSquare, Plus, Send, Users, X, Check, Pencil, Trash2, ChevronUp, Paperclip, FileText, Image,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatUser { id: string; fullName: string; role: { name: string } }

interface MsgSender { id: string; fullName: string }
interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: MsgSender;
}

interface ConvMember { id: string; userId: string; user: { id: string; fullName: string } }
interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string | null;
  updatedAt: string;
  members: ConvMember[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function convLabel(conv: Conversation, myId: string) {
  if (conv.type === 'GROUP') return conv.name ?? 'Groupe';
  const other = conv.members.find((m) => m.userId !== myId);
  return other?.user.fullName ?? 'Conversation';
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'à l\'instant';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

// ── New DM Modal ───────────────────────────────────────────────────────────────

function NewDMModal({ onClose, onCreate }: { onClose: () => void; onCreate: (convId: string) => void }) {
  const [search, setSearch] = useState('');
  const { data: users = [] } = useQuery<ChatUser[]>({
    queryKey: ['chat-users'],
    queryFn: () => api.get('/api/chat/users').then((r) => r.data),
  });
  const createMut = useMutation({
    mutationFn: (targetUserId: string) =>
      api.post('/api/chat/conversations/direct', { targetUserId }).then((r) => r.data),
    onSuccess: (conv: Conversation) => { onCreate(conv.id); onClose(); },
  });

  const filtered = users.filter((u) => u.fullName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-96 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Nouveau message direct</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <input
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100">
          {filtered.map((u) => (
            <li key={u.id}>
              <button
                className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm flex items-center gap-2"
                onClick={() => createMut.mutate(u.id)}
                disabled={createMut.isPending}
              >
                <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {u.fullName[0]}
                </span>
                <span className="truncate">{u.fullName}</span>
                <span className="ml-auto text-xs text-slate-400">{u.role.name}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="text-sm text-slate-400 px-3 py-2">Aucun utilisateur</li>}
        </ul>
      </div>
    </div>
  );
}

// ── New Group Modal ────────────────────────────────────────────────────────────

function NewGroupModal({ onClose, onCreate }: { onClose: () => void; onCreate: (convId: string) => void }) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const { data: users = [] } = useQuery<ChatUser[]>({
    queryKey: ['chat-users'],
    queryFn: () => api.get('/api/chat/users').then((r) => r.data),
  });
  const createMut = useMutation({
    mutationFn: () => api.post('/api/chat/conversations/group', { name, memberIds: selected }).then((r) => r.data),
    onSuccess: (conv: Conversation) => { onCreate(conv.id); onClose(); },
  });

  const toggle = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const filtered = users.filter((u) => u.fullName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-96 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Créer un groupe</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <input
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Nom du groupe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Rechercher des membres..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="max-h-44 overflow-y-auto divide-y divide-slate-100 mb-4">
          {filtered.map((u) => (
            <li key={u.id}>
              <button
                className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm flex items-center gap-2"
                onClick={() => toggle(u.id)}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected.includes(u.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                  {selected.includes(u.id) && <Check size={10} className="text-white" />}
                </span>
                <span className="truncate">{u.fullName}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          onClick={() => createMut.mutate()}
          disabled={!name.trim() || selected.length === 0 || createMut.isPending}
        >
          Créer le groupe ({selected.length} membre{selected.length > 1 ? 's' : ''})
        </button>
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  msg, isOwn, onEdit, onDelete,
}: { msg: ChatMessage; isOwn: boolean; onEdit: (m: ChatMessage) => void; onDelete: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const isDeleted = !!msg.deletedAt;

  return (
    <div
      className={`flex gap-2 group ${isOwn ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {!isOwn && (
        <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0 mt-1">
          {msg.sender.fullName[0]}
        </span>
      )}
      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {!isOwn && <span className="text-xs text-slate-500 ml-1">{msg.sender.fullName}</span>}
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            isDeleted
              ? 'bg-slate-100 text-slate-400 italic'
              : isOwn
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-800 shadow-sm border border-slate-100'
          }`}
        >
          {isDeleted ? 'Message supprimé' : (
            <>
              {msg.attachmentUrl && (
                <div className="mb-1">
                  {msg.attachmentType?.startsWith('image/') ? (
                    <img
                      src={`http://localhost:4000${msg.attachmentUrl}`}
                      alt="pièce jointe"
                      className="max-w-[200px] rounded-lg border border-white/20 object-cover cursor-pointer"
                      onClick={() => window.open(`http://localhost:4000${msg.attachmentUrl}`, '_blank')}
                    />
                  ) : (
                    <a
                      href={`http://localhost:4000${msg.attachmentUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center gap-2 text-xs underline ${isOwn ? 'text-blue-100' : 'text-blue-600'}`}
                    >
                      <FileText size={14} />
                      {msg.attachmentUrl.split('/').pop()}
                    </a>
                  )}
                </div>
              )}
              {msg.content && <span>{msg.content}</span>}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 px-1">
          <span className="text-xs text-slate-400">{relativeTime(msg.createdAt)}</span>
          {msg.editedAt && !isDeleted && <span className="text-xs text-slate-400">(modifié)</span>}
        </div>
      </div>
      {isOwn && !isDeleted && hover && (
        <div className="flex items-center gap-1 self-center">
          <button
            onClick={() => onEdit(msg)}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          ><Pencil size={13} /></button>
          <button
            onClick={() => onDelete(msg.id)}
            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
          ><Trash2 size={13} /></button>
        </div>
      )}
    </div>
  );
}

// ── Message Panel ──────────────────────────────────────────────────────────────

function MessagePanel({ conv, myId }: { conv: Conversation; myId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Latest page (no cursor)
  const msgsQuery = useQuery<{ messages: ChatMessage[]; hasMore: boolean }>({
    queryKey: ['chat-messages', conv.id],
    queryFn: () => api.get(`/api/chat/conversations/${conv.id}/messages`).then((r) => r.data),
    refetchOnWindowFocus: false,
  });

  // Merge older pages
  const allMessages = [...olderMessages, ...(msgsQuery.data?.messages ?? [])];

  useEffect(() => {
    setOlderMessages([]);
    setCursor(undefined);
    setHasMore(false);
  }, [conv.id]);

  useEffect(() => {
    if (msgsQuery.data) setHasMore(msgsQuery.data.hasMore);
  }, [msgsQuery.data]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length]);

  // Mark read when panel opened
  useEffect(() => {
    void api.patch(`/api/chat/conversations/${conv.id}/read`).catch(() => {});
    qc.invalidateQueries({ queryKey: ['chat-conversations'] });
  }, [conv.id, qc]);

  // SSE listeners for real-time updates
  useEffect(() => {
    const onMsg = (e: Event) => {
      const { conversationId, message } = (e as CustomEvent).detail as { conversationId: string; message: ChatMessage };
      if (conversationId !== conv.id) return;
      qc.setQueryData<{ messages: ChatMessage[]; hasMore: boolean }>(
        ['chat-messages', conv.id],
        (old) => {
          if (!old) return old;
          if (old.messages.some((m) => m.id === message.id)) return old; // already added by onSuccess
          return { ...old, messages: [...old.messages, message] };
        },
      );
      void api.patch(`/api/chat/conversations/${conv.id}/read`).catch(() => {});
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    };
    const onEdit = (e: Event) => {
      const { conversationId, message } = (e as CustomEvent).detail as { conversationId: string; message: ChatMessage };
      if (conversationId !== conv.id) return;
      qc.setQueryData<{ messages: ChatMessage[]; hasMore: boolean }>(
        ['chat-messages', conv.id],
        (old) => old ? { ...old, messages: old.messages.map((m) => m.id === message.id ? message : m) } : old,
      );
    };
    const onDel = (e: Event) => {
      const { conversationId, messageId } = (e as CustomEvent).detail as { conversationId: string; messageId: string };
      if (conversationId !== conv.id) return;
      qc.setQueryData<{ messages: ChatMessage[]; hasMore: boolean }>(
        ['chat-messages', conv.id],
        (old) => old ? { ...old, messages: old.messages.map((m) => m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m) } : old,
      );
    };

    window.addEventListener('chat:message', onMsg);
    window.addEventListener('chat:message_edit', onEdit);
    window.addEventListener('chat:message_delete', onDel);
    return () => {
      window.removeEventListener('chat:message', onMsg);
      window.removeEventListener('chat:message_edit', onEdit);
      window.removeEventListener('chat:message_delete', onDel);
    };
  }, [conv.id, qc]);

  const loadOlder = useCallback(async () => {
    const oldest = allMessages[0];
    if (!oldest) return;
    const res = await api.get(`/api/chat/conversations/${conv.id}/messages?cursor=${encodeURIComponent(oldest.createdAt)}`);
    const { messages: older, hasMore: more } = res.data as { messages: ChatMessage[]; hasMore: boolean };
    setOlderMessages((prev) => [...older, ...prev]);
    setHasMore(more);
    setCursor(oldest.createdAt);
  }, [conv.id, allMessages]);

  const sendMut = useMutation({
    mutationFn: ({ content, file }: { content: string; file?: File | null }) => {
      if (file) {
        const fd = new FormData();
        if (content.trim()) fd.append('content', content.trim());
        fd.append('file', file);
        return api.post(`/api/chat/conversations/${conv.id}/messages`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }).then((r) => r.data);
      }
      return api.post(`/api/chat/conversations/${conv.id}/messages`, { content }).then((r) => r.data);
    },
    onSuccess: (msg: ChatMessage) => {
      qc.setQueryData<{ messages: ChatMessage[]; hasMore: boolean }>(
        ['chat-messages', conv.id],
        (old) => old ? { ...old, messages: [...old.messages, msg] } : old,
      );
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      setText('');
      setPendingFile(null);
    },
  });

  const editMut = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.patch(`/api/chat/messages/${id}`, { content }).then((r) => r.data),
    onSuccess: (msg: ChatMessage) => {
      qc.setQueryData<{ messages: ChatMessage[]; hasMore: boolean }>(
        ['chat-messages', conv.id],
        (old) => old ? { ...old, messages: old.messages.map((m) => m.id === msg.id ? msg : m) } : old,
      );
      setEditing(null);
      setText('');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/chat/messages/${id}`).then((r) => r.data),
    onSuccess: (msg: ChatMessage) => {
      qc.setQueryData<{ messages: ChatMessage[]; hasMore: boolean }>(
        ['chat-messages', conv.id],
        (old) => old ? { ...old, messages: old.messages.map((m) => m.id === msg.id ? msg : m) } : old,
      );
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && !pendingFile) return;
    if (editing) {
      editMut.mutate({ id: editing.id, content: trimmed });
    } else {
      sendMut.mutate({ content: trimmed, file: pendingFile });
    }
  };

  const startEdit = (msg: ChatMessage) => {
    setEditing(msg);
    setText(msg.content);
    inputRef.current?.focus();
  };

  const cancelEdit = () => { setEditing(null); setText(''); };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape' && editing) cancelEdit();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center gap-3">
        {conv.type === 'GROUP'
          ? <Users size={18} className="text-blue-500" />
          : <MessageSquare size={18} className="text-blue-500" />}
        <span className="font-medium text-slate-800">{convLabel(conv, myId)}</span>
        {conv.type === 'GROUP' && (
          <span className="ml-auto text-xs text-slate-400">{conv.members.length} membres</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {hasMore && (
          <button
            onClick={loadOlder}
            className="self-center text-xs text-blue-500 hover:underline flex items-center gap-1 mb-2"
          >
            <ChevronUp size={14} /> Voir les messages précédents
          </button>
        )}
        {msgsQuery.isLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Chargement…</div>
        ) : allMessages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Aucun message. Dites bonjour !</div>
        ) : (
          allMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={msg.senderId === myId}
              onEdit={startEdit}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-100 bg-white">
        {editing && (
          <div className="flex items-center gap-2 mb-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
            <Pencil size={12} />
            <span>Modification du message</span>
            <button onClick={cancelEdit} className="ml-auto hover:text-amber-800"><X size={12} /></button>
          </div>
        )}
        {/* File preview */}
        {pendingFile && (
          <div className="flex items-center gap-2 mb-2 text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-1.5">
            {pendingFile.type.startsWith('image/') ? <Image size={12} /> : <FileText size={12} />}
            <span className="truncate max-w-[200px]">{pendingFile.name}</span>
            <button onClick={() => setPendingFile(null)} className="ml-auto hover:text-blue-900"><X size={12} /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPendingFile(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition shrink-0"
            title="Joindre un fichier"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-h-32"
            placeholder="Écrivez un message… (Entrée pour envoyer)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            onClick={handleSend}
            disabled={(!text.trim() && !pendingFile) || sendMut.isPending || editMut.isPending}
            className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeConvId, setActiveConvId] = useState<string | null>(searchParams.get('conversationId'));
  const [showDM, setShowDM] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const qc = useQueryClient();

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ['chat-conversations'],
    queryFn: () => api.get('/api/chat/conversations').then((r) => r.data),
    refetchInterval: 30_000,
  });

  // Refresh conversation list on any SSE chat event
  useEffect(() => {
    const handler = () => qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    window.addEventListener('chat:message', handler);
    return () => window.removeEventListener('chat:message', handler);
  }, [qc]);

  // Sync URL param → active conv
  useEffect(() => {
    const id = searchParams.get('conversationId');
    if (id) setActiveConvId(id);
  }, [searchParams]);

  const selectConv = (id: string) => {
    setActiveConvId(id);
    setSearchParams({ conversationId: id });
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  return (
    <div className="flex h-full bg-slate-50">
      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-600" />
            <h2 className="font-semibold text-slate-800">Messages</h2>
            {totalUnread > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.2rem] text-center">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setShowDM(true)}
              title="Message direct"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            ><Plus size={16} /></button>
            {user?.role !== 'EMPLOYE' && (
              <button
                onClick={() => setShowGroup(true)}
                title="Créer un groupe"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              ><Users size={16} /></button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-slate-400">Chargement…</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">Aucune conversation. Commencez par envoyer un message !</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConv(conv.id)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 ${activeConvId === conv.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${conv.type === 'GROUP' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                    {conv.type === 'GROUP' ? <Users size={14} /> : convLabel(conv, user?.id ?? '')[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800 truncate">
                        {convLabel(conv, user?.id ?? '')}
                      </span>
                      {conv.lastMessage && (
                        <span className="text-xs text-slate-400 shrink-0 ml-1">
                          {relativeTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-slate-400 truncate">
                        {conv.lastMessage?.deletedAt
                          ? 'Message supprimé'
                          : conv.lastMessage?.content ?? 'Pas encore de messages'}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.2rem] text-center shrink-0 ml-1">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeConv ? (
          <MessagePanel key={activeConv.id} conv={activeConv} myId={user?.id ?? ''} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <MessageSquare size={48} className="text-slate-200" />
            <p className="text-sm">Sélectionnez une conversation ou démarrez-en une nouvelle</p>
          </div>
        )}
      </div>

      {showDM    && <NewDMModal    onClose={() => setShowDM(false)}    onCreate={selectConv} />}
      {showGroup && <NewGroupModal onClose={() => setShowGroup(false)} onCreate={selectConv} />}
    </div>
  );
}
