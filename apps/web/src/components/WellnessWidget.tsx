import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, TrendingUp, CheckCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface WellnessStatus { responded: boolean; score: number | null }
interface TeamWellness {
  currentWeekAvg: number | null;
  respondedThisWeek: number;
  history: Array<{ week: string; avg: number; count: number }>;
}

const SCORES = [1,2,3,4,5,6,7,8,9,10];

function scoreColor(s: number): string {
  if (s <= 3) return 'bg-red-500';
  if (s <= 5) return 'bg-orange-400';
  if (s <= 7) return 'bg-amber-400';
  return 'bg-emerald-500';
}

function ScoreEmoji({ score }: { score: number }) {
  if (score <= 3) return <>😔</>;
  if (score <= 5) return <>😐</>;
  if (score <= 7) return <>🙂</>;
  return <>😄</>;
}

export default function WellnessWidget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [showTeam, setShowTeam] = useState(false);

  const role = user?.role as string;

  const { data: status } = useQuery<WellnessStatus>({
    queryKey: ['wellness-status'],
    queryFn: () => api.get('/api/wellness/status').then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: team } = useQuery<TeamWellness>({
    queryKey: ['wellness-team'],
    queryFn: () => api.get('/api/wellness/team').then((r) => r.data),
    enabled: (role === 'RH' || role === 'ADMIN' || role === 'MANAGER') && showTeam,
    staleTime: 60_000,
  });

  const submitMut = useMutation({
    mutationFn: (data: { score: number; comment?: string }) =>
      api.post('/api/wellness/respond', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wellness-status'] });
      qc.invalidateQueries({ queryKey: ['wellness-team'] });
      toast.success('Réponse bien-être enregistrée !');
      setSelectedScore(null);
      setComment('');
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  });

  const handleSubmit = () => {
    if (!selectedScore) return;
    submitMut.mutate({ score: selectedScore, comment: comment || undefined });
  };

  const canSeeTeam = role === 'RH' || role === 'ADMIN' || role === 'MANAGER';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
            <Heart size={18} className="text-rose-500" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Bien-être équipe</h3>
            <p className="text-xs text-slate-400">Score hebdomadaire</p>
          </div>
        </div>
        {canSeeTeam && (
          <button
            onClick={() => setShowTeam((v) => !v)}
            className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1"
          >
            <TrendingUp size={13} />
            {showTeam ? 'Ma réponse' : 'Vue équipe'}
          </button>
        )}
      </div>

      {/* Personal response form */}
      {!showTeam && (
        status?.responded ? (
          <div className="flex flex-col items-center py-3 text-center">
            <CheckCircle size={32} className="text-emerald-500 mb-2" />
            <p className="text-sm font-medium text-slate-700">Déjà répondu cette semaine</p>
            <p className="text-xs text-slate-400 mt-0.5">Score : <strong>{status.score}/10</strong></p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Comment vous sentez-vous cette semaine ?</p>
            <div className="flex gap-1.5 flex-wrap">
              {SCORES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedScore(s)}
                  className={`w-8 h-8 rounded-lg text-sm font-semibold border transition ${
                    selectedScore === s
                      ? `${scoreColor(s)} text-white border-transparent`
                      : 'border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {selectedScore && (
              <div className="text-center text-2xl"><ScoreEmoji score={selectedScore} /></div>
            )}
            <input
              type="text"
              placeholder="Commentaire optionnel..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300"
            />
            <button
              onClick={handleSubmit}
              disabled={!selectedScore || submitMut.isPending}
              className="w-full py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium disabled:opacity-40 transition flex items-center justify-center gap-2"
            >
              {submitMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Envoyer mon score
            </button>
          </div>
        )
      )}

      {/* Team view */}
      {showTeam && canSeeTeam && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-rose-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-rose-600">
                {team?.currentWeekAvg?.toFixed(1) ?? '—'}
              </p>
              <p className="text-xs text-rose-500 mt-0.5">Score moyen</p>
            </div>
            <div className="bg-violet-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-violet-600">{team?.respondedThisWeek ?? 0}</p>
              <p className="text-xs text-violet-500 mt-0.5">Réponses</p>
            </div>
          </div>
          {team?.history && team.history.length > 0 && (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={team.history} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 9 }}
                    tickFormatter={(v) => new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 9 }} />
                  <Tooltip
                    formatter={(v) => [`${v}/10`, 'Score moyen']}
                    labelFormatter={(l) => new Date(String(l)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  />
                  <Line type="monotone" dataKey="avg" stroke="#f43f5e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
