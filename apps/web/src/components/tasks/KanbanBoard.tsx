import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Plus, Loader2, Calendar, MessageSquare, Sparkles, X, FolderOpen, BarChart2,
} from 'lucide-react';
import { api, apiAI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import TaskDetailModal from './TaskDetailModal';
import ProjectDeliverablesTab from './ProjectDeliverablesTab';
import GanttView from './GanttView';
import GenerateTasksModal from './GenerateTasksModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string; title: string; description?: string;
  status: TaskStatus; priority: TaskPriority; position: number;
  dueDate?: string;
  assignee?: { id: string; fullName: string } | null;
  createdBy: { id: string; fullName: string };
  _count: { comments: number };
}

type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface AssignableUser { id: string; fullName: string; role: string }

interface ProjectInfo {
  id: string; name: string; color: string;
  manager: { id: string; fullName: string };
  members: { user: { id: string; fullName: string } }[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const COLUMNS: { id: TaskStatus; label: string; headerCls: string; colCls: string }[] = [
  { id: 'TODO',        label: 'À faire',     headerCls: 'text-slate-600',   colCls: 'bg-slate-50 border-slate-200' },
  { id: 'IN_PROGRESS', label: 'En cours',    headerCls: 'text-blue-600',    colCls: 'bg-blue-50 border-blue-200' },
  { id: 'REVIEW',      label: 'En révision', headerCls: 'text-amber-600',   colCls: 'bg-amber-50 border-amber-200' },
  { id: 'DONE',        label: 'Terminé',     headerCls: 'text-emerald-600', colCls: 'bg-emerald-50 border-emerald-200' },
];

export const PRIORITY_CFG: Record<TaskPriority, { label: string; badge: string }> = {
  LOW:    { label: 'Basse',   badge: 'bg-slate-100 text-slate-500' },
  MEDIUM: { label: 'Moyenne', badge: 'bg-blue-100 text-blue-700' },
  HIGH:   { label: 'Haute',   badge: 'bg-orange-100 text-orange-700' },
  URGENT: { label: 'Urgente', badge: 'bg-red-100 text-red-700' },
};

const STATUS_INDEX: Record<TaskStatus, number> = { TODO: 0, IN_PROGRESS: 1, REVIEW: 2, DONE: 3 };

// ─── Board ────────────────────────────────────────────────────────────────────

export default function KanbanBoard({ project, onBack }: { project: ProjectInfo; onBack: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [boardTab, setBoardTab] = useState<'kanban' | 'deliverables' | 'gantt'>('kanban');

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', project.id],
    queryFn: async () => (await api.get(`/api/tasks?projectId=${project.id}`)).data,
  });

  const { data: assignableUsers = [] } = useQuery<AssignableUser[]>({
    queryKey: ['assignable-users'],
    queryFn: async () => (await api.get('/api/users/assignable')).data,
    enabled: user?.role !== 'EMPLOYE',
  });

  const reorderMut = useMutation({
    mutationFn: (data: { taskId: string; newStatus: TaskStatus; newPosition: number }) =>
      api.post('/api/tasks/reorder', data),
    onError: (e: any) => {
      qc.invalidateQueries({ queryKey: ['tasks', project.id] });
      toast.error(e.response?.data?.message ?? 'Déplacement non autorisé');
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function canDrag(task: Task): boolean {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (task.assignee?.id === user.id) return true;
    if (task.createdBy.id === user.id) return true;
    return false;
  }

  function handleDragStart(e: DragStartEvent) {
    const task = tasks.find((t) => t.id === e.active.id);
    if (task) setActiveTask(task);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;

    const targetColumn = COLUMNS.find((c) => c.id === over.id);
    const targetTask   = tasks.find((t) => t.id === over.id);
    const newStatus: TaskStatus = targetColumn?.id ?? targetTask?.status ?? task.status;
    const newPosition: number   = targetTask?.position ?? 0;

    if (newStatus === task.status && newPosition === task.position) return;

    qc.setQueryData<Task[]>(['tasks', project.id], (old = []) =>
      old.map((t) => t.id === task.id ? { ...t, status: newStatus, position: newPosition } : t),
    );
    reorderMut.mutate({ taskId: task.id, newStatus, newPosition });
  }

  const tasksByStatus = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);

  const allMembers = [project.manager, ...project.members.map((m) => m.user)];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 shrink-0">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition text-slate-500">
          <ArrowLeft size={18} />
        </button>
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: project.color }} />
        <h1 className="text-xl font-bold text-slate-800 flex-1">{project.name}</h1>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button onClick={() => setBoardTab('kanban')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${boardTab === 'kanban' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Tableau
          </button>
          <button onClick={() => setBoardTab('gantt')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md transition ${boardTab === 'gantt' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <BarChart2 size={12} />Gantt
          </button>
          <button onClick={() => setBoardTab('deliverables')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md transition ${boardTab === 'deliverables' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <FolderOpen size={12} />Livrables
          </button>
        </div>
        <span className="text-sm text-slate-400">{tasks.length} tâche{tasks.length !== 1 ? 's' : ''}</span>
        {user?.role !== 'EMPLOYE' && boardTab === 'kanban' && (
          <>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition"
              title="Générer des tâches par IA"
            >
              <Sparkles size={14} /> IA
            </button>
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              <Plus size={14} /> Assigner une tâche
            </button>
          </>
        )}
      </div>

      {/* Deliverables tab */}
      {boardTab === 'deliverables' && (
        <div className="flex-1 overflow-y-auto p-6">
          <ProjectDeliverablesTab projectId={project.id} />
        </div>
      )}

      {/* Gantt tab */}
      {boardTab === 'gantt' && (
        <div className="flex-1 overflow-y-auto p-6">
          <GanttView tasks={tasks as any} />
        </div>
      )}

      {/* Kanban */}
      {boardTab === 'kanban' && (isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto p-6">
            <div className="flex gap-4 h-full min-w-max">
              {COLUMNS.map((col) => {
                const colTasks = tasksByStatus(col.id);
                return (
                  <div key={col.id} className={`w-72 shrink-0 rounded-xl border ${col.colCls} flex flex-col`}>
                    <div className="px-4 py-3 flex items-center justify-between shrink-0">
                      <span className={`text-sm font-semibold ${col.headerCls}`}>{col.label}</span>
                      <span className="text-xs bg-white rounded-full px-2 py-0.5 text-slate-500 border border-slate-200">
                        {colTasks.length}
                      </span>
                    </div>

                    <SortableContext items={colTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-16">
                        {colTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            canDrag={canDrag(task)}
                            onSelect={() => setSelectedTask(task.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                );
              })}
            </div>
          </div>

          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} canDrag isDragging onSelect={() => {}} />}
          </DragOverlay>
        </DndContext>
      ))}

      {/* Generate tasks modal */}
      {showGenerateModal && (
        <GenerateTasksModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowGenerateModal(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['tasks', project.id] })}
        />
      )}

      {/* Modals */}
      {showAssignModal && (
        <AssignTaskModal
          projectId={project.id}
          assignableUsers={assignableUsers}
          onClose={() => setShowAssignModal(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['tasks', project.id] });
            setShowAssignModal(false);
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          taskId={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => qc.invalidateQueries({ queryKey: ['tasks', project.id] })}
          members={allMembers}
        />
      )}
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

export function TaskCard({ task, canDrag, onSelect, isDragging }: {
  task: Task; canDrag: boolean; onSelect: () => void; isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortable } =
    useSortable({ id: task.id, disabled: !canDrag });

  const now    = Date.now();
  const dueMs  = task.dueDate ? new Date(task.dueDate).getTime() : null;
  const isOverdue = dueMs !== null && dueMs < now && task.status !== 'DONE';
  const isDueSoon = dueMs !== null && !isOverdue && (dueMs - now) < 2 * 86400000;
  const stepIdx   = STATUS_INDEX[task.status];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isSortable ? 0.4 : 1 }}
      {...attributes}
      {...(canDrag ? listeners : {})}
      onClick={onSelect}
      className={`bg-white rounded-xl border p-3 transition select-none
        ${isDragging ? 'shadow-xl rotate-1 border-blue-300' : 'border-slate-200 hover:shadow-md hover:border-blue-300'}
        ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      {/* Title */}
      <p className="text-sm font-semibold text-slate-700 mb-2 line-clamp-2 leading-snug">{task.title}</p>

      {/* Priority badge */}
      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 ${PRIORITY_CFG[task.priority].badge}`}>
        {PRIORITY_CFG[task.priority].label}
      </span>

      {/* Progress bar — 4 segments */}
      <div className="flex gap-0.5 mb-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIdx ? 'bg-blue-500' : 'bg-slate-200'}`}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
          {task.dueDate && (
            <span className={`flex items-center gap-0.5 shrink-0 ${isOverdue ? 'text-red-500' : isDueSoon ? 'text-amber-500' : ''}`}>
              <Calendar size={10} />
              {isOverdue && '⚠ '}
              {new Date(task.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
            </span>
          )}
          {task._count.comments > 0 && (
            <span className="flex items-center gap-0.5 shrink-0">
              <MessageSquare size={10} /> {task._count.comments}
            </span>
          )}
        </div>

        {/* Assignee avatar */}
        {task.assignee && (
          <div className="flex items-center gap-1 shrink-0">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold">
              {task.assignee.fullName[0].toUpperCase()}
            </div>
            <span className="text-[10px] text-slate-500 max-w-[60px] truncate">
              {task.assignee.fullName.split(' ')[0]}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Assign Task Modal ────────────────────────────────────────────────────────

export function AssignTaskModal({ projectId, assignableUsers, onClose, onSuccess }: {
  projectId?: string;
  assignableUsers: AssignableUser[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: '', description: '', priority: 'MEDIUM' as TaskPriority,
    dueDate: '', assigneeId: '',
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading]     = useState(false);

  const canAssign = user?.role !== 'EMPLOYE';

  async function generateDescription() {
    if (!form.title.trim()) { toast.error('Entrez d\'abord un titre'); return; }
    setAiLoading(true);
    try {
      const res = await apiAI.post('/api/ai/generate', {
        type: 'task_description',
        context: { title: form.title, priority: form.priority },
      });
      setForm((f) => ({ ...f, description: res.data.content ?? res.data }));
    } catch {
      toast.error('IA indisponible');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/tasks', {
        title:      form.title,
        description: form.description || undefined,
        priority:   form.priority,
        dueDate:    form.dueDate ? new Date(form.dueDate).toISOString() : null,
        assigneeId: form.assigneeId || null,
        projectId:  projectId ?? null,
        status:     'TODO',
      });
      toast.success('Tâche créée !');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Assigner une tâche</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Titre *</label>
            <input
              className="input"
              placeholder="Ex : Implémenter le module d'authentification"
              value={form.title}
              required
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          {/* Description + AI */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-slate-700">Description</label>
              <button
                type="button"
                onClick={generateDescription}
                disabled={aiLoading}
                className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
              >
                {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                Générer avec IA
              </button>
            </div>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Décrivez la tâche…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {/* Priority — visual buttons */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Priorité</label>
            <div className="grid grid-cols-4 gap-2">
              {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm({ ...form, priority: p })}
                  className={`py-2 rounded-lg text-xs font-semibold border-2 transition ${
                    form.priority === p
                      ? `${PRIORITY_CFG[p].badge} border-current`
                      : 'border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {PRIORITY_CFG[p].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Assignee — hidden for EMPLOYE */}
            {canAssign && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Assigné à</label>
                <select
                  className="input"
                  value={form.assigneeId}
                  onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                >
                  <option value="">— Non assigné —</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Due date */}
            <div className={canAssign ? '' : 'col-span-2'}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Échéance</label>
              <input
                type="date"
                className="input"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              {loading && <Loader2 size={14} className="animate-spin" />} Créer la tâche
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
