import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BookOpen, Clock, CheckCircle, AlertCircle, RotateCcw, FileText,
  Sparkles, Download, Copy, Loader2, Calendar, TrendingUp, Paperclip,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalSummary {
  total: number; accepted: number; pending: number; revision: number;
  totalHours: number; totalFiles: number;
}

interface JournalEntry {
  id: string; comment?: string; progressPct?: number; hoursSpent?: number;
  status: string; createdAt: string; externalLinks?: string[];
  task: { id: string; title: string; status: string; project?: { id: string; name: string } | null };
  files: { id: string; originalName: string; size: number }[];
  reviews: { decision: string; comment?: string; createdAt: string; reviewer: { fullName: string } }[];
}

interface JournalData {
  period: { from: string; to: string };
  summary: JournalSummary;
  entries: JournalEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  EN_COURS:          { label: 'En cours',          icon: <Clock size={11} />,        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  EN_REVISION:       { label: 'En révision',       icon: <RotateCcw size={11} />,    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  ACCEPTE:           { label: 'Acceptée',          icon: <CheckCircle size={11} />,  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REVISION_DEMANDEE: { label: 'Révision demandée', icon: <AlertCircle size={11} />,  cls: 'bg-red-50 text-red-700 border-red-200' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG['EN_COURS'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function KPI({ label, value, sub, color = 'blue' }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700', emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold px-2 py-0.5 rounded-lg inline-block ${colors[color] ?? colors.blue}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── AI Report Modal ──────────────────────────────────────────────────────────

function AIReportModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [type, setType] = useState<'weekly' | 'monthly' | 'project'>('weekly');
  const [saveToGed, setSaveToGed] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);

  const generateMut = useMutation({
    mutationFn: () => api.post(`/api/users/${userId}/journal/report`, { type, saveToGed }),
    onSuccess: (res) => { setReport(res.data.report); setDocId(res.data.documentId ?? null); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur lors de la génération'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
            <Sparkles size={16} className="text-purple-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-slate-800">Rapport de travail IA</h2>
            <p className="text-xs text-slate-400">Générez un rapport professionnel basé sur vos contributions</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
          <div className="flex gap-2">
            {(['weekly', 'monthly', 'project'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setType(t); setReport(null); }}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
                  type === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t === 'weekly' ? 'Hebdomadaire' : t === 'monthly' ? 'Mensuel' : 'Projet'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 ml-auto cursor-pointer">
            <input type="checkbox" checked={saveToGed} onChange={(e) => setSaveToGed(e.target.checked)} className="rounded" />
            Sauvegarder dans la GED
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!report && (
            <div className="text-center py-12">
              <Sparkles size={40} className="text-purple-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Cliquez sur "Générer" pour créer votre rapport.</p>
              <p className="text-xs text-slate-400 mt-1">L'IA analysera vos contributions et générera un rapport professionnel.</p>
            </div>
          )}
          {report && (
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">
              {report}
            </div>
          )}
          {docId && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle size={12} />Rapport sauvegardé dans la GED
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3">
          <button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
            className="flex items-center gap-2 bg-purple-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {generateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {report ? 'Regénérer' : 'Générer'}
          </button>
          {report && (
            <>
              <button
                onClick={() => { navigator.clipboard.writeText(report); toast.success('Copié !'); }}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition"
              >
                <Copy size={12} />Copier
              </button>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(report)}`}
                download={`rapport_${type}.txt`}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition"
              >
                <Download size={12} />Télécharger
              </a>
            </>
          )}
          <button onClick={onClose} className="ml-auto text-sm text-slate-500 hover:text-slate-700">Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkJournalPage() {
  const { user } = useAuth();
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAI, setShowAI] = useState(false);

  const { data, isLoading } = useQuery<JournalData>({
    queryKey: ['journal', user?.id, fromDate, toDate],
    queryFn: async () =>
      (await api.get(`/api/users/${user?.id}/journal?from=${fromDate}&to=${toDate}`)).data,
    enabled: !!user?.id,
  });

  const summary = data?.summary;
  const entries = data?.entries ?? [];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <BookOpen size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Journal de travail</h1>
            <p className="text-sm text-slate-400">Historique de vos contributions</p>
          </div>
        </div>
        <button
          onClick={() => setShowAI(true)}
          className="flex items-center gap-2 bg-purple-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-700 transition"
        >
          <Sparkles size={14} />Rapport IA
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-slate-400" />
          <label className="text-xs text-slate-500">Du</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Au</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI label="Contributions" value={summary.total} color="blue" />
          <KPI label="Acceptées" value={summary.accepted} color="emerald" />
          <KPI label="En attente" value={summary.pending} color="slate" />
          <KPI label="En révision" value={summary.revision} color="amber" />
          <KPI label="Heures déclarées" value={`${summary.totalHours}h`} color="blue" />
          <KPI label="Fichiers déposés" value={summary.totalFiles} color="slate" />
        </div>
      )}

      {/* Entries */}
      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
          <BookOpen size={48} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">Aucune contribution sur cette période.</p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="text-slate-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-700 truncate">{entry.task.title}</span>
                  {entry.task.project && (
                    <span className="text-xs text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full truncate">
                      {entry.task.project.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleDateString('fr-FR')}</span>
                  <StatusBadge status={entry.status} />
                </div>
              </div>
              <div className="px-5 py-3 space-y-2">
                {entry.comment && <p className="text-sm text-slate-700">{entry.comment}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  {entry.progressPct != null && (
                    <span className="flex items-center gap-1"><TrendingUp size={11} />{entry.progressPct}% avancement</span>
                  )}
                  {entry.hoursSpent != null && (
                    <span className="flex items-center gap-1"><Clock size={11} />{entry.hoursSpent}h</span>
                  )}
                </div>
                {entry.files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.files.map((f) => (
                      <span key={f.id} className="flex items-center gap-1 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
                        <Paperclip size={10} />{f.originalName}
                      </span>
                    ))}
                  </div>
                )}
                {entry.reviews[0] && (
                  <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs space-y-0.5 border border-slate-100">
                    <p className="font-semibold text-slate-500">
                      Avis de {entry.reviews[0].reviewer.fullName}
                      {' · '}{new Date(entry.reviews[0].createdAt).toLocaleDateString('fr-FR')}
                    </p>
                    {entry.reviews[0].comment && <p className="text-slate-600">{entry.reviews[0].comment}</p>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAI && user && <AIReportModal userId={user.id} onClose={() => setShowAI(false)} />}
    </div>
  );
}
