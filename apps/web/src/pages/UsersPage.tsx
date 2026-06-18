import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Users2, Plus, Pencil, UserX, UserCheck, Loader2, Users,
  Search, X, Check, ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '@pfe/shared';
import { ROLES } from '@pfe/shared';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  position: string | null;
  department: string | null;
  hireDate: string | null;
  employeeId: string | null;
}

interface UserFormData {
  email: string;
  fullName: string;
  role: Role;
  password: string;
  position: string;
  departmentId: string;
  managerId: string;
  hireDate: string;
}

interface Employee {
  id: string;
  userId: string;
  managerId: string | null;
  position: string;
  user: { id: string; fullName: string; email: string; role: { name: string } };
  department?: { id: number; name: string } | null;
}

interface Department { id: number; name: string }

const ROLE_COLORS: Record<Role, string> = {
  ADMIN:   'bg-red-100 text-red-700',
  RH:      'bg-purple-100 text-purple-700',
  MANAGER: 'bg-amber-100 text-amber-700',
  EMPLOYE: 'bg-green-100 text-green-700',
};

export default function UsersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user: me } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<UserFormData>({
    email: '', fullName: '', role: 'EMPLOYE', password: '',
    position: '', departmentId: '', managerId: '', hireDate: '',
  });

  // Filters
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [supervisionManager, setSupervisionManager] = useState<UserRow | null>(null);

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/api/users')).data,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/api/hr/departments')).data,
  });

  const { data: allUsers = [] } = useQuery<UserRow[]>({
    queryKey: ['users-managers'],
    queryFn: async () => (await api.get('/api/users')).data,
    enabled: showForm,
  });

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilisateur créé');
      closeForm();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/api/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  function openCreate() {
    setForm({ email: '', fullName: '', role: 'EMPLOYE', password: '', position: '', departmentId: '', managerId: '', hireDate: '' });
    setShowForm(true);
  }
  function closeForm() { setShowForm(false); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate({
      email: form.email,
      password: form.password,
      fullName: form.fullName,
      role: form.role,
      position: form.position || undefined,
      departmentId: form.departmentId ? Number(form.departmentId) : undefined,
      managerId: form.managerId || undefined,
      hireDate: form.hireDate ? new Date(form.hireDate).toISOString() : undefined,
    });
  }

  // Available roles for create form: RH cannot create ADMIN
  const availableRoles = me?.role === 'RH' ? ROLES.filter((r) => r !== 'ADMIN') : ROLES;
  const managers = users.filter((u) => u.role === 'MANAGER' && u.isActive);

  // Filtered + searched list
  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        if (!u.fullName.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      }
      if (filterRole && u.role !== filterRole) return false;
      if (filterDept && u.department !== filterDept) return false;
      if (filterStatus === 'actif' && !u.isActive) return false;
      if (filterStatus === 'inactif' && u.isActive) return false;
      return true;
    });
  }, [users, search, filterRole, filterDept, filterStatus]);

  const uniqueDepts = useMemo(() => {
    const s = new Set(users.map((u) => u.department).filter(Boolean) as string[]);
    return [...s].sort();
  }, [users]);

  const hasFilters = search || filterRole || filterDept || filterStatus;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users2 className="text-blue-600" size={24} />
          <h1 className="text-2xl font-bold text-slate-800">Utilisateurs</h1>
          <span className="text-sm text-slate-400">{users.length} compte{users.length !== 1 ? 's' : ''}</span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} /> Nouvel utilisateur
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher nom ou email…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tous les départements</option>
          {uniqueDepts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tous les statuts</option>
          <option value="actif">Actif</option>
          <option value="inactif">Désactivé</option>
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setFilterRole(''); setFilterDept(''); setFilterStatus(''); }}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 px-2">
            <X size={14} /> Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-blue-500" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-slate-400 text-sm">
            {hasFilters ? 'Aucun utilisateur ne correspond aux filtres.' : 'Aucun utilisateur.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Nom</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Rôle</th>
                <th className="px-5 py-3 font-medium">Poste / Département</th>
                <th className="px-5 py-3 font-medium">Embauche</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => navigate(`/users/${u.id}`)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3.5 font-medium text-slate-700">{u.fullName}</td>
                  <td className="px-5 py-3.5 text-slate-500">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">
                    <div className="text-slate-700 text-xs">{u.position ?? '—'}</div>
                    {u.department && <div className="text-slate-400 text-xs">{u.department}</div>}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">
                    {u.hireDate ? new Date(u.hireDate).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {u.isActive ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {u.role === 'MANAGER' && (
                        <button
                          onClick={() => setSupervisionManager(u)}
                          className="p-1.5 rounded hover:bg-amber-50 text-amber-500 hover:text-amber-700 transition"
                          title="Gérer les employés supervisés"
                        >
                          <Users size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/users/${u.id}`)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition"
                        title="Modifier"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleMut.mutate({ id: u.id, isActive: !u.isActive })}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition"
                        title={u.isActive ? 'Désactiver' : 'Réactiver'}
                      >
                        {u.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                      <ChevronRight size={14} className="text-slate-300 ml-1" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Supervision panel */}
      {managers.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="text-amber-500" size={18} />
            <h2 className="text-base font-semibold text-slate-700">Supervision Managers</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {managers.map((m) => (
              <button key={m.id} onClick={() => setSupervisionManager(m)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-sm text-amber-800 transition">
                <Users size={14} /> {m.fullName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-7 overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-bold text-slate-800 mb-5">Nouvel utilisateur</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nom complet" className="col-span-2">
                  <input className="input" value={form.fullName} required
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </Field>
                <Field label="Email" className="col-span-2">
                  <input type="email" className="input" value={form.email} required
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Mot de passe">
                  <input type="password" className="input" value={form.password} required minLength={6}
                    onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </Field>
                <Field label="Rôle">
                  <select className="input" value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                    {availableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </div>

              <hr className="border-slate-100" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Profil employé</p>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Poste" className="col-span-2">
                  <input className="input" value={form.position} placeholder="ex : Développeur Full Stack"
                    onChange={(e) => setForm({ ...form, position: e.target.value })} />
                </Field>
                <Field label="Département">
                  <select className="input" value={form.departmentId}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                    <option value="">— Aucun</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Manager">
                  <select className="input" value={form.managerId}
                    onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                    <option value="">— Aucun</option>
                    {allUsers.filter((u) => u.role === 'MANAGER' && u.isActive).map((m) => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Date d'embauche" className="col-span-2">
                  <input type="date" className="input" value={form.hireDate}
                    onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
                </Field>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition">
                  Annuler
                </button>
                <button type="submit" disabled={createMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition">
                  {createMut.isPending && <Loader2 size={14} className="animate-spin" />}
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {supervisionManager && (
        <SupervisionModal manager={supervisionManager} onClose={() => setSupervisionManager(null)} />
      )}
    </div>
  );
}

// ─── SupervisionModal ─────────────────────────────────────────────────────────

function SupervisionModal({ manager, onClose }: { manager: UserRow; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: allEmployees = [], isLoading: loadingAll } = useQuery<Employee[]>({
    queryKey: ['hr-employees'],
    queryFn: async () => (await api.get('/api/hr/employees')).data,
  });

  const { data: supervised = [], isLoading: loadingSupervised } = useQuery<Employee[]>({
    queryKey: ['supervised-employees', manager.id],
    queryFn: async () => (await api.get(`/api/users/${manager.id}/supervised-employees`)).data,
  });

  const assignMut = useMutation({
    mutationFn: ({ employeeId, managerId }: { employeeId: string; managerId: string | null }) =>
      api.put(`/api/hr/employees/${employeeId}`, { managerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervised-employees', manager.id] });
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const isLoading = loadingAll || loadingSupervised;
  const supervisedIds = new Set(supervised.map((e) => e.id));
  const eligibleEmployees = allEmployees.filter((e) => !e.managerId || e.managerId === manager.id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Employés supervisés</h2>
            <p className="text-xs text-slate-400 mt-0.5">Manager : {manager.fullName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={24} /></div>
          ) : eligibleEmployees.length === 0 ? (
            <p className="text-slate-400 text-sm italic text-center py-8">Aucun employé disponible.</p>
          ) : (
            <div className="space-y-2">
              {eligibleEmployees.map((emp) => {
                const isChecked = supervisedIds.has(emp.id);
                return (
                  <button key={emp.id} onClick={() => assignMut.mutate({ employeeId: emp.id, managerId: isChecked ? null : manager.id })}
                    disabled={assignMut.isPending}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left ${isChecked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-700'}`}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 ${isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                      {isChecked && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{emp.user.fullName}</p>
                      <p className="text-xs text-slate-400 truncate">{emp.user.email}{emp.department ? ` · ${emp.department.name}` : ''} · {emp.position}</p>
                    </div>
                    {isChecked && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full shrink-0">Supervisé</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center">
          <p className="text-xs text-slate-400">{supervised.length} supervisé{supervised.length !== 1 ? 's' : ''}</p>
          <button onClick={onClose} className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition">Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
