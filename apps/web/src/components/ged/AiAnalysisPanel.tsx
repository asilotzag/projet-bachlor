import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { api, apiAI } from '../../lib/api';
import toast from 'react-hot-toast';

interface AiAnalysis {
  id: number;
  provider: string;
  summary: string;
  category: string | null;
  extractedFields: Record<string, string> | null;
  confidence: number;
  createdAt: string;
}

interface Props {
  documentId: string;
  canRetrigger: boolean;
}

export default function AiAnalysisPanel({ documentId, canRetrigger }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: analysis, isLoading, isError } = useQuery<AiAnalysis>({
    queryKey: ['ai-analysis', documentId],
    queryFn: async () => (await api.get(`/api/documents/${documentId}/analysis`)).data,
    retry: false,
  });

  const triggerMut = useMutation({
    mutationFn: () => apiAI.post(`/api/documents/${documentId}/analysis`),
    onSuccess: () => {
      toast.success('Analyse lancée — résultats dans 15–30 secondes');
      // Polling toutes les 8s pendant 90s max
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        qc.invalidateQueries({ queryKey: ['ai-analysis', documentId] });
        if (attempts >= 11) clearInterval(poll);
      }, 8000);
    },
    onError: () => toast.error('Erreur lors du déclenchement'),
  });

  const confidenceColor = !analysis ? '' :
    analysis.confidence >= 0.8 ? 'text-emerald-600' :
    analysis.confidence >= 0.5 ? 'text-amber-600' : 'text-red-500';

  const fields = analysis?.extractedFields
    ? Object.entries(analysis.extractedFields).filter(([, v]) => v)
    : [];

  return (
    <div className="border border-violet-200 rounded-xl bg-violet-50/50 overflow-hidden">
      {/* Header cliquable */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-violet-100/60 transition"
      >
        <Sparkles size={15} className="text-violet-600 shrink-0" />
        <span className="text-sm font-medium text-violet-800 flex-1">Analyse IA</span>

        {isLoading && <Loader2 size={13} className="animate-spin text-violet-500" />}
        {!isLoading && !isError && analysis && (
          <span className={`text-xs font-medium ${confidenceColor}`}>
            {Math.round(analysis.confidence * 100)}%
          </span>
        )}
        {!isLoading && isError && (
          <span className="text-xs text-slate-400 italic">en attente</span>
        )}
        {expanded ? <ChevronUp size={13} className="text-violet-500" /> : <ChevronDown size={13} className="text-violet-500" />}
      </button>

      {/* Corps */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 size={14} className="animate-spin" /> Chargement de l&apos;analyse…
            </div>
          )}

          {isError && (
            <div className="text-sm text-slate-500 space-y-2">
              <p className="italic">Aucune analyse disponible pour ce document.</p>
              {canRetrigger && (
                <button
                  onClick={() => triggerMut.mutate()}
                  disabled={triggerMut.isPending}
                  className="flex items-center gap-1.5 text-xs text-violet-700 hover:text-violet-900 font-medium"
                >
                  {triggerMut.isPending
                    ? <Loader2 size={12} className="animate-spin" />
                    : <RefreshCw size={12} />}
                  Analyser maintenant
                </button>
              )}
            </div>
          )}

          {analysis && (
            <>
              {/* Résumé */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Résumé</p>
                <p className="text-sm text-slate-700 leading-relaxed">{analysis.summary}</p>
              </div>

              {/* Catégorie suggérée */}
              {analysis.category && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Catégorie suggérée</p>
                  <span className="inline-block px-2 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full">
                    {analysis.category}
                  </span>
                </div>
              )}

              {/* Champs extraits */}
              {fields.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Champs extraits</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {fields.map(([k, v]) => (
                      <>
                        <dt key={`k-${k}`} className="text-slate-400 capitalize">{k.replace(/_/g, ' ')}</dt>
                        <dd key={`v-${k}`} className="text-slate-700 font-medium truncate">{v}</dd>
                      </>
                    ))}
                  </dl>
                </div>
              )}

              {/* Méta */}
              <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-violet-100">
                <span>via {analysis.provider}</span>
                <div className="flex items-center gap-2">
                  <span>{new Date(analysis.createdAt).toLocaleDateString('fr-FR')}</span>
                  {canRetrigger && (
                    <button
                      onClick={() => triggerMut.mutate()}
                      disabled={triggerMut.isPending}
                      className="hover:text-violet-600 transition"
                      title="Relancer l'analyse"
                    >
                      <RefreshCw size={11} />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
