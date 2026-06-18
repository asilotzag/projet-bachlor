import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  FolderOpen, Upload, Search, X, Download, Eye, Trash2,
  Loader2, Plus, Tag as TagIcon, FolderPlus, Lock, Globe, Shield, Settings,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatSize, mimeIcon, isPreviewable } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import AiAnalysisPanel from '../components/ged/AiAnalysisPanel';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function downloadDocument(id: string, filename: string) {
  const { default: axios } = await import('axios');
  const token = localStorage.getItem('token');
  const res = await axios.get(`${API}/api/documents/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category { id: number; name: string; color: string; _count?: { documents: number } }
interface Tag      { id: number; name: string; color: string }
interface DocPermission { id?: string; type: string; value: string }
interface Document {
  id: string; title: string; description?: string;
  originalName: string; mimeType: string; size: number;
  filename: string; isArchived: boolean; latestVersion: number;
  createdAt: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED';
  uploadedById: string;
  category?: Category;
  tags: Tag[];
  uploadedBy: { id: string; fullName: string };
  permissions: DocPermission[];
}

// ─── Visibility badge ─────────────────────────────────────────────────────────

const VIS_CONFIG = {
  PUBLIC:     { label: 'Public',    Icon: Globe,  cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  PRIVATE:    { label: 'Privé',     Icon: Lock,   cls: 'bg-red-50 text-red-600 border-red-200' },
  RESTRICTED: { label: 'Restreint', Icon: Shield, cls: 'bg-amber-50 text-amber-600 border-amber-200' },
} as const;

function VisibilityBadge({ v }: { v: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED' }) {
  const cfg = VIS_CONFIG[v] ?? VIS_CONFIG.PUBLIC;
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full border ${cfg.cls}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function GEDPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [showTagMgr, setShowTagMgr] = useState(false);
  const [preview, setPreview] = useState<Document | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<Document | null>(null);

  const { data: docs = [], isLoading } = useQuery<Document[]>({
    queryKey: ['documents', search, catFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (catFilter) params.set('categoryId', String(catFilter));
      return (await api.get(`/api/documents?${params}`)).data;
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/api/categories')).data,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/documents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Document supprimé'); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur lors de la suppression'),
  });

  const canUpload = !!user;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar catégories ── */}
      <aside className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col p-4 gap-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Catégories</span>
          {canUpload && (
            <button onClick={() => setShowCatMgr(true)} className="text-slate-400 hover:text-blue-600 transition">
              <FolderPlus size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => setCatFilter(null)}
          className={`text-left px-3 py-2 rounded-lg text-sm transition ${!catFilter ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Tous les documents
          <span className="float-right text-xs text-slate-400">{docs.length}</span>
        </button>

        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCatFilter(catFilter === cat.id ? null : cat.id)}
            className={`text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-2 ${catFilter === cat.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
            <span className="truncate flex-1">{cat.name}</span>
            <span className="text-xs text-slate-400">{cat._count?.documents ?? ''}</span>
          </button>
        ))}
      </aside>

      {/* ── Zone principale ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
          <FolderOpen className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-slate-800 mr-4">Gestion Documentaire</h1>

          <div className="flex-1 relative max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un document…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          <button onClick={() => setShowTagMgr(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">
            <TagIcon size={15} /> Tags
          </button>

          {canUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              <Upload size={15} /> Importer
            </button>
          )}
        </div>

        {/* Liste des documents */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="animate-spin text-blue-500" size={28} />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-3">
              <FolderOpen size={40} className="text-slate-300" />
              <p className="text-sm">{search ? 'Aucun résultat pour cette recherche.' : 'Aucun document accessible.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {docs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  currentUserId={user?.id ?? ''}
                  currentRole={user?.role ?? ''}
                  onPreview={() => setPreview(doc)}
                  onDelete={() => { if (confirm('Supprimer ce document ?')) deleteMut.mutate(doc.id); }}
                  onPermissions={() => setPermissionsFor(doc)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modales ── */}
      {showUpload && (
        <UploadModal
          categories={categories}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['documents'] });
            qc.invalidateQueries({ queryKey: ['categories'] });
            setShowUpload(false);
          }}
        />
      )}
      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}
      {showCatMgr && <CategoryManager categories={categories} onClose={() => setShowCatMgr(false)} />}
      {showTagMgr && <TagManager onClose={() => setShowTagMgr(false)} />}
      {permissionsFor && (
        <PermissionsModal
          doc={permissionsFor}
          onClose={() => setPermissionsFor(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['documents'] });
            setPermissionsFor(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Carte document ───────────────────────────────────────────────────────────

function DocumentCard({ doc, currentUserId, currentRole, onPreview, onDelete, onPermissions }: {
  doc: Document;
  currentUserId: string;
  currentRole: string;
  onPreview: () => void;
  onDelete: () => void;
  onPermissions: () => void;
}) {
  const isOwner = doc.uploadedBy.id === currentUserId;
  const isAdmin = currentRole === 'ADMIN';
  const canDelete = isOwner || isAdmin;
  const canManagePerms = isOwner || isAdmin;

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">{mimeIcon(doc.mimeType)}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 truncate text-sm">{doc.title}</h3>
          <p className="text-xs text-slate-400 truncate">{doc.originalName}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {doc.latestVersion > 1 && (
            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">v{doc.latestVersion}</span>
          )}
          <VisibilityBadge v={doc.visibility ?? 'PUBLIC'} />
        </div>
      </div>

      {doc.description && (
        <p className="text-xs text-slate-500 line-clamp-2">{doc.description}</p>
      )}

      <div className="flex flex-wrap gap-1">
        {doc.category && (
          <span className="px-2 py-0.5 text-xs rounded-full font-medium text-white" style={{ background: doc.category.color }}>
            {doc.category.name}
          </span>
        )}
        {doc.tags.map((t) => (
          <span key={t.id} className="px-2 py-0.5 text-xs rounded-full border" style={{ borderColor: t.color, color: t.color }}>
            {t.name}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 mt-auto pt-2 border-t border-slate-100">
        <span>{formatSize(doc.size)}</span>
        <span className="truncate max-w-[110px]">par {doc.uploadedBy.fullName}</span>
        <span>{new Date(doc.createdAt).toLocaleDateString('fr-FR')}</span>
      </div>

      <div className="flex gap-2">
        {isPreviewable(doc.mimeType) && (
          <button onClick={onPreview} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition">
            <Eye size={13} /> Aperçu
          </button>
        )}
        <button
          onClick={() => downloadDocument(doc.id, doc.originalName)}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
        >
          <Download size={13} /> Télécharger
        </button>
        {canManagePerms && (
          <button
            onClick={onPermissions}
            title="Gérer les permissions"
            className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg border border-slate-200 transition"
          >
            <Settings size={13} />
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg border border-slate-200 transition">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <AiAnalysisPanel documentId={doc.id} canRetrigger={isOwner || isAdmin} />
    </div>
  );
}

// ─── Modal upload ─────────────────────────────────────────────────────────────

function UploadModal({ categories, onClose, onSuccess }: {
  categories: Category[]; onClose: () => void; onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE' | 'RESTRICTED'>('PUBLIC');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: async () => (await api.get('/api/tags')).data,
  });
  const [selectedTags, setSelectedTags] = useState<number[]>([]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); }
  }, [title]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast.error('Sélectionnez un fichier'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      if (description) fd.append('description', description);
      if (categoryId) fd.append('categoryId', categoryId);
      if (selectedTags.length) fd.append('tagIds', JSON.stringify(selectedTags));
      fd.append('visibility', visibility);
      await api.post('/api/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document importé !');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Erreur lors de l\'import');
    } finally {
      setLoading(false);
    }
  }

  const toggleTag = (id: number) =>
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const VIS_OPTS: Array<{ key: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED'; label: string; desc: string }> = [
    { key: 'PUBLIC',     label: '🌐 Public',    desc: 'Visible par tous' },
    { key: 'PRIVATE',    label: '🔒 Privé',     desc: 'Vous seul + admin' },
    { key: 'RESTRICTED', label: '🔐 Restreint', desc: 'Selon les règles' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-800">Importer un document</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400'}`}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input id="file-input" type="file" className="hidden" onChange={handleFileChange} />
            {file ? (
              <p className="text-sm font-medium text-slate-700">{file.name} <span className="text-slate-400">({formatSize(file.size)})</span></p>
            ) : (
              <>
                <Upload size={28} className="mx-auto text-slate-400 mb-2" />
                <p className="text-sm text-slate-500">Glissez un fichier ici ou <span className="text-blue-600 font-medium">parcourir</span></p>
                <p className="text-xs text-slate-400 mt-1">PDF, images, Word, Excel, TXT — max 50 Mo</p>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Titre <span className="text-red-500">*</span></label>
            <input className="input" value={title} required onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea className="input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Visibilité</label>
            <div className="grid grid-cols-3 gap-2">
              {VIS_OPTS.map(({ key, label, desc }) => (
                <button
                  key={key} type="button"
                  onClick={() => setVisibility(key)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition ${
                    visibility === key
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs opacity-70">{desc}</span>
                </button>
              ))}
            </div>
            {visibility === 'RESTRICTED' && (
              <p className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Configurez les règles d'accès après l'import via le bouton <strong>⚙</strong> sur la carte du document.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Catégorie</label>
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— Aucune —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tags</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tags.map((t) => (
                  <button
                    key={t.id} type="button"
                    onClick={() => toggleTag(t.id)}
                    className="px-2 py-0.5 text-xs rounded-full border transition"
                    style={selectedTags.includes(t.id)
                      ? { background: t.color, color: '#fff', borderColor: t.color }
                      : { borderColor: t.color, color: t.color }}
                  >
                    {t.name}
                  </button>
                ))}
                {tags.length === 0 && <span className="text-xs text-slate-400 italic">Aucun tag</span>}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition">
              Annuler
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {loading ? 'Import…' : 'Importer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Permissions ────────────────────────────────────────────────────────

interface OrgNode { id: string; name: string; role: string }
interface Dept    { id: number; name: string }
interface Project { id: string; name: string }

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur', RH: 'Ressources Humaines',
  MANAGER: 'Manager', EMPLOYE: 'Employé',
};
const ROLE_KEYS = ['ADMIN', 'RH', 'MANAGER', 'EMPLOYE'];
const TYPE_LABELS: Record<string, string> = {
  ROLE: 'Rôle', USER: 'Utilisateur', DEPARTMENT: 'Département', PROJECT: 'Projet',
};

function PermissionsModal({ doc, onClose, onSuccess }: {
  doc: Document; onClose: () => void; onSuccess: () => void;
}) {
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE' | 'RESTRICTED'>(doc.visibility ?? 'PUBLIC');
  const [permissions, setPermissions] = useState<Array<{ type: string; value: string }>>(
    (doc.permissions ?? []).map(({ type, value }) => ({ type, value }))
  );
  const [addType, setAddType] = useState('ROLE');
  const [addValue, setAddValue] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: orgNodes = [] } = useQuery<OrgNode[]>({
    queryKey: ['orgchart'],
    queryFn: () => api.get('/api/hr/orgchart').then((r) => r.data),
    staleTime: 120_000,
  });

  const { data: departments = [] } = useQuery<Dept[]>({
    queryKey: ['hr-departments'],
    queryFn: () => api.get('/api/hr/departments').then((r) => r.data),
    staleTime: 120_000,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/api/projects').then((r) => r.data),
    staleTime: 120_000,
  });

  function getValueOptions(): Array<{ value: string; label: string }> {
    switch (addType) {
      case 'ROLE':       return ROLE_KEYS.map((k) => ({ value: k, label: ROLE_LABELS[k] ?? k }));
      case 'USER':       return orgNodes.map((u) => ({ value: u.id, label: u.name }));
      case 'DEPARTMENT': return departments.map((d) => ({ value: String(d.id), label: d.name }));
      case 'PROJECT':    return projects.map((p) => ({ value: p.id, label: p.name }));
      default:           return [];
    }
  }

  function getPermLabel(type: string, value: string): string {
    switch (type) {
      case 'ROLE':       return ROLE_LABELS[value] ?? value;
      case 'USER':       return orgNodes.find((u) => u.id === value)?.name ?? value;
      case 'DEPARTMENT': return departments.find((d) => String(d.id) === value)?.name ?? value;
      case 'PROJECT':    return projects.find((p) => p.id === value)?.name ?? value;
      default:           return value;
    }
  }

  const TYPE_ICON: Record<string, string> = {
    ROLE: '🎭', USER: '👤', DEPARTMENT: '🏢', PROJECT: '📁',
  };

  function addPerm() {
    if (!addValue) return;
    if (permissions.some((p) => p.type === addType && p.value === addValue)) return;
    setPermissions((prev) => [...prev, { type: addType, value: addValue }]);
    setAddValue('');
  }

  function removePerm(idx: number) {
    setPermissions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/api/documents/${doc.id}/permissions`, { visibility, permissions });
      toast.success('Permissions enregistrées');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  const VIS_OPTS: Array<{ key: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED'; icon: string; label: string; desc: string }> = [
    { key: 'PUBLIC',     icon: '🌐', label: 'Public',    desc: 'Visible par tous les utilisateurs' },
    { key: 'PRIVATE',    icon: '🔒', label: 'Privé',     desc: 'Vous seul et les administrateurs' },
    { key: 'RESTRICTED', icon: '🔐', label: 'Restreint', desc: 'Selon les règles définies ci-dessous' },
  ];

  const valueOptions = getValueOptions();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Permissions du document</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{doc.title}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="space-y-5">
          {/* Visibility selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">Visibilité</label>
            <div className="space-y-2">
              {VIS_OPTS.map(({ key, icon, label, desc }) => (
                <button
                  key={key} type="button"
                  onClick={() => setVisibility(key)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                    visibility === key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${visibility === key ? 'text-blue-700' : 'text-slate-700'}`}>{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                  {visibility === key && (
                    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Rules — only for RESTRICTED */}
          {visibility === 'RESTRICTED' && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Règles d'accès
                <span className="ml-2 text-xs font-normal text-slate-400">(au moins une règle doit correspondre)</span>
              </label>

              {permissions.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  Aucune règle — seul le propriétaire et les admins pourront accéder au document.
                </p>
              ) : (
                <div className="space-y-2 mb-3">
                  {permissions.map((perm, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-base">{TYPE_ICON[perm.type]}</span>
                        <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                          {TYPE_LABELS[perm.type]}
                        </span>
                        <span className="text-slate-700">{getPermLabel(perm.type, perm.value)}</span>
                      </div>
                      <button onClick={() => removePerm(idx)} className="text-slate-400 hover:text-red-500 transition ml-2">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add rule */}
              <div className="flex gap-2 bg-slate-50 rounded-xl border border-slate-200 p-3">
                <select
                  value={addType}
                  onChange={(e) => { setAddType(e.target.value); setAddValue(''); }}
                  className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <select
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                  className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">— Sélectionner —</option>
                  {valueOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  type="button" onClick={addPerm} disabled={!addValue}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-xs transition"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition">
              Annuler
            </button>
            <button
              onClick={handleSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal prévisualisation ───────────────────────────────────────────────────

function PreviewModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const fileUrl = `${API}/files/${doc.filename}`;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-slate-800">{doc.title}</h2>
            <p className="text-xs text-slate-400">{doc.originalName} — {formatSize(doc.size)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadDocument(doc.id, doc.originalName)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
            >
              <Download size={14} /> Télécharger
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-2"><X size={20} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {doc.mimeType === 'application/pdf' ? (
            <iframe src={fileUrl} className="w-full h-full border-0" title={doc.title} />
          ) : doc.mimeType.startsWith('image/') ? (
            <div className="h-full flex items-center justify-center bg-slate-50 p-4">
              <img src={fileUrl} alt={doc.title} className="max-h-full max-w-full object-contain rounded-lg shadow" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Gestion catégories ───────────────────────────────────────────────────────

function CategoryManager({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');

  const createMut = useMutation({
    mutationFn: (data: { name: string; color: string }) => api.post('/api/categories', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setName(''); toast.success('Catégorie créée'); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: () => toast.error('Impossible de supprimer (documents associés ?)'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800">Gérer les catégories</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate({ name, color }); }} className="flex gap-2 mb-5">
          <input className="input flex-1" placeholder="Nouvelle catégorie…" value={name} required onChange={(e) => setName(e.target.value)} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded border border-slate-300 cursor-pointer" />
          <button type="submit" className="bg-blue-600 text-white px-3 rounded-lg hover:bg-blue-700 transition"><Plus size={16} /></button>
        </form>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                <span className="text-sm text-slate-700">{cat.name}</span>
                <span className="text-xs text-slate-400">({cat._count?.documents ?? 0})</span>
              </div>
              <button onClick={() => deleteMut.mutate(cat.id)} className="text-slate-400 hover:text-red-500 transition">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Gestion tags ─────────────────────────────────────────────────────────────

function TagManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6B7280');

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: async () => (await api.get('/api/tags')).data,
  });

  const createMut = useMutation({
    mutationFn: (data: { name: string; color: string }) => api.post('/api/tags', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); setName(''); toast.success('Tag créé'); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/tags/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800">Gérer les tags</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate({ name, color }); }} className="flex gap-2 mb-5">
          <input className="input flex-1" placeholder="Nouveau tag…" value={name} required onChange={(e) => setName(e.target.value)} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded border border-slate-300 cursor-pointer" />
          <button type="submit" className="bg-blue-600 text-white px-3 rounded-lg hover:bg-blue-700 transition"><Plus size={16} /></button>
        </form>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          {tags.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-sm" style={{ borderColor: t.color, color: t.color }}>
              {t.name}
              <button onClick={() => deleteMut.mutate(t.id)} className="hover:opacity-60 transition"><X size={11} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
