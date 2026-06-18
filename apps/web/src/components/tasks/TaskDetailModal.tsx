import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Send, Trash2, Loader2, Calendar, User, Flag, ChevronRight,
  Plus, Paperclip, Link, Clock, TrendingUp, ArrowRightLeft,
  CheckCircle, AlertCircle, RotateCcw, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string; title: string; description?: string;
  status: TaskStatus; priority: TaskPriority; dueDate?: string;
  assignee?: { id: string; fullName: string } | null;
  assigneeStatus?: string;
  assigneeNotes?: string;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  updatedAt?: string;
  comments: Comment[];
}
interface Comment {
  id: string; content: string; createdAt: string;
  author: { id: string; fullName: string };
}
interface SubmissionFile { id: string; originalName: string; size: number; filename: string }
interface SubmissionReview {
  id: string; decision: string; comment?: string; createdAt: string;
  reviewer: { id: string; fullName: string };
}
interface Submission {
  id: string; userId: string; comment?: string; progressPct?: number;
  hoursSpent?: number; externalLinks?: string[]; status: string;
  createdAt: string;
  user: { id: string; fullName: string };
  files: SubmissionFile[];
  reviews: SubmissionReview[];
}

type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type TabId        = 'details' | 'submissions' | 'comments';

// ─── Config ───────────────────────────────────────────────────────────────────

const STEPS: { status: TaskStatus; label: string }[] = [
  { status: 'TODO',        label: 'À faire' },
  { status: 'IN_PROGRESS', label: 'En cours' },
  { status: 'REVIEW',      label: 'En révision' },
  { status: 'DONE',        label: 'Terminé' },
];

const PRIORITY_CFG: Record<TaskPriority, { label: string; cls: string }> = {
  LOW:    { label: 'Basse',   cls: 'bg-slate-100 text-slate-600' },
  MEDIUM: { label: 'Moyenne', cls: 'bg-blue-100 text-blue-700' },
  HIGH:   { label: 'Haute',   cls: 'bg-orange-100 text-orange-700' },
  URGENT: { label: 'Urgente', cls: 'bg-red-100 text-red-700' },
};

const STATUS_CFG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  EN_COURS:           { label: 'En cours',          icon: <Clock size={12} />,         cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  EN_REVISION:        { label: 'En révision',       icon: <RotateCcw size={12} />,     cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  ACCEPTE:            { label: 'Acceptée',          icon: <CheckCircle size={12} />,   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REVISION_DEMANDEE:  { label: 'Révision demandée', icon: <AlertCircle size={12} />,   cls: 'bg-red-50 text-red-700 border-red-200' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SubmissionBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG['EN_COURS'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function SubmissionCard({
  sub, canReview, onReview,
}: {
  sub: Submission;
  canReview: boolean;
  onReview: (id: string, decision: 'ACCEPTE' | 'REVISION_DEMANDEE', comment: string) => void;
}) {
  const [showReview, setShowReview] = useState(false);
  const [decision, setDecision] = useState<'ACCEPTE' | 'REVISION_DEMANDEE'>('ACCEPTE');
  const [reviewComment, setReviewComment] = useState('');

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {sub.user.fullName[0]}
          </div>
          <span className="text-xs font-semibold text-slate-700 truncate">{sub.user.fullName}</span>
          <span className="text-xs text-slate-400">{new Date(sub.createdAt).toLocaleDateString('fr-FR')}</span>
        </div>
        <SubmissionBadge status={sub.status} />
      </div>
      <div className="px-4 py-3 space-y-2">
        {sub.comment && <p className="text-sm text-slate-700">{sub.comment}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {sub.progressPct != null && (
            <span className="flex items-center gap-1"><TrendingUp size={11} />{sub.progressPct}% avancement</span>
          )}
          {sub.hoursSpent != null && (
            <span className="flex items-center gap-1"><Clock size={11} />{sub.hoursSpent}h</span>
          )}
        </div>
        {sub.files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sub.files.map((f) => (
              <a
                key={f.id}
                href={`/files/${f.filename}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100"
              >
                <Paperclip size={10} />{f.originalName}
              </a>
            ))}
          </div>
        )}
        {(sub.externalLinks as string[] | undefined)?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {(sub.externalLinks as string[]).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 bg-purple-50 px-2 py-1 rounded-lg border border-purple-100">
                <Link size={10} />{url}
              </a>
            ))}
          </div>
        ) : null}
        {sub.reviews[0] && (
          <div className="mt-2 bg-slate-50 rounded-lg px-3 py-2 text-xs space-y-0.5">
            <p className="font-semibold text-slate-500">
              Avis de {sub.reviews[0].reviewer.fullName} · {new Date(sub.reviews[0].createdAt).toLocaleDateString('fr-FR')}
            </p>
            {sub.reviews[0].comment && <p className="text-slate-600">{sub.reviews[0].comment}</p>}
          </div>
        )}
        {canReview && sub.status === 'EN_COURS' && (
          <div>
            {showReview ? (
              <div className="space-y-2 mt-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setDecision('ACCEPTE')}
                    className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition ${
                      decision === 'ACCEPTE' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >Accepter</button>
                  <button
                    onClick={() => setDecision('REVISION_DEMANDEE')}
                    className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition ${
                      decision === 'REVISION_DEMANDEE' ? 'bg-amber-600 text-white border-amber-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >Demander révision</button>
                </div>
                <textarea
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  rows={2}
                  placeholder="Commentaire (optionnel)…"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { onReview(sub.id, decision, reviewComment); setShowReview(false); setReviewComment(''); }}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition"
                  >Confirmer</button>
                  <button onClick={() => setShowReview(false)} className="text-xs text-slate-500 px-3 py-1 rounded-lg border hover:bg-slate-50 transition">Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowReview(true)} className="mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                Donner un avis →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskDetailModal({ taskId, onClose, onUpdate = () => {}, members = [] }: {
  taskId: string;
  onClose: () => void;
  onUpdate?: () => void;
  members?: { id: string; fullName: string }[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>('details');
  const [comment, setComment] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  // Submission form state
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [subComment, setSubComment]         = useState('');
  const [subProgress, setSubProgress]       = useState('');
  const [subHours, setSubHours]             = useState('');
  const [subLinks, setSubLinks]             = useState('');
  const [subFiles, setSubFiles]             = useState<FileList | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Transfer form state
  const [showTransfer, setShowTransfer]     = useState(false);
  const [transferTo, setTransferTo]         = useState('');
  const [transferNote, setTransferNote]     = useState('');

  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ['task', taskId],
    queryFn: async () => (await api.get(`/api/tasks/${taskId}`)).data,
  });

  const { data: submissions = [], isLoading: subsLoading } = useQuery<Submission[]>({
    queryKey: ['submissions', taskId],
    queryFn: async () => (await api.get(`/api/tasks/${taskId}/submissions`)).data,
    enabled: tab === 'submissions',
  });

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/api/tasks/${taskId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); onUpdate(); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const addCommentMut = useMutation({
    mutationFn: () => api.post(`/api/tasks/${taskId}/comments`, { content: comment }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); setComment(''); },
    onError: () => toast.error('Erreur'),
  });

  const deleteCommentMut = useMutation({
    mutationFn: (commentId: string) => api.delete(`/api/tasks/${taskId}/comments/${commentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task', taskId] }),
  });

  const createSubMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (subComment) fd.append('comment', subComment);
      if (subProgress) fd.append('progressPct', subProgress);
      if (subHours) fd.append('hoursSpent', subHours);
      if (subLinks.trim()) {
        const links = subLinks.split('\n').map((l) => l.trim()).filter(Boolean);
        fd.append('externalLinks', JSON.stringify(links));
      }
      if (subFiles) Array.from(subFiles).forEach((f) => fd.append('files', f));
      return api.post(`/api/tasks/${taskId}/submissions`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', taskId] });
      toast.success('Contribution ajoutée');
      setShowSubmitForm(false); setSubComment(''); setSubProgress('');
      setSubHours(''); setSubLinks(''); setSubFiles(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const reviewMut = useMutation({
    mutationFn: ({ submissionId, decision, comment: c }: { submissionId: string; decision: string; comment: string }) =>
      api.patch(`/api/submissions/${submissionId}/review`, { decision, comment: c }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['submissions', taskId] }); toast.success('Avis enregistré'); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const transferMut = useMutation({
    mutationFn: () => api.post(`/api/tasks/${taskId}/transfer`, { toUserId: transferTo, note: transferNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      onUpdate();
      toast.success('Tâche transférée');
      setShowTransfer(false); setTransferTo(''); setTransferNote('');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  if (isLoading || !task) {
    return (
      <>
        <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
        <div className="fixed inset-y-0 right-0 w-[540px] bg-white shadow-2xl z-50 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      </>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.status === task.status);
  const nextStep     = STEPS[currentIndex + 1];

  const canMoveNext       = nextStep && (task.assignee?.id === user?.id || task.createdBy.id === user?.id || user?.role === 'ADMIN');
  const canEditNotes      = task.assignee?.id === user?.id || task.createdBy.id === user?.id || user?.role === 'ADMIN';
  const canReassign       = task.createdBy.id === user?.id || user?.role === 'ADMIN';
  const canChangePriority = task.createdBy.id === user?.id || user?.role === 'ADMIN';
  const canSubmit         = task.assignee?.id === user?.id || task.createdBy.id === user?.id || user?.role === 'ADMIN';
  const canReview         = user?.role === 'ADMIN' || user?.role === 'RH' || user?.role === 'MANAGER';
  const canTransfer       = canSubmit;

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';
  const isDueSoon = task.dueDate && !isOverdue && (new Date(task.dueDate).getTime() - Date.now()) < 2 * 86400000;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 w-[540px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-800 leading-snug">{task.title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Créé par <span className="font-medium text-slate-500">{task.createdBy.fullName}</span>
              {task.createdAt && <> · {new Date(task.createdAt).toLocaleDateString('fr-FR')}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-0.5 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0">
          {(['details', 'submissions', 'comments'] as TabId[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t === 'details' ? 'Détails' : t === 'submissions' ? `Contributions (${submissions.length})` : `Commentaires (${task.comments.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Details tab ─────────────────────────────────────────────── */}
          {tab === 'details' && (
            <>
              {/* Progress stepper */}
              <div className="px-6 py-5 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Progression</p>
                <div className="flex items-center gap-0">
                  {STEPS.map((step, i) => {
                    const done    = i < currentIndex;
                    const current = i === currentIndex;
                    return (
                      <div key={step.status} className="flex items-center flex-1 min-w-0">
                        <div className="flex flex-col items-center gap-1 flex-1">
                          <div className={`w-3 h-3 rounded-full border-2 transition-all ${
                            done    ? 'bg-blue-600 border-blue-600' :
                            current ? 'bg-white border-blue-600 ring-2 ring-blue-100' :
                                      'bg-white border-slate-300'
                          }`} />
                          <span className={`text-[10px] text-center leading-tight ${
                            current ? 'font-semibold text-blue-600' :
                            done    ? 'text-blue-500' : 'text-slate-400'
                          }`}>{step.label}</span>
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`h-0.5 flex-1 mb-4 ${i < currentIndex ? 'bg-blue-500' : 'bg-slate-200'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
                {canMoveNext && (
                  <button
                    onClick={() => updateMut.mutate({ status: nextStep.status })}
                    disabled={updateMut.isPending}
                    className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition"
                  >
                    {updateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                    Passer à : {nextStep.label}
                  </button>
                )}
              </div>

              {/* Meta */}
              <div className="px-6 py-4 border-b border-slate-100 space-y-3">
                <div className="flex items-center gap-2">
                  <User size={13} className="text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 w-20 shrink-0">Assigné à</span>
                  {canReassign ? (
                    <select
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={task.assignee?.id ?? ''}
                      onChange={(e) => updateMut.mutate({ assigneeId: e.target.value || null })}
                    >
                      <option value="">Non assigné</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {task.assignee ? (
                        <>
                          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                            {task.assignee.fullName[0].toUpperCase()}
                          </div>
                          <span className="text-xs text-slate-700 font-medium">{task.assignee.fullName}</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Non assigné</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Flag size={13} className="text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 w-20 shrink-0">Priorité</span>
                  {canChangePriority ? (
                    <select
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={task.priority}
                      onChange={(e) => updateMut.mutate({ priority: e.target.value })}
                    >
                      {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map((p) => (
                        <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_CFG[task.priority].cls}`}>
                      {PRIORITY_CFG[task.priority].label}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Calendar size={13} className={`shrink-0 ${isOverdue ? 'text-red-500' : isDueSoon ? 'text-amber-500' : 'text-slate-400'}`} />
                  <span className="text-xs text-slate-500 w-20 shrink-0">Échéance</span>
                  {canChangePriority ? (
                    <input
                      type="date"
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                      onChange={(e) => updateMut.mutate({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    />
                  ) : (
                    <span className={`text-xs font-medium ${isOverdue ? 'text-red-500' : isDueSoon ? 'text-amber-600' : 'text-slate-700'}`}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR') : '—'}
                      {isOverdue && ' ⚠ En retard'}{isDueSoon && !isOverdue && ' · Bientôt'}
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              {task.description && (
                <div className="px-6 py-4 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Description</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{task.description}</p>
                </div>
              )}

              {/* Assignee notes */}
              {task.assignee && (
                <div className="px-6 py-4 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes d'avancement</p>
                    {canEditNotes && !editingNotes && (
                      <button onClick={() => { setNotesDraft(task.assigneeNotes ?? ''); setEditingNotes(true); }}
                        className="text-xs text-blue-500 hover:text-blue-700">Modifier</button>
                    )}
                  </div>
                  {editingNotes ? (
                    <div className="space-y-2">
                      <textarea
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                        rows={3} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)}
                        placeholder="Décrivez votre avancement…" autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { updateMut.mutate({ assigneeNotes: notesDraft }); setEditingNotes(false); }}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition">Enregistrer</button>
                        <button onClick={() => setEditingNotes(false)}
                          className="text-xs text-slate-500 px-3 py-1 rounded-lg border hover:bg-slate-50 transition">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">
                      {task.assigneeNotes || <span className="text-slate-400 italic">Aucune note pour le moment</span>}
                    </p>
                  )}
                </div>
              )}

              {/* Transfer action */}
              {canTransfer && (
                <div className="px-6 py-4 border-b border-slate-100">
                  {showTransfer ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Passer au collaborateur</p>
                      <select
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={transferTo}
                        onChange={(e) => setTransferTo(e.target.value)}
                      >
                        <option value="">Choisir un collaborateur…</option>
                        {members.filter((m) => m.id !== user?.id).map((m) => (
                          <option key={m.id} value={m.id}>{m.fullName}</option>
                        ))}
                      </select>
                      <textarea
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                        rows={2} placeholder="Note de transfert (optionnel)…"
                        value={transferNote} onChange={(e) => setTransferNote(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={!transferTo || transferMut.isPending}
                          onClick={() => transferMut.mutate()}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                        >{transferMut.isPending ? '…' : 'Confirmer le transfert'}</button>
                        <button onClick={() => setShowTransfer(false)}
                          className="text-xs text-slate-500 px-3 py-1 rounded-lg border hover:bg-slate-50 transition">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowTransfer(true)}
                      className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-600 font-medium transition">
                      <ArrowRightLeft size={13} />Passer au collaborateur
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Submissions tab ──────────────────────────────────────────── */}
          {tab === 'submissions' && (
            <div className="px-6 py-4 space-y-4">
              {canSubmit && (
                <div>
                  {showSubmitForm ? (
                    <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Nouvelle contribution</p>
                      <textarea
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                        rows={3} placeholder="Description de votre travail…"
                        value={subComment} onChange={(e) => setSubComment(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Avancement (%)</label>
                          <input type="number" min="0" max="100"
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            placeholder="Ex: 75" value={subProgress} onChange={(e) => setSubProgress(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Heures passées</label>
                          <input type="number" min="0" step="0.5"
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            placeholder="Ex: 3.5" value={subHours} onChange={(e) => setSubHours(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Liens externes (un par ligne)</label>
                        <textarea
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                          rows={2} placeholder="https://…" value={subLinks} onChange={(e) => setSubLinks(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Fichiers</label>
                        <input ref={fileRef} type="file" multiple className="hidden"
                          onChange={(e) => setSubFiles(e.target.files)} />
                        <button onClick={() => fileRef.current?.click()}
                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
                          <Paperclip size={12} />Joindre des fichiers
                          {subFiles && subFiles.length > 0 && <span className="text-slate-500">({subFiles.length} fichier{subFiles.length > 1 ? 's' : ''})</span>}
                        </button>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          disabled={createSubMut.isPending}
                          onClick={() => createSubMut.mutate()}
                          className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium"
                        >{createSubMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}Soumettre</button>
                        <button onClick={() => setShowSubmitForm(false)}
                          className="text-xs text-slate-500 px-3 py-1.5 rounded-lg border hover:bg-slate-50 transition">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowSubmitForm(true)}
                      className="w-full flex items-center justify-center gap-2 border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 py-2.5 rounded-xl text-xs font-semibold transition">
                      <Plus size={14} />Ajouter une contribution
                    </button>
                  )}
                </div>
              )}

              {subsLoading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-500" size={24} /></div>}

              {!subsLoading && submissions.length === 0 && (
                <div className="text-center py-8">
                  <FileText size={32} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Aucune contribution pour le moment.</p>
                </div>
              )}

              <div className="space-y-3">
                {submissions.map((sub) => (
                  <SubmissionCard
                    key={sub.id}
                    sub={sub}
                    canReview={canReview}
                    onReview={(id, decision, comment) => reviewMut.mutate({ submissionId: id, decision, comment })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Comments tab ─────────────────────────────────────────────── */}
          {tab === 'comments' && (
            <div className="px-6 py-4">
              <div className="space-y-3 mb-4">
                {task.comments.length === 0 && (
                  <p className="text-sm text-slate-400 italic">Aucun commentaire.</p>
                )}
                {task.comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                      {c.author.fullName[0].toUpperCase()}
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-600">{c.author.fullName}</span>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{new Date(c.createdAt).toLocaleDateString('fr-FR')}</span>
                          {(c.author.id === user?.id || user?.role === 'ADMIN') && (
                            <button onClick={() => deleteCommentMut.mutate(c.id)} className="hover:text-red-500 transition">
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-700">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="Écrire un commentaire…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && comment.trim()) {
                      e.preventDefault(); addCommentMut.mutate();
                    }
                  }}
                />
                <button
                  onClick={() => addCommentMut.mutate()}
                  disabled={!comment.trim() || addCommentMut.isPending}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition"
                >
                  {addCommentMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
