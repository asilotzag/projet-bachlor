import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  LayoutDashboard, FileText, FolderKanban, Users2, Clock,
  AlertTriangle, Info, AlertCircle, CheckCircle2, Sparkles,
  Loader2, ChevronRight, Wand2, X, ClipboardList, Plus,
  HardDrive, Activity, Bell, TrendingUp, CalendarRange,
  UserCheck, Calendar, CheckCheck, XCircle, Building2, Briefcase,
  Target, Users, ArrowRight, Gift,
} from 'lucide-react';
import { api, apiAI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import WellnessWidget from '../components/WellnessWidget';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaveRow {
  id: number; type: string; reason: string | null;
  startDate: string; endDate: string;
  employee: { fullName: string };
}

interface AdminDashData {
  kpis: { totalEmployes: number; totalManagers: number; projetsActifs: number; docsCount: number; docsBytes: number; congesEnAttente: number; tachesOuvertes: number };
  charts: {
    evolutionEmployes: { month: string; count: number }[];
    repartitionProjets: { status: string; count: number }[];
    productiviteParDept: { dept: string; done: number }[];
    presencesMensuelles: Record<string, any>[];
  };
  widgets: {
    recentActivity: { kind: 'doc' | 'task'; id: string; title: string; actor: string; at: string; extra?: string }[];
    derniersDocuments: { id: string; title: string; by: string; category: string | null; at: string }[];
    contratsExpirant: { id: number; type: string; endDate: string; employee: { fullName: string; dept: string | null } }[];
    projetsEnRetard: { id: string; name: string; manager: string; overdueCount: number; maxDaysLate: number }[];
    congesAValider: LeaveRow[];
  };
}

interface RHDashData {
  kpis: { employes: number; presentsAujourdhui: number; absentsAujourdhui: number; congesEnAttente: number; contratsExpirantCeMois: number };
  charts: {
    absenteisme: { month: string; count: number }[];
    repartitionConges: { type: string; count: number }[];
    evolutionEffectifs: { month: string; count: number }[];
  };
  widgets: {
    congesAValider: LeaveRow[];
    nouveauxEmployes: { fullName: string; email: string; dept: string | null; hireDate: string }[];
    anniversairesDuMois: { fullName: string; dept: string | null; birthDate: string; age: number }[];
    contratsARenouveler: { id: number; type: string; endDate: string; employee: { fullName: string; dept: string | null } }[];
    presenceSemaine: Record<string, number>;
  };
}

interface ManagerDashData {
  kpis: { mesProjets: number; tachesEnRetard: number; terminesCetteSemaine: number; membresEquipe: number; reunionsAVenir: number };
  charts: {
    progressionProjet: { name: string; pct: number; done: number; total: number }[];
    repartitionTaches: { status: string; count: number }[];
    productiviteEquipe: { name: string; done: number; inProgress: number; todo: number }[];
  };
  widgets: {
    projetsAvancement: { id: string; name: string; status: string; color: string; total: number; done: number; pct: number }[];
    kanbanResume: Record<string, number>;
    deadlinesProches: { id: string; title: string; dueDate: string; priority: string; status: string; assignee: { fullName: string } | null }[];
    chargeEquipe: { name: string; count: number }[];
    employesEnConge: { fullName: string; type: string; startDate: string; endDate: string }[];
  };
}

interface MyTask {
  id: string; title: string; description?: string; status: string; priority: string;
  assigneeStatus?: string; assigneeNotes?: string; dueDate?: string;
  project?: { id: string; name: string } | null;
  createdBy: { fullName: string };
}

interface EmployeeDashData {
  kpis: { tachesAujourdhui: number; tachesEnRetard: number; soldeCongés: { used: number; total: number }; reunionsAujourdhui: number };
  charts: {
    tachesCeMois: { day: string; count: number }[];
    tachesParProjet: { name: string; count: number }[];
  };
  widgets: {
    prochainesTaches: MyTask[];
    notifications: { id: string; type: string; title: string; body: string; link: string | null; createdAt: string }[];
    docsRecents: { id: string; title: string; by: string; category: string | null; at: string }[];
    reunionsAVenir: { id: string; title: string; startAt: string; endAt: string; location: string | null }[];
    congesDemandes: { id: number; type: string; status: string; reason: string | null; startDate: string; endDate: string; createdAt: string }[];
  };
}

interface InsightsData { insights: { type: 'warning' | 'info' | 'danger'; title: string; description: string }[]; aiSummary: string | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = { TODO: '#94a3b8', IN_PROGRESS: '#3b82f6', REVIEW: '#f59e0b', DONE: '#10b981' };
const STATUS_LABELS: Record<string, string> = { TODO: 'À faire', IN_PROGRESS: 'En cours', REVIEW: 'Révision', DONE: 'Terminé' };
const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-500', MEDIUM: 'bg-blue-100 text-blue-600',
  HIGH: 'bg-amber-100 text-amber-700', URGENT: 'bg-red-100 text-red-600',
};
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const LEAVE_TYPE_LABELS: Record<string, string> = {
  CONGE_PAYE: 'Congé payé', CONGE_SANS_SOLDE: 'Sans solde',
  MALADIE: 'Maladie', MATERNITE: 'Maternité', PATERNITE: 'Paternité', AUTRE: 'Autre',
};
const PROJECT_STATUS_LABELS: Record<string, string> = { ACTIVE: 'Actif', ON_HOLD: 'En pause', COMPLETED: 'Terminé', CANCELLED: 'Annulé' };
const LEAVE_STATUS_CHIP: Record<string, string> = {
  EN_ATTENTE: 'bg-amber-100 text-amber-700', APPROUVE: 'bg-emerald-100 text-emerald-700', REFUSE: 'bg-red-100 text-red-700',
};

const INSIGHT_STYLES = {
  danger:  { icon: <AlertCircle size={16} />, cls: 'bg-red-50 border-red-200 text-red-700' },
  warning: { icon: <AlertTriangle size={16} />, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
  info:    { icon: <Info size={16} />, cls: 'bg-blue-50 border-blue-200 text-blue-700' },
};

const GENERATE_TYPES = [
  { value: 'task_description', label: 'Description de tâche' },
  { value: 'job_posting', label: "Offre d'emploi" },
  { value: 'leave_response', label: 'Réponse congé' },
  { value: 'project_summary', label: 'Résumé de projet' },
  { value: 'report', label: 'Rapport périodique' },
  { value: 'custom', label: 'Texte libre' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} Mo`;
  return `${(bytes / 1073741824).toFixed(2)} Go`;
}

function fmtRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'hier';
  return `il y a ${days}j`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function fmtDateFull(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function shortMonth(iso: string): string {
  return new Date(iso + '-01').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
}

// ─── Shared Components ────────────────────────────────────────────────────────

function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
      <LayoutDashboard className="text-blue-600 shrink-0" size={22} />
      <div className="flex-1">
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function KPICard({ label, value, icon, color, sub }: { label: string; value: string | number; icon: React.ReactNode; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-800 truncate">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function LeaveApprovalCard({ leave, onDecision }: { leave: LeaveRow; onDecision: (id: number, status: string) => void }) {
  const days = Math.round((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / 86400000) + 1;
  return (
    <div className="border border-slate-100 rounded-xl p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-medium text-slate-700">{leave.employee.fullName}</p>
          <p className="text-xs text-slate-400">
            {LEAVE_TYPE_LABELS[leave.type] ?? leave.type} · {fmtDate(leave.startDate)} → {fmtDate(leave.endDate)} ({days}j)
          </p>
          {leave.reason && <p className="text-xs text-slate-500 mt-0.5 italic">"{leave.reason}"</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onDecision(leave.id, 'APPROUVE')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium transition">
          <CheckCheck size={12} /> Approuver
        </button>
        <button onClick={() => onDecision(leave.id, 'REFUSE')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium transition">
          <XCircle size={12} /> Refuser
        </button>
      </div>
    </div>
  );
}

// ─── ADMIN HOME ───────────────────────────────────────────────────────────────

function AdminHome() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const { data, isLoading } = useQuery<AdminDashData>({
    queryKey: ['dashboard-admin'],
    queryFn: () => api.get('/api/dashboard/admin').then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: insightsData, isLoading: insightsLoading } = useQuery<InsightsData>({
    queryKey: ['ai-insights'],
    queryFn: () => apiAI.get('/api/ai/insights').then((r) => r.data),
    staleTime: 120_000,
  });

  const leaveMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/api/hr/leaves/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dashboard-admin'] }); toast.success('Décision enregistrée'); },
    onError: () => toast.error('Erreur'),
  });

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const alerts = data ? [
    data.kpis.congesEnAttente > 0 && { id: 'leaves', type: 'warning' as const, msg: `${data.kpis.congesEnAttente} demande(s) de congé en attente de validation` },
    data.widgets.projetsEnRetard.length > 0 && { id: 'late', type: 'danger' as const, msg: `${data.widgets.projetsEnRetard.length} projet(s) avec des tâches en retard` },
    data.widgets.contratsExpirant.length > 0 && { id: 'contracts', type: 'info' as const, msg: `${data.widgets.contratsExpirant.length} contrat(s) expirent dans les 30 prochains jours` },
  ].filter(Boolean).filter((a: any) => !dismissedAlerts.includes(a.id)) : [];

  const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
    doc: <FileText size={14} className="text-blue-500" />,
    task: <FolderKanban size={14} className="text-violet-500" />,
  };

  const TASK_STATUS_CHIP: Record<string, string> = {
    TODO: 'bg-slate-100 text-slate-600', IN_PROGRESS: 'bg-blue-100 text-blue-700',
    REVIEW: 'bg-amber-100 text-amber-700', DONE: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <PageHeader
        title="Vue d'ensemble système"
        subtitle={`Bonjour, ${user?.fullName} — ${today}`}
        action={
          <button onClick={() => setShowAssign(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            <Plus size={15} /> Assigner une tâche
          </button>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Alert banners */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {(alerts as { id: string; type: 'warning' | 'danger' | 'info'; msg: string }[]).map((a) => {
              const styles = { warning: 'bg-amber-50 border-amber-200 text-amber-800', danger: 'bg-red-50 border-red-200 text-red-800', info: 'bg-blue-50 border-blue-200 text-blue-800' };
              const icons = { warning: <AlertTriangle size={15} />, danger: <AlertCircle size={15} />, info: <Info size={15} /> };
              return (
                <div key={a.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${styles[a.type]}`}>
                  {icons[a.type]}
                  <span className="flex-1">{a.msg}</span>
                  <button onClick={() => setDismissedAlerts((d) => [...d, a.id])}><X size={14} /></button>
                </div>
              );
            })}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
        ) : data && (
          <>
            {/* 6 KPI cards */}
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
              <KPICard label="Employés actifs" value={data.kpis.totalEmployes} icon={<Users2 size={20} />} color="bg-blue-500" />
              <KPICard label="Managers" value={data.kpis.totalManagers} icon={<Briefcase size={20} />} color="bg-violet-500" />
              <KPICard label="Projets actifs" value={data.kpis.projetsActifs} icon={<FolderKanban size={20} />} color="bg-emerald-500" />
              <KPICard label="Documents" value={data.kpis.docsCount} icon={<FileText size={20} />} color="bg-cyan-500" sub={fmtBytes(data.kpis.docsBytes)} />
              <KPICard label="Congés en attente" value={data.kpis.congesEnAttente} icon={<Clock size={20} />} color={data.kpis.congesEnAttente > 0 ? 'bg-amber-500' : 'bg-slate-400'} />
              <KPICard label="Tâches ouvertes" value={data.kpis.tachesOuvertes} icon={<ClipboardList size={20} />} color={data.kpis.tachesOuvertes > 20 ? 'bg-red-500' : 'bg-slate-500'} />
            </div>

            {/* 4 charts */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Evolution employés */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Users size={15} className="text-blue-500" /> Évolution des effectifs (6 mois)</h3>
                {data.charts.evolutionEmployes.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">Aucune donnée</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={data.charts.evolutionEmployes.map((r) => ({ ...r, label: shortMonth(r.month) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip formatter={(v) => [v, 'Embauches']} />
                        <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
              </div>

              {/* Répartition projets */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><FolderKanban size={15} className="text-violet-500" /> Répartition des projets</h3>
                {data.charts.repartitionProjets.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">Aucun projet</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={data.charts.repartitionProjets.map((r) => ({ ...r, label: PROJECT_STATUS_LABELS[r.status] ?? r.status }))}
                          dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={75}>
                          {data.charts.repartitionProjets.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v, n]} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
              </div>

              {/* Productivité par département */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp size={15} className="text-emerald-500" /> Productivité par département</h3>
                {data.charts.productiviteParDept.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">Aucune donnée</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data.charts.productiviteParDept} layout="vertical" barCategoryGap="20%">
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="dept" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip formatter={(v) => [v, 'Tâches terminées']} />
                        <Bar dataKey="done" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </div>

              {/* Présences mensuelles */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><UserCheck size={15} className="text-cyan-500" /> Présences mensuelles (6 mois)</h3>
                {data.charts.presencesMensuelles.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">Aucune donnée</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data.charts.presencesMensuelles.map((r) => ({ ...r, label: shortMonth(r.month) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="PRESENT" stackId="a" name="Présents" fill="#10b981" />
                        <Bar dataKey="ABSENT" stackId="a" name="Absents" fill="#ef4444" />
                        <Bar dataKey="RETARD" stackId="a" name="Retards" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </div>
            </div>

            {/* Widgets row 1: Activity + Congés à valider */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Activité récente */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={16} className="text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-700">Activité récente</h3>
                </div>
                {data.widgets.recentActivity.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucune activité.</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.recentActivity.map((item, i) => (
                        <div key={`${item.kind}-${item.id}-${i}`} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                          <div className="shrink-0 w-6 flex justify-center">{ACTIVITY_ICONS[item.kind]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 truncate">{item.title}</p>
                            <p className="text-xs text-slate-400">{item.actor}</p>
                          </div>
                          {item.extra && item.kind === 'task' && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TASK_STATUS_CHIP[item.extra] ?? 'bg-slate-100 text-slate-600'}`}>
                              {STATUS_LABELS[item.extra] ?? item.extra}
                            </span>
                          )}
                          {item.extra && item.kind === 'doc' && (
                            <span className="text-xs text-slate-400 shrink-0">{item.extra}</span>
                          )}
                          <span className="text-xs text-slate-400 shrink-0">{fmtRelative(item.at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Congés à valider */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Congés à valider</h3>
                  {data.widgets.congesAValider.length > 0 && (
                    <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{data.widgets.congesAValider.length}</span>
                  )}
                </div>
                {data.widgets.congesAValider.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucune demande en attente.</p>
                  : (
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {data.widgets.congesAValider.map((leave) => (
                        <LeaveApprovalCard key={leave.id} leave={leave} onDecision={(id, status) => leaveMut.mutate({ id, status })} />
                      ))}
                    </div>
                  )}
              </div>
            </div>

            {/* Widgets row 2: Docs + Contrats + Projets en retard */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Derniers documents */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FileText size={16} className="text-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Documents récents</h3>
                </div>
                {data.widgets.derniersDocuments.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucun document.</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.derniersDocuments.map((d) => (
                        <div key={d.id} className="py-2.5 border-b border-slate-100 last:border-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{d.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{d.by} · {d.category ?? 'Sans cat.'} · {fmtRelative(d.at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Contrats expirant */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FileText size={16} className="text-red-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Contrats expirant (30j)</h3>
                  {data.widgets.contratsExpirant.length > 0 && (
                    <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{data.widgets.contratsExpirant.length}</span>
                  )}
                </div>
                {data.widgets.contratsExpirant.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucun contrat n'expire.</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.contratsExpirant.map((c) => {
                        const days = daysUntil(c.endDate);
                        return (
                          <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">{c.employee.fullName}</p>
                              <p className="text-xs text-slate-400">{c.type} · {c.employee.dept ?? 'N/A'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-medium text-slate-600">{fmtDate(c.endDate)}</p>
                              <p className={`text-xs font-medium ${days <= 7 ? 'text-red-600' : days <= 14 ? 'text-amber-600' : 'text-slate-500'}`}>dans {days}j</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>

              {/* Projets en retard */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle size={16} className="text-red-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Projets en retard</h3>
                  {data.widgets.projetsEnRetard.length > 0 && (
                    <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{data.widgets.projetsEnRetard.length}</span>
                  )}
                </div>
                {data.widgets.projetsEnRetard.length === 0
                  ? <p className="text-slate-400 text-sm italic text-center py-4"><CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-1" />Aucun projet en retard !</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.projetsEnRetard.map((p) => (
                        <div key={p.id} className="py-2.5 border-b border-slate-100 last:border-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{p.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">Manager: {p.manager}</p>
                          <div className="flex gap-3 mt-1">
                            <span className="text-xs text-red-600 font-medium">{p.overdueCount} tâche(s) en retard</span>
                            <span className="text-xs text-slate-400">max {p.maxDaysLate}j de retard</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          </>
        )}

        {/* AI + Wellness section */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <InsightsPanel data={insightsData} isLoading={insightsLoading} />
          </div>
          <WellnessWidget />
        </div>
      </div>

      {showAssign && (
        <QuickAssignModal onClose={() => setShowAssign(false)} onSuccess={() => { setShowAssign(false); qc.invalidateQueries({ queryKey: ['dashboard-admin'] }); }} />
      )}
    </div>
  );
}

// ─── RH HOME ─────────────────────────────────────────────────────────────────

function RHHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<RHDashData>({
    queryKey: ['dashboard-rh'],
    queryFn: () => api.get('/api/dashboard/rh').then((r) => r.data),
    staleTime: 30_000,
  });

  const leaveMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/api/hr/leaves/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dashboard-rh'] }); toast.success('Décision enregistrée'); },
    onError: () => toast.error('Erreur'),
  });

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const QUICK_ACTIONS = [
    { label: 'Documents', icon: <FileText size={16} />, to: '/documents', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { label: 'Assiduité', icon: <UserCheck size={16} />, to: '/attendance', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { label: 'Ressources Hum.', icon: <Users2 size={16} />, to: '/hr', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
    { label: 'Utilisateurs', icon: <Users size={16} />, to: '/users', color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
  ];

  const PRESENCE_CONFIG: Record<string, { label: string; color: string }> = {
    PRESENT: { label: 'Présents', color: '#10b981' },
    ABSENT: { label: 'Absents', color: '#ef4444' },
    RETARD: { label: 'Retards', color: '#f59e0b' },
    DEMI_JOURNEE: { label: 'Demi-journée', color: '#3b82f6' },
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <PageHeader title="Tableau de bord RH" subtitle={`Bonjour, ${user?.fullName} — ${today}`} />

      <div className="flex-1 p-6 space-y-6">
        {/* Quick actions */}
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.map((a) => (
            <button key={a.to} onClick={() => navigate(a.to)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition ${a.color}`}>
              {a.icon} {a.label} <ArrowRight size={14} />
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
        ) : data && (
          <>
            {/* 5 KPIs */}
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              <KPICard label="Employés actifs" value={data.kpis.employes} icon={<Users2 size={20} />} color="bg-blue-500" />
              <KPICard label="Présents aujourd'hui" value={data.kpis.presentsAujourdhui} icon={<UserCheck size={20} />} color="bg-emerald-500" />
              <KPICard label="Absents aujourd'hui" value={data.kpis.absentsAujourdhui} icon={<XCircle size={20} />} color={data.kpis.absentsAujourdhui > 0 ? 'bg-red-500' : 'bg-slate-400'} />
              <KPICard label="Congés en attente" value={data.kpis.congesEnAttente} icon={<Clock size={20} />} color={data.kpis.congesEnAttente > 0 ? 'bg-amber-500' : 'bg-slate-400'} />
              <KPICard label="Contrats expirant ce mois" value={data.kpis.contratsExpirantCeMois} icon={<FileText size={20} />} color={data.kpis.contratsExpirantCeMois > 0 ? 'bg-red-500' : 'bg-slate-400'} />
            </div>

            {/* 3 charts */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Absentéisme */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><AlertTriangle size={14} className="text-red-400" /> Absentéisme (6 mois)</h3>
                {data.charts.absenteisme.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">Aucune absence</p>
                  : (
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={data.charts.absenteisme.map((r) => ({ ...r, label: shortMonth(r.month) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip formatter={(v) => [v, 'Absences']} />
                        <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
              </div>

              {/* Répartition congés */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Calendar size={14} className="text-amber-500" /> Types de congés</h3>
                {data.charts.repartitionConges.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">Aucun congé</p>
                  : (
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={data.charts.repartitionConges.map((r) => ({ ...r, label: LEAVE_TYPE_LABELS[r.type] ?? r.type }))}
                          dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                          {data.charts.repartitionConges.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v, n]} />
                        <Legend iconSize={9} wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
              </div>

              {/* Évolution effectifs */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp size={14} className="text-blue-500" /> Évolution effectifs (6 mois)</h3>
                {data.charts.evolutionEffectifs.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">Aucune donnée</p>
                  : (
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={data.charts.evolutionEffectifs.map((r) => ({ ...r, label: shortMonth(r.month) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip formatter={(v) => [v, 'Embauches']} />
                        <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
              </div>
            </div>

            {/* Widgets row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Congés à valider */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Congés à valider</h3>
                  {data.widgets.congesAValider.length > 0 && (
                    <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{data.widgets.congesAValider.length}</span>
                  )}
                </div>
                {data.widgets.congesAValider.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucune demande en attente.</p>
                  : (
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {data.widgets.congesAValider.map((leave) => (
                        <LeaveApprovalCard key={leave.id} leave={leave} onDecision={(id, status) => leaveMut.mutate({ id, status })} />
                      ))}
                    </div>
                  )}
              </div>

              {/* Présence semaine */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <UserCheck size={16} className="text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-700">Présence cette semaine</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(PRESENCE_CONFIG).map(([status, cfg]) => (
                    <div key={status} className="border border-slate-100 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold" style={{ color: cfg.color }}>{data.widgets.presenceSemaine[status] ?? 0}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{cfg.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Nouveaux employés */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Users2 size={16} className="text-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Nouveaux employés (30j)</h3>
                  <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{data.widgets.nouveauxEmployes.length}</span>
                </div>
                {data.widgets.nouveauxEmployes.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucun nouvel arrivant.</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.nouveauxEmployes.map((e, i) => (
                        <div key={i} className="py-2.5 border-b border-slate-100 last:border-0">
                          <p className="text-sm font-medium text-slate-700">{e.fullName}</p>
                          <p className="text-xs text-slate-400">{e.dept ?? 'N/A'} · Embauché le {fmtDate(e.hireDate)}</p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Anniversaires du mois */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Gift size={16} className="text-pink-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Anniversaires du mois</h3>
                  <span className="ml-auto text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-medium">{data.widgets.anniversairesDuMois.length}</span>
                </div>
                {data.widgets.anniversairesDuMois.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucun anniversaire ce mois.</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.anniversairesDuMois.map((e, i) => (
                        <div key={i} className="py-2.5 border-b border-slate-100 last:border-0 flex items-center gap-2">
                          <span className="text-lg">🎂</span>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{e.fullName}</p>
                            <p className="text-xs text-slate-400">{e.dept ?? 'N/A'} · {e.age} ans le {fmtDate(e.birthDate)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Contrats à renouveler */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FileText size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Contrats à renouveler (60j)</h3>
                  <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{data.widgets.contratsARenouveler.length}</span>
                </div>
                {data.widgets.contratsARenouveler.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucun contrat à renouveler.</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.contratsARenouveler.map((c) => {
                        const days = daysUntil(c.endDate);
                        return (
                          <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">{c.employee.fullName}</p>
                              <p className="text-xs text-slate-400">{c.type} · {c.employee.dept ?? 'N/A'}</p>
                            </div>
                            <p className={`text-xs font-medium shrink-0 ${days <= 14 ? 'text-red-600' : 'text-amber-600'}`}>dans {days}j</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            </div>
          </>
        )}

        {/* Wellness */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2" />
          <WellnessWidget />
        </div>
      </div>
    </div>
  );
}

// ─── MANAGER HOME ─────────────────────────────────────────────────────────────

function ManagerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);

  const { data, isLoading } = useQuery<ManagerDashData>({
    queryKey: ['dashboard-manager'],
    queryFn: () => api.get('/api/dashboard/manager').then((r) => r.data),
    staleTime: 60_000,
  });

  const QUICK_ACTIONS = [
    { label: 'Tâches', icon: <ClipboardList size={16} />, to: '/tasks', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { label: 'Analytics', icon: <TrendingUp size={16} />, to: '/analytics', color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
    { label: 'Calendrier', icon: <Calendar size={16} />, to: '/calendar', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { label: 'Ressources Hum.', icon: <Users2 size={16} />, to: '/hr', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
  ];

  const PRIORITY_CHIP: Record<string, string> = {
    URGENT: 'bg-red-100 text-red-700', HIGH: 'bg-amber-100 text-amber-700',
    MEDIUM: 'bg-blue-100 text-blue-700', LOW: 'bg-slate-100 text-slate-500',
  };

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <PageHeader
        title="Tableau de bord Manager"
        subtitle={`Bonjour, ${user?.fullName} — ${today}`}
        action={
          <button onClick={() => setShowAssign(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            <Plus size={15} /> Assigner une tâche
          </button>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Quick actions */}
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.map((a) => (
            <button key={a.to} onClick={() => navigate(a.to)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition ${a.color}`}>
              {a.icon} {a.label} <ArrowRight size={14} />
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
        ) : data && (
          <>
            {/* 5 KPIs */}
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              <KPICard label="Mes projets" value={data.kpis.mesProjets} icon={<FolderKanban size={20} />} color="bg-blue-500" />
              <KPICard label="Tâches en retard" value={data.kpis.tachesEnRetard} icon={<AlertTriangle size={20} />} color={data.kpis.tachesEnRetard > 0 ? 'bg-red-500' : 'bg-slate-400'} />
              <KPICard label="Terminées cette sem." value={data.kpis.terminesCetteSemaine} icon={<CheckCircle2 size={20} />} color="bg-emerald-500" />
              <KPICard label="Membres équipe" value={data.kpis.membresEquipe} icon={<Users2 size={20} />} color="bg-violet-500" />
              <KPICard label="Réunions à venir" value={data.kpis.reunionsAVenir} icon={<CalendarRange size={20} />} color="bg-cyan-500" />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Progression projet bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Target size={14} className="text-blue-500" /> Avancement projets</h3>
                {data.charts.progressionProjet.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-6">Aucun projet</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data.charts.progressionProjet} layout="vertical">
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                        <Tooltip formatter={(v) => [`${v}%`, 'Avancement']} />
                        <Bar dataKey="pct" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </div>

              {/* Répartition tâches donut */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><ClipboardList size={14} className="text-violet-500" /> Répartition tâches équipe</h3>
                {data.charts.repartitionTaches.every((r) => r.count === 0)
                  ? <p className="text-slate-400 text-sm text-center py-6">Aucune tâche</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={data.charts.repartitionTaches.filter((r) => r.count > 0).map((r) => ({ ...r, label: STATUS_LABELS[r.status] ?? r.status }))}
                          dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                          {data.charts.repartitionTaches.filter((r) => r.count > 0).map((r) => (
                            <Cell key={r.status} fill={STATUS_COLORS[r.status] ?? '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v, n]} />
                        <Legend iconSize={9} wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
              </div>

              {/* Productivité équipe stacked bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp size={14} className="text-emerald-500" /> Productivité équipe</h3>
                {data.charts.productiviteEquipe.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-6">Aucune donnée</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data.charts.productiviteEquipe.map((e) => ({ ...e, n: e.name.split(' ')[0] }))} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="n" tick={{ fontSize: 10 }} width={60} />
                        <Tooltip />
                        <Legend iconSize={9} wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="done" name="Terminées" stackId="a" fill="#10b981" />
                        <Bar dataKey="inProgress" name="En cours" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="todo" name="À faire" stackId="a" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </div>
            </div>

            {/* Widgets row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Projets avancement */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FolderKanban size={16} className="text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-700">Mes projets</h3>
                </div>
                {data.widgets.projetsAvancement.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucun projet géré.</p>
                  : (
                    <div className="space-y-3">
                      {data.widgets.projetsAvancement.map((p) => (
                        <div key={p.id} className="border border-slate-100 rounded-xl p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                            <p className="text-sm font-medium text-slate-700 flex-1 truncate">{p.name}</p>
                            <span className="text-sm font-bold text-slate-600 shrink-0">{p.pct}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all" style={{ width: `${p.pct}%`, backgroundColor: p.color }} />
                          </div>
                          <p className="text-xs text-slate-400 mt-1">{p.done}/{p.total} tâches terminées</p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Kanban + Charge équipe */}
              <div className="space-y-5">
                {/* Kanban résumé */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <ClipboardList size={16} className="text-slate-600" />
                    <h3 className="text-sm font-semibold text-slate-700">Résumé Kanban</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { key: 'TODO', label: 'À faire', color: 'bg-slate-100 text-slate-600' },
                      { key: 'IN_PROGRESS', label: 'En cours', color: 'bg-blue-100 text-blue-700' },
                      { key: 'REVIEW', label: 'Révision', color: 'bg-amber-100 text-amber-700' },
                      { key: 'DONE', label: 'Terminé', color: 'bg-emerald-100 text-emerald-700' },
                    ].map(({ key, label, color }) => (
                      <div key={key} className={`rounded-xl p-3 text-center ${color}`}>
                        <p className="text-xl font-bold">{data.widgets.kanbanResume[key] ?? 0}</p>
                        <p className="text-xs mt-0.5 font-medium">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Charge équipe */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Users size={16} className="text-violet-600" />
                    <h3 className="text-sm font-semibold text-slate-700">Charge de l'équipe</h3>
                  </div>
                  {data.widgets.chargeEquipe.length === 0
                    ? <p className="text-slate-400 text-sm italic">Aucune tâche active.</p>
                    : (
                      <div className="space-y-2">
                        {data.widgets.chargeEquipe.map((m, i) => {
                          const max = Math.max(...data.widgets.chargeEquipe.map((x) => x.count), 1);
                          return (
                            <div key={i} className="flex items-center gap-3">
                              <p className="text-xs text-slate-600 w-24 truncate shrink-0">{m.name}</p>
                              <div className="flex-1 bg-slate-100 rounded-full h-2">
                                <div className="h-2 rounded-full bg-violet-400" style={{ width: `${(m.count / max) * 100}%` }} />
                              </div>
                              <span className="text-xs font-bold text-slate-600 w-6 text-right shrink-0">{m.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </div>
              </div>
            </div>

            {/* Deadlines + Employés en congé */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-red-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Deadlines proches (7j)</h3>
                </div>
                {data.widgets.deadlinesProches.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucune deadline cette semaine.</p>
                  : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                            <th className="text-left py-2 font-medium">Tâche</th>
                            <th className="text-left py-2 px-3 font-medium">Assigné</th>
                            <th className="text-left py-2 px-2 font-medium">Priorité</th>
                            <th className="text-right py-2 font-medium">Échéance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.widgets.deadlinesProches.map((t) => {
                            const days = daysUntil(t.dueDate);
                            return (
                              <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                <td className="py-2.5"><p className="font-medium text-slate-700 truncate max-w-[150px]">{t.title}</p></td>
                                <td className="py-2.5 px-3 text-slate-500 text-xs">{t.assignee?.fullName ?? '—'}</td>
                                <td className="py-2.5 px-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_CHIP[t.priority] ?? ''}`}>{t.priority}</span></td>
                                <td className="py-2.5 text-right">
                                  <p className="text-xs font-medium text-slate-600">{fmtDate(t.dueDate)}</p>
                                  <p className={`text-xs ${days === 0 ? 'text-red-600 font-bold' : days === 1 ? 'text-amber-600' : 'text-slate-400'}`}>
                                    {days === 0 ? "Aujourd'hui" : days === 1 ? 'Demain' : `dans ${days}j`}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarRange size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Membres en congé actuellement</h3>
                </div>
                {data.widgets.employesEnConge.length === 0
                  ? <p className="text-slate-400 text-sm italic text-center py-4"><CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-1" />Toute l'équipe est disponible !</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.employesEnConge.map((e, i) => (
                        <div key={i} className="py-2.5 border-b border-slate-100 last:border-0 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs shrink-0">
                            {e.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700">{e.fullName}</p>
                            <p className="text-xs text-slate-400">{LEAVE_TYPE_LABELS[e.type] ?? e.type} · jusqu'au {fmtDate(e.endDate)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          </>
        )}

        {/* Wellness */}
        {data && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2" />
            <WellnessWidget />
          </div>
        )}
      </div>

      {showAssign && (
        <QuickAssignModal onClose={() => setShowAssign(false)} onSuccess={() => { setShowAssign(false); qc.invalidateQueries({ queryKey: ['dashboard-manager'] }); }} />
      )}
    </div>
  );
}

// ─── EMPLOYEE HOME ────────────────────────────────────────────────────────────

const ASSIGNEE_STATUS_CONFIG = {
  NOT_STARTED: { label: 'Non commencé', icon: '⭕', cls: 'bg-slate-100 text-slate-600' },
  IN_PROGRESS: { label: 'En cours', icon: '🔄', cls: 'bg-blue-100 text-blue-700' },
  COMPLETED:   { label: 'Terminé',    icon: '✅', cls: 'bg-emerald-100 text-emerald-700' },
} as const;

function NoteEditor({ taskId, notes, onSave }: { taskId: string; notes: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes);
  if (!editing) {
    return (
      <div className="mt-2 text-xs text-slate-500 italic cursor-pointer hover:text-blue-600 transition"
        onClick={() => { setValue(notes); setEditing(true); }}>
        {notes ? `📝 ${notes.slice(0, 80)}${notes.length > 80 ? '…' : ''}` : "+ Ajouter une note d'avancement"}
      </div>
    );
  }
  return (
    <div className="mt-2 flex gap-2">
      <textarea autoFocus className="flex-1 text-xs border border-blue-300 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        rows={2} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Décrivez votre avancement…" />
      <div className="flex flex-col gap-1">
        <button className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 transition"
          onClick={() => { onSave(value); setEditing(false); }}>OK</button>
        <button className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg border border-slate-200"
          onClick={() => setEditing(false)}>✕</button>
      </div>
    </div>
  );
}

function EmployeeHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<EmployeeDashData>({
    queryKey: ['dashboard-employee'],
    queryFn: () => api.get('/api/dashboard/employee').then((r) => r.data),
    staleTime: 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ taskId, assigneeStatus }: { taskId: string; assigneeStatus: string }) => api.put(`/api/tasks/${taskId}`, { assigneeStatus }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dashboard-employee'] }); toast.success('Statut mis à jour'); },
    onError: () => toast.error('Erreur'),
  });

  const updateNotes = useMutation({
    mutationFn: ({ taskId, assigneeNotes }: { taskId: string; assigneeNotes: string }) => api.put(`/api/tasks/${taskId}`, { assigneeNotes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard-employee'] }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard-employee'] }),
  });

  const QUICK_ACTIONS = [
    { label: 'Mes tâches', icon: <ClipboardList size={16} />, to: '/tasks', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { label: 'Documents', icon: <FileText size={16} />, to: '/documents', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { label: 'Congés', icon: <Calendar size={16} />, to: '/hr', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
    { label: 'Calendrier', icon: <CalendarRange size={16} />, to: '/calendar', color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
  ];

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <PageHeader title="Ma journée" subtitle={`Bonjour, ${user?.fullName} — ${today}`} />

      <div className="flex-1 p-6 space-y-6">
        {/* Quick actions */}
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.map((a) => (
            <button key={a.to} onClick={() => navigate(a.to)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition ${a.color}`}>
              {a.icon} {a.label} <ArrowRight size={14} />
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
        ) : data && (
          <>
            {/* 4 KPIs */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <KPICard label="Tâches du jour" value={data.kpis.tachesAujourdhui} icon={<ClipboardList size={20} />} color="bg-blue-500" />
              <KPICard label="Tâches en retard" value={data.kpis.tachesEnRetard} icon={<AlertTriangle size={20} />} color={data.kpis.tachesEnRetard > 0 ? 'bg-red-500' : 'bg-slate-400'} />
              <KPICard label="Solde congés" value={`${data.kpis.soldeCongés.total - data.kpis.soldeCongés.used}j`} icon={<Calendar size={20} />} color="bg-emerald-500" sub={`${data.kpis.soldeCongés.used} utilisés / ${data.kpis.soldeCongés.total}`} />
              <KPICard label="Réunions aujourd'hui" value={data.kpis.reunionsAujourdhui} icon={<CalendarRange size={20} />} color="bg-violet-500" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Tâches ce mois */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp size={14} className="text-blue-500" /> Tâches terminées ce mois</h3>
                {data.charts.tachesCeMois.every((d) => d.count === 0)
                  ? <p className="text-slate-400 text-sm text-center py-6">Aucune tâche terminée ce mois</p>
                  : (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={data.charts.tachesCeMois.map((d) => ({ ...d, label: d.day.slice(8) }))}>
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip formatter={(v) => [v, 'Terminées']} labelFormatter={(l) => `Jour ${l}`} />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </div>

              {/* Tâches par projet */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><FolderKanban size={14} className="text-violet-500" /> Tâches par projet</h3>
                {data.charts.tachesParProjet.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-6">Aucune tâche</p>
                  : (
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={data.charts.tachesParProjet} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                          {data.charts.tachesParProjet.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v, n]} />
                        <Legend iconSize={9} wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
              </div>
            </div>

            {/* Prochaines tâches */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList size={16} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-700">Mes tâches en cours</h3>
                <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{data.widgets.prochainesTaches.length}</span>
              </div>
              {data.widgets.prochainesTaches.length === 0
                ? (
                  <div className="text-center py-6">
                    <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-600">Toutes vos tâches sont terminées !</p>
                  </div>
                )
                : (
                  <div className="space-y-3">
                    {data.widgets.prochainesTaches.map((task) => {
                      const statusCfg = ASSIGNEE_STATUS_CONFIG[task.assigneeStatus as keyof typeof ASSIGNEE_STATUS_CONFIG] ?? ASSIGNEE_STATUS_CONFIG.NOT_STARTED;
                      return (
                        <div key={task.id} className="border border-slate-100 rounded-xl p-4 hover:border-blue-200 transition">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {task.project ? task.project.name : 'Tâche autonome'} · {task.createdBy.fullName}
                                {task.dueDate && ` · Échéance: ${new Date(task.dueDate).toLocaleDateString('fr-FR')}`}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusCfg.cls}`}>{statusCfg.icon} {statusCfg.label}</span>
                            <select
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                              value={task.assigneeStatus ?? 'NOT_STARTED'} disabled={updateStatus.isPending}
                              onChange={(e) => updateStatus.mutate({ taskId: task.id, assigneeStatus: e.target.value })}>
                              <option value="NOT_STARTED">⭕ Non commencé</option>
                              <option value="IN_PROGRESS">🔄 En cours</option>
                              <option value="COMPLETED">✅ Terminé</option>
                            </select>
                          </div>
                          <NoteEditor taskId={task.id} notes={task.assigneeNotes ?? ''}
                            onSave={(notes) => updateNotes.mutate({ taskId: task.id, assigneeNotes: notes })} />
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>

            {/* Bottom widgets */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Notifications */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Bell size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Notifications non lues</h3>
                  {data.widgets.notifications.length > 0 && (
                    <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{data.widgets.notifications.length}</span>
                  )}
                </div>
                {data.widgets.notifications.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucune notification non lue.</p>
                  : (
                    <div className="space-y-2">
                      {data.widgets.notifications.map((n) => (
                        <div key={n.id} className="border border-slate-100 rounded-xl p-3 cursor-pointer hover:border-blue-200 transition"
                          onClick={() => markRead.mutate(n.id)}>
                          <p className="text-xs font-semibold text-slate-700">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>
                          <p className="text-xs text-slate-400 mt-1">{fmtRelative(n.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Réunions à venir */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarRange size={16} className="text-violet-600" />
                  <h3 className="text-sm font-semibold text-slate-700">Réunions à venir</h3>
                </div>
                {data.widgets.reunionsAVenir.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucune réunion prévue.</p>
                  : (
                    <div className="space-y-2">
                      {data.widgets.reunionsAVenir.map((m) => (
                        <div key={m.id} className="border border-slate-100 rounded-xl p-3">
                          <p className="text-sm font-medium text-slate-700">{m.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{fmtDate(m.startAt)} · {fmtTime(m.startAt)} – {fmtTime(m.endAt)}</p>
                          {m.location && <p className="text-xs text-slate-500 mt-0.5">📍 {m.location}</p>}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Docs récents */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FileText size={16} className="text-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Documents récents</h3>
                </div>
                {data.widgets.docsRecents.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucun document.</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.docsRecents.map((d) => (
                        <div key={d.id} className="py-2.5 border-b border-slate-100 last:border-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{d.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{d.by} · {d.category ?? 'N/A'} · {fmtRelative(d.at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Congés demandés */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Mes demandes de congé</h3>
                </div>
                {data.widgets.congesDemandes.length === 0
                  ? <p className="text-slate-400 text-sm italic">Aucune demande.</p>
                  : (
                    <div className="space-y-0">
                      {data.widgets.congesDemandes.map((l) => (
                        <div key={l.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700">{LEAVE_TYPE_LABELS[l.type] ?? l.type}</p>
                            <p className="text-xs text-slate-400">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${LEAVE_STATUS_CHIP[l.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {l.status === 'EN_ATTENTE' ? 'En attente' : l.status === 'APPROUVE' ? 'Approuvé' : 'Refusé'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Quick assign modal ───────────────────────────────────────────────────────

function QuickAssignModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', assigneeId: '', dueDate: '' });
  const [loading, setLoading] = useState(false);

  const { data: assignableUsers = [] } = useQuery<{ id: string; fullName: string; role: string }[]>({
    queryKey: ['assignable-users'],
    queryFn: () => api.get('/api/users/assignable').then((r) => r.data),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.assigneeId) { toast.error('Veuillez choisir un destinataire'); return; }
    setLoading(true);
    try {
      await api.post('/api/tasks', {
        title: form.title, description: form.description || null, priority: form.priority,
        assigneeId: form.assigneeId, projectId: null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      });
      toast.success('Tâche assignée !');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Erreur');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800">Assigner une tâche</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Destinataire *</label>
            <select className="input" value={form.assigneeId} required onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">— Choisir une personne —</option>
              {assignableUsers.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Titre *</label>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Préparer le rapport mensuel" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Instructions, détails…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Priorité</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="LOW">Basse</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Échéance</label>
              <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition">Annuler</button>
            <button type="submit" disabled={loading} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition">
              {loading && <Loader2 size={14} className="animate-spin" />} Assigner
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Insights IA ──────────────────────────────────────────────────────────────

function InsightsPanel({ data, isLoading }: { data: InsightsData | undefined; isLoading: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700">Insights & Anomalies</h3>
      </div>
      {isLoading
        ? <div className="flex justify-center py-6"><Loader2 className="animate-spin text-blue-400" size={22} /></div>
        : !data ? null
          : (
            <div className="space-y-2">
              {data.insights.map((ins, i) => {
                const s = INSIGHT_STYLES[ins.type];
                return (
                  <div key={i} className={`flex gap-3 p-3 rounded-lg border ${s.cls}`}>
                    <div className="shrink-0 mt-0.5">{s.icon}</div>
                    <div>
                      <p className="text-sm font-semibold">{ins.title}</p>
                      <p className="text-xs mt-0.5 opacity-80">{ins.description}</p>
                    </div>
                  </div>
                );
              })}
              {data.aiSummary && (
                <div className="mt-4 p-4 bg-gradient-to-br from-blue-50 to-violet-50 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={14} className="text-blue-500" />
                    <p className="text-xs font-semibold text-blue-700">Recommandations IA</p>
                  </div>
                  <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{data.aiSummary}</div>
                </div>
              )}
            </div>
          )}
    </div>
  );
}

function AIGeneratorPanel() {
  const [type, setType] = useState('task_description');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [customPrompt, setCustomPrompt] = useState('');
  const [result, setResult] = useState('');
  const [showResult, setShowResult] = useState(false);

  const CONTEXT_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
    task_description: [
      { key: 'title', label: 'Titre', placeholder: 'Ex: Migrer la base de données' },
      { key: 'project', label: 'Projet', placeholder: 'Ex: Refonte SI' },
      { key: 'priority', label: 'Priorité', placeholder: 'HIGH / MEDIUM / LOW' },
    ],
    job_posting: [
      { key: 'position', label: 'Poste', placeholder: 'Ex: Développeur Full Stack' },
      { key: 'department', label: 'Département', placeholder: 'Ex: Informatique' },
      { key: 'contractType', label: 'Contrat', placeholder: 'CDI / CDD / STAGE' },
    ],
    leave_response: [
      { key: 'employeeName', label: 'Nom employé', placeholder: 'Ex: Asmae Salhi' },
      { key: 'leaveType', label: 'Type de congé', placeholder: 'Ex: Congé payé' },
      { key: 'startDate', label: 'Début', placeholder: 'Ex: 01/07/2026' },
      { key: 'endDate', label: 'Fin', placeholder: 'Ex: 15/07/2026' },
      { key: 'decision', label: 'Décision', placeholder: 'approuvé / refusé' },
    ],
    project_summary: [
      { key: 'name', label: 'Projet', placeholder: 'Ex: ERP v2' },
      { key: 'doneTasks', label: 'Terminées', placeholder: 'Ex: 12' },
      { key: 'totalTasks', label: 'Total', placeholder: 'Ex: 20' },
      { key: 'memberCount', label: "Membres", placeholder: 'Ex: 5' },
    ],
    report: [
      { key: 'period', label: 'Période', placeholder: 'Ex: Mai 2026' },
      { key: 'documents', label: 'Documents', placeholder: 'Ex: 34' },
      { key: 'tasksCompleted', label: 'Tâches terminées', placeholder: 'Ex: 18' },
      { key: 'leavesApproved', label: 'Congés approuvés', placeholder: 'Ex: 4' },
    ],
    custom: [],
  };

  const generateMut = useMutation({
    mutationFn: () => apiAI.post('/api/ai/generate', { type, context: fields, customPrompt: type === 'custom' ? customPrompt : undefined }),
    onSuccess: (res) => { setResult(res.data.content); setShowResult(true); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Service IA indisponible'),
  });

  const currentFields = CONTEXT_FIELDS[type] ?? [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Wand2 size={16} className="text-violet-500" />
        <h3 className="text-sm font-semibold text-slate-700">Générateur de contenu IA</h3>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Type de document</label>
          <select className="input text-sm" value={type} onChange={(e) => { setType(e.target.value); setFields({}); setResult(''); setShowResult(false); }}>
            {GENERATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {currentFields.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {currentFields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
                <input className="input text-sm" placeholder={f.placeholder} value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
        )}
        {type === 'custom' && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Votre instruction</label>
            <textarea className="input resize-none text-sm" rows={3} placeholder="Ex: Rédige un email de bienvenue…" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} />
          </div>
        )}
        <button onClick={() => generateMut.mutate()} disabled={generateMut.isPending}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60 transition">
          {generateMut.isPending ? <><Loader2 size={14} className="animate-spin" /> Génération en cours…</> : <><Wand2 size={14} /> Générer avec l'IA</>}
        </button>
      </div>
      {showResult && result && (
        <div className="mt-4 relative">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronRight size={12} /> Résultat</p>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(result); toast.success('Copié !'); }} className="text-xs text-blue-600 hover:underline">Copier</button>
              <button onClick={() => setShowResult(false)}><X size={14} className="text-slate-400" /></button>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-xs text-slate-700 leading-relaxed max-h-64 overflow-y-auto prose prose-sm max-w-none">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export — role router ────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'ADMIN') return <AdminHome />;
  if (user.role === 'RH') return <RHHome />;
  if (user.role === 'MANAGER') return <ManagerHome />;
  return <EmployeeHome />;
}
