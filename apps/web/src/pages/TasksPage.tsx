import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare, Plus, Loader2, FolderKanban, Calendar, Users, ListTodo, X, LayoutTemplate,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import KanbanBoard from '../components/tasks/KanbanBoard';
import StandaloneTasks from '../components/tasks/StandaloneTasks';
import TemplateModal from '../components/projects/TemplateModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

interface Project {
  id: string; name: string; description?: string;
  status: ProjectStatus; color: string; dueDate?: string;
  manager: { id: string; fullName: string };
  members: { user: { id: string; fullName: string } }[];
  tasks: { status: string }[];
  _count: { tasks: number };
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: 'Actif', ON_HOLD: 'En pause', COMPLETED: 'Terminé', CANCELLED: 'Annulé',
};
const STATUS_BADGE: Record<ProjectStatus, string> = {
  ACTIVE:    'bg-emerald-100 text-emerald-700',
  ON_HOLD:   'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const FILTERS: { value: 'ALL' | ProjectStatus; label: string }[] = [
  { value: 'ALL',       label: 'Tous' },
  { value: 'ACTIVE',    label: 'Actif' },
  { value: 'ON_HOLD',   label: 'En pause' },
  { value: 'COMPLETED', label: 'Terminé' },
  { value: 'CANCELLED', label: 'Annulé' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'projects' | 'standalone';

export default function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab]                 = useState<Tab>('projects');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [statusFilter, setStatusFilter]       = useState<'ALL' | ProjectStatus>('ALL');
  const [showForm, setShowForm]               = useState(false);
  const [showTemplates, setShowTemplates]     = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6', dueDate: '' });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => (await api.get('/api/projects')).data,
  });

  const createMut = useMutation({
    mutationFn: (data: typeof form) => api.post('/api/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projet créé !');
      setShowForm(false);
      setForm({ name: '', description: '', color: '#3B82F6', dueDate: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const canCreate = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const activeProject = projects.find((p) => p.id === selectedProject);

  // ── Project detail view (Kanban) ──────────────────────────────────────────
  if (selectedProject && activeProject) {
    return (
      <KanbanBoard
        project={activeProject}
        onBack={() => setSelectedProject(null)}
      />
    );
  }

  // ── Filtered projects ─────────────────────────────────────────────────────
  const filteredProjects = statusFilter === 'ALL'
    ? projects
    : projects.filter((p) => p.status === statusFilter);

  return (
    <div className="p-8 min-h-screen bg-slate-50">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CheckSquare className="text-blue-600" size={24} />
          <h1 className="text-2xl font-bold text-slate-800">Tâches & Projets</h1>
        </div>
        {canCreate && tab === 'projects' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(true)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              <LayoutTemplate size={15} /> Depuis template
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              <Plus size={15} /> Nouveau projet
            </button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 mb-6 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('projects')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'projects'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <FolderKanban size={15} /> Projets
        </button>
        <button
          onClick={() => setTab('standalone')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'standalone'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <ListTodo size={15} /> Tâches autonomes
        </button>
      </div>

      {/* ── Standalone Kanban ── */}
      {tab === 'standalone' && <StandaloneTasks />}

      {/* ── Project list ── */}
      {tab === 'projects' && (
        <>
          {/* Status filter bar */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  statusFilter === f.value
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {f.label}
                {f.value !== 'ALL' && (
                  <span className="ml-1.5 opacity-70">
                    ({projects.filter((p) => p.status === f.value).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Projects grid */}
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="animate-spin text-blue-500" size={28} />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-3">
              <FolderKanban size={40} className="text-slate-300" />
              <p className="text-sm">
                {projects.length === 0
                  ? canCreate ? 'Aucun projet. Créez le premier !' : 'Vous serez ajouté à un projet bientôt.'
                  : 'Aucun projet pour ce filtre.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onClick={() => setSelectedProject(p.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Template modal ── */}
      {showTemplates && <TemplateModal onClose={() => setShowTemplates(false)} />}

      {/* ── New project modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-800">Nouveau projet</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom du projet *</label>
                <input
                  className="input"
                  value={form.name}
                  required
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Couleur</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="w-10 h-10 rounded border border-slate-300 cursor-pointer"
                    />
                    <span className="text-xs text-slate-500">{form.color}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Échéance</label>
                  <input
                    type="date"
                    className="input"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition"
                >
                  {createMut.isPending && <Loader2 size={14} className="animate-spin" />} Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project: p, onClick }: { project: Project; onClick: () => void }) {
  const done  = p.tasks.filter((t) => t.status === 'DONE').length;
  const total = p.tasks.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  const isOverdue = p.dueDate && new Date(p.dueDate) < new Date() && p.status !== 'COMPLETED';

  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition p-5 flex flex-col gap-3 group"
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: p.color }} />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 truncate group-hover:text-blue-700 transition">{p.name}</h3>
          {p.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.description}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${STATUS_BADGE[p.status]}`}>
          {STATUS_LABELS[p.status]}
        </span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span className="font-medium">{done}/{total} tâches terminées</span>
            <span className={pct === 100 ? 'text-emerald-600 font-semibold' : ''}>{pct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer meta */}
      <div className="flex items-center gap-4 text-xs text-slate-400 mt-auto flex-wrap">
        <span className="flex items-center gap-1">
          <Users size={11} /> {p.members.length + 1} membre{p.members.length > 0 ? 's' : ''}
        </span>
        {p.dueDate && (
          <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
            <Calendar size={11} />
            {isOverdue && '⚠ '}
            {new Date(p.dueDate).toLocaleDateString('fr-FR')}
          </span>
        )}
        <span className="text-slate-400 ml-auto">Chef : {p.manager.fullName}</span>
      </div>
    </button>
  );
}
