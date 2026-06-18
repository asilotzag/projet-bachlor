import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import toast from 'react-hot-toast';
import { Plus, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import TaskDetailModal from './TaskDetailModal';
import { TaskCard, AssignTaskModal, PRIORITY_CFG } from './KanbanBoard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string; title: string; description?: string;
  status: TaskStatus; priority: TaskPriority; position: number;
  dueDate?: string;
  assignee?: { id: string; fullName: string } | null;
  createdBy: { id: string; fullName: string };
  _count: { comments: number };
  projectId?: string | null;
}

type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
interface AssignableUser { id: string; fullName: string; role: string }

const COLUMNS: { id: TaskStatus; label: string; headerCls: string; colCls: string }[] = [
  { id: 'TODO',        label: 'À faire',     headerCls: 'text-slate-600',   colCls: 'bg-slate-50 border-slate-200' },
  { id: 'IN_PROGRESS', label: 'En cours',    headerCls: 'text-blue-600',    colCls: 'bg-blue-50 border-blue-200' },
  { id: 'REVIEW',      label: 'En révision', headerCls: 'text-amber-600',   colCls: 'bg-amber-50 border-amber-200' },
  { id: 'DONE',        label: 'Terminé',     headerCls: 'text-emerald-600', colCls: 'bg-emerald-50 border-emerald-200' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function StandaloneTasks() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTask, setActiveTask]   = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const canAssign = user?.role !== 'EMPLOYE';

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['standalone-tasks'],
    queryFn: async () => {
      const all: Task[] = (await api.get('/api/tasks')).data;
      return all.filter((t) => !t.projectId);
    },
  });

  const { data: assignableUsers = [] } = useQuery<AssignableUser[]>({
    queryKey: ['assignable-users'],
    queryFn: async () => (await api.get('/api/users/assignable')).data,
    enabled: canAssign,
  });

  const reorderMut = useMutation({
    mutationFn: (data: { taskId: string; newStatus: TaskStatus; newPosition: number }) =>
      api.post('/api/tasks/reorder', data),
    onError: (e: any) => {
      qc.invalidateQueries({ queryKey: ['standalone-tasks'] });
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

    qc.setQueryData<Task[]>(['standalone-tasks'], (old = []) =>
      old.map((t) => t.id === task.id ? { ...t, status: newStatus, position: newPosition } : t),
    );
    reorderMut.mutate({ taskId: task.id, newStatus, newPosition });
  }

  const tasksByStatus = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500">{tasks.length} tâche{tasks.length !== 1 ? 's' : ''} autonome{tasks.length !== 1 ? 's' : ''}</p>
        {canAssign && (
          <button
            onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <Plus size={14} /> Assigner une tâche
          </button>
        )}
      </div>

      {/* Kanban */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto">
          <div className="flex gap-4 min-w-max">
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
                      {colTasks.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4 italic">Aucune tâche</p>
                      )}
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

      {/* Modals */}
      {showAssignModal && (
        <AssignTaskModal
          assignableUsers={assignableUsers}
          onClose={() => setShowAssignModal(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['standalone-tasks'] });
            setShowAssignModal(false);
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          taskId={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => qc.invalidateQueries({ queryKey: ['standalone-tasks'] })}
          members={assignableUsers}
        />
      )}
    </div>
  );
}

// re-export for any remaining consumers
export { PRIORITY_CFG };
