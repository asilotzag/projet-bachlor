import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X, Check, Loader2, ChevronRight, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface GeneratedTask {
  title: string;
  description?: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  dayOffset: number;
}

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PRIORITY_COLORS = {
  HIGH:   'bg-red-100 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  LOW:    'bg-green-100 text-green-700 border-green-200',
};

const PRIORITY_LABELS = { HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Basse' };

export default function GenerateTasksModal({ projectId, projectName, onClose, onSuccess }: Props) {
  const qc = useQueryClient();
  const [goal, setGoal] = useState('');
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [tasks, setTasks] = useState<GeneratedTask[]>([]);

  const generateMut = useMutation({
    mutationFn: (g: string) =>
      api.post(`/api/projects/${projectId}/generate-tasks`, { goal: g }).then((r) => r.data),
    onSuccess: (data: { tasks: GeneratedTask[] }) => {
      setTasks(data.tasks);
      setStep('review');
    },
    onError: () => toast.error('Erreur lors de la génération IA'),
  });

  const confirmMut = useMutation({
    mutationFn: (t: GeneratedTask[]) =>
      api.post(`/api/projects/${projectId}/confirm-tasks`, { tasks: t }).then((r) => r.data),
    onSuccess: (data: { created: number }) => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success(`${data.created} tâche${data.created !== 1 ? 's' : ''} créée${data.created !== 1 ? 's' : ''} !`);
      onSuccess();
      onClose();
    },
    onError: () => toast.error('Erreur lors de la création des tâches'),
  });

  const removeTask = (idx: number) => setTasks((prev) => prev.filter((_, i) => i !== idx));

  const dueDate = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Sparkles size={20} className="text-violet-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Générer des tâches par IA</h2>
            <p className="text-sm text-slate-400">{projectName}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'input' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                L'IA va analyser votre projet et générer automatiquement une liste de tâches pertinentes.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Objectif spécifique <span className="text-slate-400 font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Ex : Implémenter l'authentification OAuth, préparer le lancement v2..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                />
              </div>
              <div className="bg-violet-50 rounded-xl p-4 text-sm text-violet-700">
                <strong>✨ Comment ça fonctionne :</strong> L'IA analyse le nom et la description de votre projet,
                puis propose 5 à 10 tâches avec priorités et échéances suggérées. Vous pourrez les modifier avant de confirmer.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">
                  <strong>{tasks.length}</strong> tâches générées — supprimez celles non pertinentes
                </p>
                <button
                  onClick={() => setStep('input')}
                  className="text-xs text-violet-600 hover:text-violet-700"
                >
                  ← Regénérer
                </button>
              </div>
              {tasks.map((t, i) => (
                <div key={i} className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl hover:border-violet-300 transition group">
                  <ChevronRight size={16} className="text-slate-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-800 text-sm">{t.title}</p>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                        {PRIORITY_LABELS[t.priority]}
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Échéance : {dueDate(t.dayOffset)}</p>
                  </div>
                  <button
                    onClick={() => removeTask(i)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-6">Toutes les tâches ont été supprimées</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition">
            Annuler
          </button>
          {step === 'input' ? (
            <button
              onClick={() => generateMut.mutate(goal)}
              disabled={generateMut.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {generateMut.isPending ? (
                <><Loader2 size={15} className="animate-spin" /> Génération en cours…</>
              ) : (
                <><Sparkles size={15} /> Générer les tâches</>
              )}
            </button>
          ) : (
            <button
              onClick={() => confirmMut.mutate(tasks)}
              disabled={tasks.length === 0 || confirmMut.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {confirmMut.isPending ? (
                <><Loader2 size={15} className="animate-spin" /> Création…</>
              ) : (
                <><Check size={15} /> Créer {tasks.length} tâche{tasks.length !== 1 ? 's' : ''}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
