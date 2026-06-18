import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  BarChart2, Sparkles, Send, TrendingUp, TrendingDown, Minus,
  Loader2, RotateCcw, ChevronRight, FileText, Users, FolderOpen,
  AlertTriangle, CheckCircle, Clock,
} from 'lucide-react';
import { api } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPI {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'stable';
  detail?: string;
}

interface Section {
  heading: string;
  content: string;
  items?: string[];
}

interface Report {
  title: string;
  period: string;
  summary: string;
  kpis: KPI[];
  sections: Section[];
  conclusion: string;
  query: string;
  generatedAt: string;
}

// ─── Suggestions prédéfinies ──────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: <Users size={14} />,      label: 'Performance globale de l\'équipe' },
  { icon: <FolderOpen size={14} />, label: 'État d\'avancement des projets actifs' },
  { icon: <AlertTriangle size={14} />, label: 'Tâches en retard et responsables' },
  { icon: <CheckCircle size={14} />, label: 'Taux de complétion par département' },
  { icon: <Clock size={14} />,      label: 'Charge de travail par employé' },
  { icon: <TrendingUp size={14} />, label: 'Productivité ce mois-ci' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [query, setQuery] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  const generateMut = useMutation({
    mutationFn: (q: string) =>
      api.post('/api/reports/generate', { query: q }).then((r) => r.data as Report),
    onSuccess: (data) => setReport(data),
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur lors de la génération'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    generateMut.mutate(query.trim());
  }

  function handleSuggestion(label: string) {
    setQuery(label);
    generateMut.mutate(label);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-4xl mx-auto">

        {/* ── Header ── */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-200">
            <BarChart2 size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Rapports IA</h1>
          <p className="text-slate-500 text-base max-w-lg mx-auto">
            Décrivez le rapport que vous souhaitez. L'IA analyse les données de l'entreprise et génère un rapport complet en quelques secondes.
          </p>
        </div>

        {/* ── Prompt form ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Sparkles size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex: Fais-moi un rapport sur la production de Sara ce mois…"
                  className="w-full pl-11 pr-4 py-3.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
                  disabled={generateMut.isPending}
                />
              </div>
              <button
                type="submit"
                disabled={generateMut.isPending || !query.trim()}
                className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition shadow-sm shadow-blue-200"
              >
                {generateMut.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Send size={16} />}
                {generateMut.isPending ? 'Génération…' : 'Générer'}
              </button>
            </div>
          </form>

          {/* Suggestions */}
          <div className="mt-4">
            <p className="text-xs text-slate-400 mb-2.5 font-medium uppercase tracking-wide">Suggestions</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(({ icon, label }) => (
                <button
                  key={label}
                  onClick={() => handleSuggestion(label)}
                  disabled={generateMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-lg transition disabled:opacity-40"
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Loading ── */}
        {generateMut.isPending && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
              <Sparkles size={28} className="text-blue-500 animate-pulse" />
            </div>
            <p className="text-slate-700 font-semibold text-lg mb-1">L'IA analyse les données…</p>
            <p className="text-slate-400 text-sm">Collecte des informations et génération du rapport en cours</p>
            <div className="flex justify-center gap-1.5 mt-5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Report ── */}
        {report && !generateMut.isPending && (
          <ReportDisplay report={report} onReset={() => { setReport(null); setQuery(''); }} />
        )}
      </div>
    </div>
  );
}

// ─── Report display ───────────────────────────────────────────────────────────

function ReportDisplay({ report, onReset }: { report: Report; onReset: () => void }) {
  return (
    <div className="space-y-5 animate-[fadeIn_0.4s_ease-out]">

      {/* Header card */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-200">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={16} className="opacity-80" />
              <span className="text-blue-200 text-xs font-medium uppercase tracking-wide">Rapport généré par IA</span>
            </div>
            <h2 className="text-2xl font-bold mb-1">{report.title}</h2>
            <p className="text-blue-200 text-sm">{report.period}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-blue-200 text-xs">
              {new Date(report.generatedAt).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
            <p className="text-blue-200 text-xs mt-0.5">
              {new Date(report.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Query badge */}
        <div className="mt-4 inline-flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5 text-sm">
          <Sparkles size={13} />
          <span className="italic opacity-90">"{report.query}"</span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Résumé exécutif</h3>
        <p className="text-slate-700 text-sm leading-relaxed">{report.summary}</p>
      </div>

      {/* KPIs */}
      {report.kpis?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {report.kpis.map((kpi, i) => (
            <KPICard key={i} kpi={kpi} />
          ))}
        </div>
      )}

      {/* Sections */}
      {report.sections?.map((section, i) => (
        <SectionCard key={i} section={section} index={i} />
      ))}

      {/* Conclusion */}
      {report.conclusion && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-5">
          <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <CheckCircle size={14} /> Conclusion & Recommandations
          </h3>
          <p className="text-slate-700 text-sm leading-relaxed">{report.conclusion}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center pt-2 pb-6">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2.5 text-sm text-slate-600 hover:text-blue-600 border border-slate-300 hover:border-blue-300 hover:bg-blue-50 rounded-xl transition"
        >
          <RotateCcw size={15} /> Générer un nouveau rapport
        </button>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ kpi }: { kpi: KPI }) {
  const TrendIcon = kpi.trend === 'up' ? TrendingUp : kpi.trend === 'down' ? TrendingDown : Minus;
  const trendColor = kpi.trend === 'up' ? 'text-emerald-500' : kpi.trend === 'down' ? 'text-red-500' : 'text-slate-400';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium leading-snug">{kpi.label}</p>
        <TrendIcon size={14} className={trendColor} />
      </div>
      <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
      {kpi.detail && <p className="text-xs text-slate-400 mt-1">{kpi.detail}</p>}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ section, index }: { section: Section; index: number }) {
  const colors = [
    'border-blue-200 bg-blue-50/40',
    'border-violet-200 bg-violet-50/40',
    'border-amber-200 bg-amber-50/40',
    'border-rose-200 bg-rose-50/40',
  ];
  const dotColors = ['bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500'];
  const cls = colors[index % colors.length];
  const dot = dotColors[index % dotColors.length];

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 ${cls}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
        <h3 className="font-semibold text-slate-800 text-sm">{section.heading}</h3>
      </div>
      <p className="text-slate-600 text-sm leading-relaxed mb-3">{section.content}</p>
      {section.items && section.items.length > 0 && (
        <ul className="space-y-1.5">
          {section.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
              <ChevronRight size={14} className="text-slate-400 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
