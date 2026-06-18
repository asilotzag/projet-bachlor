import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, FolderOpen, FileText, Download, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

interface Deliverable {
  id: string; title: string; description?: string; category?: string;
  originalName: string; filename: string; mimeType: string; size: number;
  version: number; createdAt: string;
  uploadedBy: { id: string; fullName: string };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function ProjectDeliverablesTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile]         = useState<File | null>(null);

  const { data, isLoading } = useQuery<{ deliverables: Deliverable[]; grouped: Record<string, Deliverable[]> }>({
    queryKey: ['deliverables', projectId],
    queryFn: async () => (await api.get(`/api/projects/${projectId}/deliverables`)).data,
  });

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Fichier requis');
      const fd = new FormData();
      fd.append('file', file);
      if (title) fd.append('title', title);
      if (desc)  fd.append('description', desc);
      if (category) fd.append('category', category);
      return api.post(`/api/projects/${projectId}/deliverables`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliverables', projectId] });
      toast.success('Livrable déposé');
      setShowForm(false); setTitle(''); setDesc(''); setCategory(''); setFile(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const grouped = data?.grouped ?? {};
  const categories = Object.keys(grouped).sort();

  return (
    <div className="space-y-4">
      {/* Upload button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Livrables du projet</h3>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={13} />Déposer un livrable
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Nouveau livrable</p>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
          <input
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            placeholder="Titre (optionnel — utilise le nom du fichier par défaut)"
            value={title} onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            placeholder="Catégorie (ex: Conception, Tests, Documentation…)"
            value={category} onChange={(e) => setCategory(e.target.value)}
          />
          <textarea
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            rows={2} placeholder="Description (optionnel)"
            value={desc} onChange={(e) => setDesc(e.target.value)}
          />
          <div>
            <input ref={fileRef} type="file" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition"
            >
              <Upload size={12} />{file ? file.name : 'Choisir un fichier…'}
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              disabled={!file || uploadMut.isPending}
              onClick={() => uploadMut.mutate()}
              className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium"
            >
              {uploadMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              Déposer
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs text-slate-500 px-3 py-1.5 rounded-lg border hover:bg-slate-50 transition">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={24} /></div>
      )}

      {!isLoading && categories.length === 0 && (
        <div className="text-center py-12">
          <FolderOpen size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Aucun livrable pour le moment.</p>
          <p className="text-xs text-slate-300 mt-1">Déposez des fichiers pour les partager avec l'équipe.</p>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FolderOpen size={12} />{cat}
          </p>
          <div className="space-y-2">
            {grouped[cat].map((d) => (
              <div key={d.id} className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 transition">
                <FileText size={18} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{d.title}</p>
                  <p className="text-xs text-slate-400">
                    v{d.version} · {formatBytes(d.size)} · par {d.uploadedBy.fullName} · {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                  {d.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{d.description}</p>}
                </div>
                <a
                  href={`/files/${d.filename}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-slate-400 hover:text-blue-600 transition"
                  title="Télécharger"
                >
                  <Download size={16} />
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
