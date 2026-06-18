import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  BarChart2, Trophy, AlertTriangle, CheckCircle2, Users2,
  TrendingUp, TrendingDown, Minus, Loader2, RefreshCw,
  CalendarRange, Filter, FileDown,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewData {
  range: { from: string; to: string };
  kpis: {
    topProducer: { name: string; tasksCompleted: number } | null;
    mostOverdueProject: { name: string; count: number; maxDaysLate: number } | null;
    tasksCompletedThisWeek: { count: number; changePercent: number };
    avgWorkload: number;
  };
  productivity: { date: string; count: number }[];
  byIndividual: Record<string, any>[];
  top5Names: string[];
  workloadHeatmap: { userId: string; name: string; days: { date: string; count: number }[] }[];
  activityHeatmap: { userId: string; name: string; days: { date: string; status: string | null }[] }[];
  teamProductivity: { name: string; completed: number; remaining: number }[];
  taskStatus: { status: string; count: number }[];
  overdueTasks: { id: string; title: string; project: string | null; assignee: string | null; daysOverdue: number; priority: string }[];
}

interface Department { id: number; name: string }
interface Project { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  TODO:        '#94a3b8',
  IN_PROGRESS: '#3b82f6',
  REVIEW:      '#f59e0b',
  DONE:        '#10b981',
};

const STATUS_LABELS: Record<string, string> = {
  TODO: 'À faire', IN_PROGRESS: 'En cours', REVIEW: 'En révision', DONE: 'Terminé',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-slate-400', MEDIUM: 'text-blue-500', HIGH: 'text-amber-500', URGENT: 'text-red-500',
};

const INDIVIDUAL_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT:      'bg-emerald-500',
  RETARD:       'bg-amber-400',
  ABSENT:       'bg-red-400',
  DEMI_JOURNEE: 'bg-sky-400',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: any) {
  if (!iso) return '';
  const d = new Date(String(iso));
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

function heatIntensity(count: number, max: number): string {
  if (max === 0 || count === 0) return 'bg-slate-100';
  const ratio = count / max;
  if (ratio < 0.25) return 'bg-violet-100';
  if (ratio < 0.5)  return 'bg-violet-300';
  if (ratio < 0.75) return 'bg-violet-500';
  return 'bg-violet-700';
}

// ─── Main Page ────────────────────────────────────────────────────────────────

async function exportToPDF(data: OverviewData | undefined, from: string, to: string) {
  if (!data) return;
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  let y = 15;

  // Title
  doc.setFontSize(18);
  doc.setTextColor(99, 102, 241);
  doc.text('Rapport Analytics — Gestion Entreprise', pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Période : ${from} → ${to}   |   Généré le : ${new Date().toLocaleDateString('fr-FR')}`, pageW / 2, y, { align: 'center' });
  y += 10;

  // KPIs
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text('Indicateurs clés', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Indicateur', 'Valeur']],
    body: [
      ['Tâches terminées cette semaine', String(data.kpis.tasksCompletedThisWeek.count)],
      ['Évolution vs semaine précédente', `${data.kpis.tasksCompletedThisWeek.changePercent > 0 ? '+' : ''}${data.kpis.tasksCompletedThisWeek.changePercent}%`],
      ['Charge moyenne équipe', String(data.kpis.avgWorkload)],
      ['Top producteur', data.kpis.topProducer ? `${data.kpis.topProducer.name} (${data.kpis.topProducer.tasksCompleted} tâches)` : '—'],
      ['Projet le plus en retard', data.kpis.mostOverdueProject ? `${data.kpis.mostOverdueProject.name} (${data.kpis.mostOverdueProject.count} tâches, max ${data.kpis.mostOverdueProject.maxDaysLate}j)` : 'Aucun'],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [99, 102, 241] },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Team productivity
  if (data.teamProductivity?.length) {
    doc.setFontSize(13);
    doc.text('Productivité par équipe', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Membre', 'Terminées', 'Restantes']],
      body: data.teamProductivity.map((r) => [r.name, String(r.completed), String(r.remaining)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [99, 102, 241] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.save(`analytics_${from}_${to}.pdf`);
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const today     = new Date();
  const weekAgo   = new Date(today.getTime() - 6 * 86400000);
  const [from, setFrom] = useState(toInputDate(weekAgo));
  const [to,   setTo]   = useState(toInputDate(today));
  const [deptId,  setDeptId]  = useState('');
  const [projId,  setProjId]  = useState('');
  const [prodView, setProdView] = useState<'team' | 'individual'>('team');

  const lastRefresh = useRef(0);

  const queryKey = ['analytics', from, to, deptId, projId];

  const { data, isLoading, isFetching } = useQuery<OverviewData>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (deptId) params.set('departmentId', deptId);
      if (projId) params.set('projectId', projId);
      return (await api.get(`/api/analytics/overview?${params}`)).data;
    },
  });

  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefresh.current < 30_000) return; // debounce 30s
    lastRefresh.current = now;
    qc.invalidateQueries({ queryKey: ['analytics'] });
  }, [qc]);

  // Listen for SSE-triggered refresh
  useEffect(() => {
    window.addEventListener('analytics:refresh', refresh);
    return () => window.removeEventListener('analytics:refresh', refresh);
  }, [refresh]);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/api/hr/departments')).data,
    enabled: user?.role === 'ADMIN' || user?.role === 'RH',
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-light'],
    queryFn: async () => (await api.get('/api/projects')).data,
    enabled: user?.role === 'ADMIN' || user?.role === 'RH',
  });

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'RH';

  // ── Workload heatmap max (for color scale) ────────────────────────────────
  const heatMax = Math.max(
    1,
    ...(data?.workloadHeatmap.flatMap((u) => u.days.map((d) => d.count)) ?? []),
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 className="text-violet-600" size={24} />
          <h1 className="text-2xl font-bold text-slate-800">Analytics</h1>
          {isFetching && <Loader2 size={16} className="animate-spin text-slate-400" />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToPDF(data, from, to)}
            disabled={!data || isLoading}
            className="flex items-center gap-1.5 text-sm text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition"
          >
            <FileDown size={14} /> Exporter PDF
          </button>
          <button onClick={() => qc.invalidateQueries({ queryKey: ['analytics'] })}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-2">
          <CalendarRange size={15} className="text-slate-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <span className="text-slate-400 text-sm">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>

        {/* Quick presets */}
        {(['7j', '30j', '90j'] as const).map((label) => {
          const days = label === '7j' ? 7 : label === '30j' ? 30 : 90;
          return (
            <button key={label} onClick={() => {
              const t = new Date(); const f = new Date(t.getTime() - (days - 1) * 86400000);
              setFrom(toInputDate(f)); setTo(toInputDate(t));
            }}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 transition">
              {label}
            </button>
          );
        })}

        {isAdmin && (
          <>
            <div className="flex items-center gap-1 ml-2">
              <Filter size={14} className="text-slate-400" />
            </div>
            <select value={deptId} onChange={(e) => setDeptId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400">
              <option value="">Tous les départements</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={projId} onChange={(e) => setProjId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400">
              <option value="">Tous les projets</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-violet-500" size={32} />
        </div>
      ) : !data ? null : (
        <>
          {/* A. KPI Row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              icon={<Trophy size={18} className="text-amber-500" />}
              label="Meilleur contributeur"
              value={data.kpis.topProducer?.name ?? '—'}
              sub={data.kpis.topProducer ? `${data.kpis.topProducer.tasksCompleted ?? data.kpis.topProducer} tâche(s) terminée(s)` : 'Aucune tâche terminée'}
              color="amber"
            />
            <KpiCard
              icon={<AlertTriangle size={18} className="text-red-500" />}
              label="Projet le plus en retard"
              value={data.kpis.mostOverdueProject?.name ?? '—'}
              sub={data.kpis.mostOverdueProject
                ? `${data.kpis.mostOverdueProject.count} tâche(s), ${data.kpis.mostOverdueProject.maxDaysLate}j de retard`
                : 'Aucun retard'}
              color="red"
            />
            <KpiCard
              icon={<CheckCircle2 size={18} className="text-emerald-500" />}
              label="Tâches terminées"
              value={String(data.kpis.tasksCompletedThisWeek.count)}
              sub={<ChangeChip pct={data.kpis.tasksCompletedThisWeek.changePercent} />}
              color="emerald"
            />
            <KpiCard
              icon={<Users2 size={18} className="text-blue-500" />}
              label="Charge moyenne / employé"
              value={`${data.kpis.avgWorkload}`}
              sub="tâches actives"
              color="blue"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* B. Productivity Chart */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-700">Productivité — tâches terminées</h2>
                <div className="flex text-xs rounded-lg overflow-hidden border border-slate-200">
                  {(['team', 'individual'] as const).map((v) => (
                    <button key={v} onClick={() => setProdView(v)}
                      className={`px-3 py-1.5 transition ${prodView === v ? 'bg-violet-600 text-white' : 'hover:bg-slate-50 text-slate-600'}`}>
                      {v === 'team' ? 'Global' : 'Top 5'}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                {prodView === 'team' ? (
                  <BarChart data={data.productivity} barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [v, 'Terminées']} labelFormatter={shortDate} />
                    <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={data.byIndividual}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={shortDate} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data.top5Names.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={INDIVIDUAL_COLORS[i]} dot={false} strokeWidth={2} />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* F. Task Status Donut */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="font-semibold text-slate-700 mb-4">Distribution des statuts</h2>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={data.taskStatus} dataKey="count" nameKey="status"
                    cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {data.taskStatus.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#cbd5e1'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, STATUS_LABELS[name as string] ?? name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {data.taskStatus.map((s) => (
                  <div key={s.status} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[s.status] }} />
                    <span className="truncate">{STATUS_LABELS[s.status]}</span>
                    <span className="ml-auto font-semibold">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* E. Team Productivity */}
          {data.teamProductivity.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="font-semibold text-slate-700 mb-4">Productivité par projet</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.teamProductivity} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="completed" name="Terminées" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="remaining" name="Restantes"  fill="#e2e8f0" stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* C. Workload Heatmap */}
          {data.workloadHeatmap.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-700">Heatmap — tâches terminées par employé</h2>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <span className="w-3 h-3 rounded bg-slate-100 border" />
                  <span>0</span>
                  <span className="w-3 h-3 rounded bg-violet-200" />
                  <span className="w-3 h-3 rounded bg-violet-400" />
                  <span className="w-3 h-3 rounded bg-violet-600" />
                  <span className="w-3 h-3 rounded bg-violet-800" />
                  <span>max</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-slate-400 font-normal pr-3 py-1 w-32">Employé</th>
                      {data.workloadHeatmap[0]?.days.map((d) => (
                        <th key={d.date} className="text-center text-slate-400 font-normal px-0.5 min-w-[1.75rem]">
                          {shortDate(d.date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.workloadHeatmap.map((row) => (
                      <tr key={row.userId}>
                        <td className="pr-3 py-1 font-medium text-slate-600 truncate max-w-[8rem]" title={row.name}>
                          {row.name}
                        </td>
                        {row.days.map((d) => (
                          <td key={d.date} className="px-0.5 py-1">
                            <div
                              title={`${row.name} — ${d.date}: ${d.count} tâche(s)`}
                              className={`w-6 h-6 rounded cursor-default transition ${heatIntensity(d.count, heatMax)}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* D. Activity (Attendance) Heatmap */}
          {data.activityHeatmap.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-700">Heatmap — présences / activité</h2>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {[['bg-emerald-500', 'Présent'], ['bg-amber-400', 'Retard'], ['bg-red-400', 'Absent'], ['bg-slate-100 border', 'Non renseigné']].map(([cls, label]) => (
                    <span key={label} className="flex items-center gap-1"><span className={`w-3 h-3 rounded ${cls}`} />{label}</span>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-slate-400 font-normal pr-3 py-1 w-32">Employé</th>
                      {data.activityHeatmap[0]?.days.map((d) => (
                        <th key={d.date} className="text-center text-slate-400 font-normal px-0.5 min-w-[1.75rem]">
                          {shortDate(d.date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.activityHeatmap.map((row) => (
                      <tr key={row.userId}>
                        <td className="pr-3 py-1 font-medium text-slate-600 truncate max-w-[8rem]" title={row.name}>
                          {row.name}
                        </td>
                        {row.days.map((d) => (
                          <td key={d.date} className="px-0.5 py-1">
                            <div
                              title={`${row.name} — ${d.date}: ${d.status ?? 'Non renseigné'}`}
                              className={`w-6 h-6 rounded cursor-default ${d.status ? ATTENDANCE_COLORS[d.status] ?? 'bg-slate-200' : 'bg-slate-100 border border-slate-200'}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* G. Overdue Tasks */}
          {data.overdueTasks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500" />
                <h2 className="font-semibold text-slate-700">Tâches en retard</h2>
                <span className="ml-auto text-xs text-slate-400">{data.overdueTasks.length} tâche(s)</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Tâche</th>
                    <th className="px-5 py-2.5 font-medium">Projet</th>
                    <th className="px-5 py-2.5 font-medium">Assigné à</th>
                    <th className="px-5 py-2.5 font-medium">Retard</th>
                    <th className="px-5 py-2.5 font-medium">Priorité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.overdueTasks.map((t) => (
                    <tr key={t.id} className="hover:bg-red-50/40 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-700 max-w-xs truncate">{t.title}</td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{t.project ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{t.assignee ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          +{t.daysOverdue}j
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                          {t.priority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.overdueTasks.length === 0 && data.taskStatus.every((s) => s.status !== 'DONE' || s.count === 0) && (
            <div className="text-center py-12 text-slate-400 text-sm">
              Aucune donnée pour cette période. Essayez d'élargir la plage de dates.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: React.ReactNode;
  color: 'amber' | 'red' | 'emerald' | 'blue';
}) {
  const bg: Record<string, string> = {
    amber:   'bg-amber-50 border-amber-100',
    red:     'bg-red-50 border-red-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    blue:    'bg-blue-50 border-blue-100',
  };
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${bg[color]}`}>
      <div className="flex items-center gap-2 mb-3">{icon}<span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span></div>
      <div className="text-xl font-bold text-slate-800 truncate" title={value}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function ChangeChip({ pct }: { pct: number }) {
  if (pct > 0) return <span className="flex items-center gap-0.5 text-emerald-600 font-semibold"><TrendingUp size={12} />+{pct}% vs période préc.</span>;
  if (pct < 0) return <span className="flex items-center gap-0.5 text-red-500 font-semibold"><TrendingDown size={12} />{pct}% vs période préc.</span>;
  return <span className="flex items-center gap-0.5 text-slate-400"><Minus size={12} />Stable vs période préc.</span>;
}
