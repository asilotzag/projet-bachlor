import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, LayoutTemplate, CheckCircle, Loader2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface TemplateTask {
  id: string;
  title: string;
  description?: string;
  priority: string;
  dayOffset: number;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  color: string;
  tasks: TemplateTask[];
}

interface Props {
  onClose: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW:    'bg-green-100 text-green-700',
};

export default function TemplateModal({ onClose }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [step, setStep] = useState<'pick' | 'configure'>('pick');

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: () => api.get('/api/templates').then((r) => r.data),
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: (data: object) =>
      api.post(`/api/projects/from-template/${selectedId}`, data).then((r) => r.data),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success(`Projet "${project.name}" créé !`);
      onClose();
      navigate(`/projects/${project.id}`);
    },
    onError: () => toast.error('Erreur lors de la création'),
  });

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  const handleCreate = () => {
    if (!selectedId) return;
    createMut.mutate({
      name: name || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <LayoutTemplate size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Créer depuis un template</h2>
            <p className="text-sm text-slate-400">
              {step === 'pick' ? 'Choisissez un modèle de projet' : `Configurer — ${selectedTemplate?.name}`}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'pick' ? (
            isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={24} className="animate-spin text-violet-500" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <LayoutTemplate size={40} className="mx-auto mb-3 opacity-30" />
                <p>Aucun template disponible</p>
                <p className="text-xs mt-1">Les administrateurs peuvent en créer via l'API</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className={`border-2 rounded-xl overflow-hidden transition cursor-pointer ${
                      selectedId === t.id ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 p-4"
                      onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                    >
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800">{t.name}</p>
                        {t.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{t.description}</p>}
                        <p className="text-xs text-slate-400 mt-1">{t.tasks.length} tâche{t.tasks.length !== 1 ? 's' : ''}</p>
                      </div>
                      {selectedId === t.id && <CheckCircle size={18} className="text-violet-600 shrink-0" />}
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(expanded === t.id ? null : t.id); }}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        {expanded === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </div>
                    {expanded === t.id && (
                      <div className="border-t border-slate-100 bg-white px-4 pb-3 space-y-1.5">
                        {t.tasks.map((task) => (
                          <div key={task.id} className="flex items-center gap-2 text-sm">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority] ?? 'bg-slate-100 text-slate-600'}`}>
                              {task.priority}
                            </span>
                            <span className="text-slate-700">{task.title}</span>
                            <span className="text-slate-400 text-xs ml-auto">J+{task.dayOffset}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom du projet</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selectedTemplate?.name ?? 'Nom du projet'}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Date d'échéance <span className="text-slate-400 font-normal">(optionnel)</span></label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-sm font-medium text-slate-700 mb-2">Tâches qui seront créées :</p>
                <div className="space-y-1.5">
                  {selectedTemplate?.tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm text-slate-600">
                      <Plus size={12} className="text-slate-400 shrink-0" />
                      <span>{t.title}</span>
                      <span className="text-slate-400 text-xs ml-auto">Échéance J+{t.dayOffset}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
          {step === 'configure' && (
            <button onClick={() => setStep('pick')} className="text-sm text-slate-500 hover:text-slate-700 transition">
              ← Retour
            </button>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition">
              Annuler
            </button>
            {step === 'pick' ? (
              <button
                onClick={() => setStep('configure')}
                disabled={!selectedId}
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition disabled:opacity-40"
              >
                Suivant →
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={createMut.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition disabled:opacity-50"
              >
                {createMut.isPending ? (
                  <><Loader2 size={15} className="animate-spin" /> Création…</>
                ) : (
                  'Créer le projet'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
