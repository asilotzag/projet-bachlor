import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Users, UserPlus, CheckCircle, XCircle, Clock, Loader2, X, ChevronDown,
  ChevronRight, Briefcase, BarChart2, AlertTriangle, FolderOpen, Plus,
  MessageSquare,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskStats { total: number; done: number; inProgress: number; todo: number; overdue: number }
interface TeamMember {
  employeeId: string;
  userId: string;
  position: string;
  department: { id: number; name: string } | null;
  user: { id: string; fullName: string; email: string; role: { name: string }; isActive: boolean };
  taskStats: TaskStats;
  recentTasks: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null; project: { id: string; name: string } | null }>;
  projects: Array<{ id: string; name: string; status: string }>;
}

interface SupervisionRequest {
  id: string;
  requesterId: string;
  employeeId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string | null;
  reviewNote: string | null;
  createdAt: string;
  requester: { id: string; fullName: string; email: string; role: { name: string } };
  employee: { id: string; fullName: string; email: string; role: { name: string }; employee: { position: string; department: { name: string } | null } | null };
  reviewedBy: { id: string; fullName: string } | null;
}

interface UserRow { id: string; fullName: string; email: string; role: string; position: string | null; department: string | null }

const STATUS_CONFIG = {
  PENDING:  { label: 'En attente', icon: Clock,        cls: 'bg-amber-50  text-amber-700  border-amber-200'  },
  APPROVED: { label: 'Approuvée', icon: CheckCircle,   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Refusée',   icon: XCircle,       cls: 'bg-red-50    text-red-700    border-red-200'    },
} as const;

const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   'text-red-600 bg-red-50',
  MEDIUM: 'text-amber-600 bg-amber-50',
  LOW:    'text-slate-500 bg-slate-100',
  URGENT: 'text-red-700 bg-red-100',
};

const STATUS_LABELS: Record<string, string> = {
  TODO: 'À faire', IN_PROGRESS: 'En cours', DONE: 'Terminé', REVIEW: 'En revue',
};

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ');
  const txt = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 font-bold text-sm flex items-center justify-center shrink-0">
      {txt.toUpperCase()}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function TeamPage() {
  const { user } = useAuth();
  const role = user?.role as string;
  const isAdminRH = role === 'ADMIN' || role === 'RH';
  const isManager = role === 'MANAGER';

  const [tab, setTab] = useState<'team' | 'requests'>(isManager ? 'team' : 'requests');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [reviewModal, setReviewModal] = useState<{ request: SupervisionRequest; action: 'approve' | 'reject' } | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Users size={20} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {isManager ? 'Mon équipe' : 'Gestion des équipes'}
            </h1>
            <p className="text-sm text-slate-400">
              {isManager
                ? 'Vos employés supervisés et vos demandes d\'affectation'
                : 'Supervision, demandes et affectations des équipes'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <button
              onClick={() => setShowRequestModal(true)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              <UserPlus size={16} /> Demander une affectation
            </button>
          )}
          {isAdminRH && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              <UserPlus size={16} /> Affecter directement
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {isManager && (
          <TabBtn active={tab === 'team'} onClick={() => setTab('team')}>
            <Users size={15} /> Mon équipe
          </TabBtn>
        )}
        {isAdminRH && (
          <TabBtn active={tab === 'team'} onClick={() => setTab('team')}>
            <Users size={15} /> Équipes
          </TabBtn>
        )}
        <TabBtn active={tab === 'requests'} onClick={() => setTab('requests')}>
          <Clock size={15} /> {isAdminRH ? 'Demandes en attente' : 'Mes demandes'}
        </TabBtn>
      </div>

      {/* Content */}
      {tab === 'team' && (
        <TeamTab
          managerId={user?.id ?? ''}
          expandedMember={expandedMember}
          onToggle={(id) => setExpandedMember(expandedMember === id ? null : id)}
          isAdminRH={isAdminRH}
        />
      )}
      {tab === 'requests' && (
        <RequestsTab
          isAdminRH={isAdminRH}
          onReview={(req, action) => setReviewModal({ request: req, action })}
        />
      )}

      {/* Modals */}
      {showRequestModal && (
        <NewRequestModal onClose={() => setShowRequestModal(false)} />
      )}
      {showAssignModal && (
        <DirectAssignModal onClose={() => setShowAssignModal(false)} />
      )}
      {reviewModal && (
        <ReviewModal
          request={reviewModal.request}
          action={reviewModal.action}
          onClose={() => setReviewModal(null)}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
        active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Onglet Mon équipe ────────────────────────────────────────────────────────

function TeamTab({
  managerId, expandedMember, onToggle, isAdminRH,
}: {
  managerId: string;
  expandedMember: string | null;
  onToggle: (id: string) => void;
  isAdminRH: boolean;
}) {
  const qc = useQueryClient();
  const [selectedManagerId, setSelectedManagerId] = useState(isAdminRH ? '' : managerId);

  const { data: managers = [] } = useQuery<Array<{ id: string; fullName: string }>>({
    queryKey: ['managers-list'],
    queryFn: () => api.get('/api/hr/orgchart').then((r) =>
      (r.data as Array<{ id: string; name: string; role: string }>)
        .filter((u) => u.role === 'MANAGER')
        .map((u) => ({ id: u.id, fullName: u.name }))
    ),
    enabled: isAdminRH,
    staleTime: 120_000,
  });

  const targetId = isAdminRH ? selectedManagerId : managerId;

  const { data: team = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['my-team', targetId],
    queryFn: () => api.get(`/api/supervision/my-team?managerId=${targetId}`).then((r) => r.data),
    staleTime: 60_000,
    enabled: !!targetId,
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/supervision/remove/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-team'] });
      toast.success('Employé retiré de l\'équipe');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  if (isAdminRH && !selectedManagerId) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <p className="text-sm font-medium text-slate-700 mb-3">Sélectionnez un manager pour voir son équipe :</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {managers.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedManagerId(m.id)}
                className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-xl transition text-left"
              >
                <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 font-bold text-sm flex items-center justify-center shrink-0">
                  {m.fullName.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-slate-700 truncate">{m.fullName}</span>
              </button>
            ))}
            {managers.length === 0 && <p className="text-sm text-slate-400 italic col-span-3">Aucun manager trouvé.</p>}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) return <LoadingSpinner />;

  if (team.length === 0) {
    return (
      <div className="space-y-4">
        {isAdminRH && (
          <button onClick={() => setSelectedManagerId('')} className="text-xs text-violet-600 hover:underline flex items-center gap-1">
            ← Changer de manager
          </button>
        )}
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Users size={48} className="text-slate-200" />
          <p className="text-base font-medium text-slate-500">Aucun membre dans cette équipe</p>
          <p className="text-sm">{isAdminRH ? 'Utilisez "Affecter directement" pour ajouter des employés.' : 'Faites une demande d\'affectation pour ajouter des employés.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isAdminRH && (
        <button onClick={() => setSelectedManagerId('')} className="text-xs text-violet-600 hover:underline flex items-center gap-1 mb-1">
          ← Changer de manager
        </button>
      )}
      <div className="flex items-center justify-between text-sm text-slate-500 mb-2">
        <span>{team.length} membre{team.length !== 1 ? 's' : ''} supervisé{team.length !== 1 ? 's' : ''}</span>
      </div>
      {team.map((member) => (
        <MemberCard
          key={member.userId}
          member={member}
          expanded={expandedMember === member.userId}
          onToggle={() => onToggle(member.userId)}
          canRemove={isAdminRH}
          onRemove={() => {
            if (confirm(`Retirer ${member.user.fullName} de cette équipe ?`)) {
              removeMut.mutate(member.userId);
            }
          }}
        />
      ))}
    </div>
  );
}

function MemberCard({
  member, expanded, onToggle, canRemove, onRemove,
}: {
  member: TeamMember;
  expanded: boolean;
  onToggle: () => void;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const navigate = useNavigate();
  const { total, done, inProgress, todo, overdue } = member.taskStats;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-4 p-5 cursor-pointer hover:bg-slate-50 transition" onClick={onToggle}>
        <Initials name={member.user.fullName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800">{member.user.fullName}</p>
            {!member.user.isActive && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inactif</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {member.position}
            {member.department && <> · {member.department.name}</>}
          </p>
        </div>

        {/* Task stats mini */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 shrink-0">
          <StatPill label="Total" value={total} color="text-slate-600" />
          <StatPill label="Fait" value={done} color="text-emerald-600" />
          <StatPill label="En cours" value={inProgress} color="text-blue-600" />
          {overdue > 0 && <StatPill label="Retard" value={overdue} color="text-red-600" />}
        </div>

        {/* Progress bar */}
        <div className="w-20 shrink-0">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">Avancement</span>
            <span className="font-medium text-slate-600">{pct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 75 ? 'bg-emerald-500' : pct >= 40 ? 'bg-blue-500' : 'bg-amber-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
              title="Retirer de l'équipe"
            >
              <X size={14} />
            </button>
          )}
          {expanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 p-5 space-y-5 bg-slate-50/50">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Tâches totales" value={total} icon={<BarChart2 size={16} className="text-slate-500" />} color="bg-white" />
            <StatCard label="Terminées" value={done} icon={<CheckCircle size={16} className="text-emerald-500" />} color="bg-emerald-50" valueColor="text-emerald-600" />
            <StatCard label="En cours" value={inProgress} icon={<Clock size={16} className="text-blue-500" />} color="bg-blue-50" valueColor="text-blue-600" />
            <StatCard label="En retard" value={overdue} icon={<AlertTriangle size={16} className="text-red-500" />} color="bg-red-50" valueColor="text-red-600" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Recent tasks */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Briefcase size={13} /> Tâches récentes
              </h4>
              {member.recentTasks.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Aucune tâche assignée</p>
              ) : (
                <div className="space-y-2">
                  {member.recentTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-2 bg-white rounded-lg p-2.5 border border-slate-100">
                      <span className={`mt-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0 ${PRIORITY_COLORS[task.priority] ?? 'text-slate-500 bg-slate-100'}`}>
                        {task.priority}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{task.title}</p>
                        <p className="text-xs text-slate-400">
                          {STATUS_LABELS[task.status] ?? task.status}
                          {task.project && <> · {task.project.name}</>}
                        </p>
                      </div>
                      {task.dueDate && (
                        <span className={`text-xs shrink-0 ${new Date(task.dueDate) < new Date() && task.status !== 'DONE' ? 'text-red-500' : 'text-slate-400'}`}>
                          {new Date(task.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projects */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <FolderOpen size={13} /> Projets
              </h4>
              {member.projects.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Aucun projet</p>
              ) : (
                <div className="space-y-2">
                  {member.projects.map((proj) => (
                    <div key={proj.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-slate-100">
                      <p className="text-xs font-medium text-slate-700 truncate">{proj.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${
                        proj.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
                        proj.status === 'COMPLETED' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {proj.status === 'ACTIVE' ? 'Actif' : proj.status === 'COMPLETED' ? 'Terminé' : proj.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick actions */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => navigate(`/users/${member.userId}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-violet-600 hover:bg-violet-50 rounded-lg border border-violet-200 transition"
                >
                  <MessageSquare size={12} /> Voir profil
                </button>
                <button
                  onClick={() => navigate(`/tasks?assignee=${member.userId}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
                >
                  <Briefcase size={12} /> Voir tâches
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className={`font-bold text-base ${color}`}>{value}</p>
      <p className="text-slate-400 text-xs">{label}</p>
    </div>
  );
}

function StatCard({ label, value, icon, color = 'bg-white', valueColor = 'text-slate-800' }: {
  label: string; value: number; icon: React.ReactNode; color?: string; valueColor?: string;
}) {
  return (
    <div className={`${color} rounded-xl p-3 border border-slate-100 flex items-center gap-3`}>
      {icon}
      <div>
        <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// ─── Onglet Demandes ──────────────────────────────────────────────────────────

function RequestsTab({ isAdminRH, onReview }: {
  isAdminRH: boolean;
  onReview: (req: SupervisionRequest, action: 'approve' | 'reject') => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');

  const { data: requests = [], isLoading } = useQuery<SupervisionRequest[]>({
    queryKey: ['supervision-requests'],
    queryFn: () => api.get('/api/supervision/requests').then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const filtered = statusFilter ? requests.filter((r) => r.status === statusFilter) : requests;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2">
        {(['', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
              statusFilter === s
                ? 'bg-violet-600 text-white border-violet-600'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {s === '' ? 'Toutes' : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label ?? s}
            {s === 'PENDING' && requests.filter((r) => r.status === 'PENDING').length > 0 && (
              <span className="ml-1.5 bg-amber-400 text-white rounded-full px-1.5 py-0.5 text-xs">
                {requests.filter((r) => r.status === 'PENDING').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <CheckCircle size={40} className="text-slate-200" />
          <p className="text-sm">Aucune demande{statusFilter ? ' dans ce statut' : ''}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              isAdminRH={isAdminRH}
              onApprove={() => onReview(req, 'approve')}
              onReject={() => onReview(req, 'reject')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ request, isAdminRH, onApprove, onReject }: {
  request: SupervisionRequest;
  isAdminRH: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const cfg = STATUS_CONFIG[request.status];
  const StatusIcon = cfg.icon;
  const empDept = request.employee.employee?.department?.name;
  const empPos = request.employee.employee?.position;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start gap-4">
        {/* Status indicator */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${cfg.cls}`}>
          <StatusIcon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.cls}`}>
              <StatusIcon size={10} /> {cfg.label}
            </span>
            <span className="text-xs text-slate-400">
              {new Date(request.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          {/* Main info */}
          <div className="flex items-center gap-2 flex-wrap">
            {isAdminRH && (
              <>
                <span className="text-sm font-semibold text-violet-700">{request.requester.fullName}</span>
                <span className="text-slate-400 text-sm">→</span>
              </>
            )}
            <div className="flex items-center gap-2">
              <Initials name={request.employee.fullName} />
              <div>
                <p className="text-sm font-semibold text-slate-800">{request.employee.fullName}</p>
                <p className="text-xs text-slate-400">
                  {empPos ?? '—'}
                  {empDept && <> · {empDept}</>}
                </p>
              </div>
            </div>
          </div>

          {/* Note */}
          {request.note && (
            <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
              <span className="font-medium text-slate-500">Note : </span>{request.note}
            </div>
          )}

          {/* Review note */}
          {request.reviewNote && (
            <div className={`mt-2 text-xs rounded-lg px-3 py-2 border ${request.status === 'APPROVED' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
              <span className="font-medium">Réponse de {request.reviewedBy?.fullName ?? 'RH'} : </span>
              {request.reviewNote}
            </div>
          )}
        </div>

        {/* Actions (Admin/RH on pending only) */}
        {isAdminRH && request.status === 'PENDING' && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onApprove}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
            >
              <CheckCircle size={13} /> Approuver
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <XCircle size={13} /> Refuser
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal Nouvelle demande (Manager) ─────────────────────────────────────────

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [note, setNote] = useState('');
  const { user } = useAuth();

  // Fetch employees eligible for supervision (not already in this manager's team)
  const { data: employees = [], isLoading } = useQuery<Array<{
    id: string; userId: string; position: string; managerId: string | null;
    user: { id: string; fullName: string; email: string };
    department: { id: number; name: string } | null;
  }>>({
    queryKey: ['supervision-available-employees'],
    queryFn: () => api.get('/api/supervision/available-employees').then((r) => r.data),
    staleTime: 60_000,
  });

  const eligible = employees.filter((e) => e.user.id !== user?.id);

  const createMut = useMutation({
    mutationFn: (data: { employeeId: string; note?: string }) =>
      api.post('/api/supervision/requests', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervision-requests'] });
      toast.success('Demande envoyée — en attente d\'approbation');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur lors de l\'envoi'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) { toast.error('Sélectionnez un employé'); return; }
    createMut.mutate({ employeeId: employees.find((e) => e.id === employeeId)?.user.id ?? employeeId, note: note || undefined });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-800">Demande de supervision</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Employé à superviser <span className="text-red-500">*</span>
            </label>
            {isLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin text-slate-400" size={20} /></div>
            ) : (
              <select
                className="input"
                value={employeeId}
                required
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">— Sélectionner un employé —</option>
                {eligible.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.user.fullName} {emp.department ? `· ${emp.department.name}` : ''} {emp.managerId ? '(déjà supervisé)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Justification (optionnel)
            </label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Expliquez pourquoi cet employé devrait rejoindre votre équipe…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            Cette demande sera transmise à l'Administration / RH pour approbation avant toute affectation.
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition">
              Annuler
            </button>
            <button
              type="submit" disabled={createMut.isPending || !employeeId}
              className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {createMut.isPending ? 'Envoi…' : 'Envoyer la demande'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Révision (Admin/RH) ────────────────────────────────────────────────

function ReviewModal({ request, action, onClose }: {
  request: SupervisionRequest;
  action: 'approve' | 'reject';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reviewNote, setReviewNote] = useState('');
  const isApprove = action === 'approve';

  const reviewMut = useMutation({
    mutationFn: () =>
      api.put(`/api/supervision/requests/${request.id}/${isApprove ? 'approve' : 'reject'}`, { reviewNote: reviewNote || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervision-requests'] });
      qc.invalidateQueries({ queryKey: ['my-team'] });
      qc.invalidateQueries({ queryKey: ['supervision-pending-count'] });
      toast.success(isApprove ? 'Demande approuvée' : 'Demande refusée');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isApprove ? 'bg-emerald-50' : 'bg-red-50'}`}>
            {isApprove
              ? <CheckCircle size={20} className="text-emerald-600" />
              : <XCircle size={20} className="text-red-600" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isApprove ? 'Approuver la demande' : 'Refuser la demande'}
            </h2>
            <p className="text-xs text-slate-400">
              {request.requester.fullName} → {request.employee.fullName}
            </p>
          </div>
        </div>

        {request.note && (
          <div className="bg-slate-50 rounded-xl px-4 py-3 mb-4 text-sm text-slate-600 border border-slate-100">
            <span className="text-xs font-semibold text-slate-400 block mb-1">Note du manager :</span>
            {request.note}
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Commentaire (optionnel)
          </label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder={isApprove ? 'Commentaire d\'approbation…' : 'Raison du refus…'}
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition">
            Annuler
          </button>
          <button
            onClick={() => reviewMut.mutate()}
            disabled={reviewMut.isPending}
            className={`flex-1 flex items-center justify-center gap-2 text-white text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-60 ${
              isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {reviewMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            {isApprove ? 'Confirmer l\'approbation' : 'Confirmer le refus'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Affectation directe (Admin/RH) ─────────────────────────────────────

function DirectAssignModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [managerId, setManagerId] = useState('');
  const [employeeUserId, setEmployeeUserId] = useState('');

  const { data: orgNodes = [] } = useQuery<Array<{ id: string; name: string; role: string }>>({
    queryKey: ['orgchart'],
    queryFn: () => api.get('/api/hr/orgchart').then((r) => r.data),
    staleTime: 120_000,
  });

  const { data: allEmployees = [] } = useQuery<Array<{
    id: string; userId: string; position: string; managerId: string | null;
    user: { id: string; fullName: string };
    department: { name: string } | null;
  }>>({
    queryKey: ['hr-employees-all'],
    queryFn: () => api.get('/api/hr/employees').then((r) => r.data),
    staleTime: 60_000,
  });

  const managers = orgNodes.filter((u) => u.role === 'MANAGER');
  const availableEmployees = allEmployees.filter((e) => e.managerId !== managerId);

  const assignMut = useMutation({
    mutationFn: () => api.post('/api/supervision/assign', { managerId, employeeId: employeeUserId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-team'] });
      qc.invalidateQueries({ queryKey: ['supervision-requests'] });
      toast.success('Employé affecté avec succès');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!managerId || !employeeUserId) { toast.error('Sélectionnez un manager et un employé'); return; }
    assignMut.mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Affectation directe</h2>
            <p className="text-xs text-slate-400 mt-0.5">Affecter un employé à l'équipe d'un manager</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Manager <span className="text-red-500">*</span>
            </label>
            <select
              className="input"
              value={managerId}
              required
              onChange={(e) => { setManagerId(e.target.value); setEmployeeUserId(''); }}
            >
              <option value="">— Sélectionner un manager —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Employé à affecter <span className="text-red-500">*</span>
            </label>
            <select
              className="input"
              value={employeeUserId}
              required
              disabled={!managerId}
              onChange={(e) => setEmployeeUserId(e.target.value)}
            >
              <option value="">— Sélectionner un employé —</option>
              {availableEmployees.map((emp) => (
                <option key={emp.id} value={emp.user.id}>
                  {emp.user.fullName}{emp.department ? ` · ${emp.department.name}` : ''}{emp.managerId ? ' (déjà supervisé)' : ''}
                </option>
              ))}
            </select>
            {managerId && availableEmployees.length === 0 && (
              <p className="text-xs text-slate-400 mt-1 italic">Tous les employés sont déjà dans cette équipe.</p>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700">
            Cette affectation est immédiate et ne nécessite pas d'approbation.
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition">
              Annuler
            </button>
            <button
              type="submit"
              disabled={assignMut.isPending || !managerId || !employeeUserId}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              {assignMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {assignMut.isPending ? 'Affectation…' : 'Affecter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-violet-500" size={28} />
    </div>
  );
}
