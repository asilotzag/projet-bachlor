import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Save, Loader2, UserX, UserCheck,
  ClipboardList, CalendarOff, FileText, Clock,
  User, Briefcase,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '@pfe/shared';
import { ROLES } from '@pfe/shared';

interface Department { id: number; name: string }
interface UserDetail {
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
  employee: {
    id: string;
    position: string;
    phone: string | null;
    address: string | null;
    birthDate: string | null;
    hireDate: string;
    departmentId: number | null;
    managerId: string | null;
    department: { id: number; name: string } | null;
    manager: { id: string; fullName: string } | null;
  } | null;
}

const ROLE_COLORS: Record<Role, string> = {
  ADMIN:   'bg-red-100 text-red-700',
  RH:      'bg-purple-100 text-purple-700',
  MANAGER: 'bg-amber-100 text-amber-700',
  EMPLOYE: 'bg-green-100 text-green-700',
};

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user: me } = useAuth();

  const [accountForm, setAccountForm] = useState({ fullName: '', role: 'EMPLOYE' as Role, password: '' });
  const [empForm, setEmpForm] = useState({
    position: '', phone: '', address: '', birthDate: '', hireDate: '',
    departmentId: '', managerId: '',
  });
  const [dirty, setDirty] = useState(false);

  const { data: user, isLoading } = useQuery<UserDetail>({
    queryKey: ['user', id],
    queryFn: async () => (await api.get(`/api/users/${id}`)).data,
    enabled: !!id,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/api/hr/departments')).data,
  });

  const { data: managers = [] } = useQuery<{ id: string; fullName: string; role: Role }[]>({
    queryKey: ['users-list-light'],
    queryFn: async () => (await api.get('/api/users')).data,
    select: (data) => data.filter((u: any) => u.role === 'MANAGER' && u.isActive),
  });

  useEffect(() => {
    if (!user) return;
    setAccountForm({ fullName: user.fullName, role: user.role, password: '' });
    setEmpForm({
      position:     user.employee?.position ?? '',
      phone:        user.employee?.phone ?? '',
      address:      user.employee?.address ?? '',
      birthDate:    user.employee?.birthDate ? user.employee.birthDate.slice(0, 10) : '',
      hireDate:     user.employee?.hireDate ? user.employee.hireDate.slice(0, 10) : '',
      departmentId: user.employee?.departmentId ? String(user.employee.departmentId) : '',
      managerId:    user.employee?.managerId ?? '',
    });
    setDirty(false);
  }, [user]);

  const saveMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/api/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user', id] });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Modifications enregistrées');
      setDirty(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const toggleMut = useMutation({
    mutationFn: (isActive: boolean) => api.put(`/api/users/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user', id] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      fullName: accountForm.fullName,
      role:     accountForm.role,
      position:     empForm.position || undefined,
      phone:        empForm.phone || null,
      address:      empForm.address || null,
      birthDate:    empForm.birthDate ? new Date(empForm.birthDate).toISOString() : null,
      hireDate:     empForm.hireDate ? new Date(empForm.hireDate).toISOString() : null,
      departmentId: empForm.departmentId ? Number(empForm.departmentId) : null,
      managerId:    empForm.managerId || null,
    };
    if (accountForm.password) payload.password = accountForm.password;
    saveMut.mutate(payload);
  }

  // Available roles: RH cannot assign ADMIN
  const availableRoles = me?.role === 'RH' ? ROLES.filter((r) => r !== 'ADMIN') : ROLES;
  // RH cannot edit ADMIN accounts' role
  const canEditRole = me?.role === 'ADMIN' || user?.role !== 'ADMIN';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={28} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center text-slate-500">
        Utilisateur introuvable.{' '}
        <button onClick={() => navigate('/users')} className="text-blue-600 underline">Retour</button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/users')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">{user.fullName}</h1>
            <span className={`px-2.5 py-0.5 text-xs rounded-full font-medium ${ROLE_COLORS[user.role]}`}>{user.role}</span>
            <span className={`px-2.5 py-0.5 text-xs rounded-full ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
              {user.isActive ? 'Actif' : 'Désactivé'}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">{user.email}</p>
        </div>
        <button
          onClick={() => toggleMut.mutate(!user.isActive)}
          disabled={toggleMut.isPending}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${user.isActive
            ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
          {toggleMut.isPending ? <Loader2 size={14} className="animate-spin" /> :
            user.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
          {user.isActive ? 'Désactiver' : 'Réactiver'}
        </button>
      </div>

      <form onSubmit={handleSave} onChange={() => setDirty(true)}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Account info */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <User size={16} className="text-blue-500" />
              <h2 className="font-semibold text-slate-700">Compte</h2>
            </div>
            <div className="space-y-4">
              <Field label="Nom complet">
                <input className="input" value={accountForm.fullName} required
                  onChange={(e) => setAccountForm({ ...accountForm, fullName: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className="input bg-slate-50" value={user.email} readOnly />
              </Field>
              <Field label="Rôle">
                {canEditRole ? (
                  <select className="input" value={accountForm.role}
                    onChange={(e) => setAccountForm({ ...accountForm, role: e.target.value as Role })}>
                    {availableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <input className="input bg-slate-50" value={user.role} readOnly />
                )}
              </Field>
              <Field label="Nouveau mot de passe">
                <input type="password" className="input" value={accountForm.password} minLength={6}
                  placeholder="Laisser vide pour ne pas changer"
                  onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} />
              </Field>
              <p className="text-xs text-slate-400">
                Membre depuis le {new Date(user.createdAt).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </section>

          {/* Employee profile */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Briefcase size={16} className="text-violet-500" />
              <h2 className="font-semibold text-slate-700">Profil employé</h2>
            </div>
            <div className="space-y-4">
              <Field label="Poste">
                <input className="input" value={empForm.position}
                  onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Département">
                  <select className="input" value={empForm.departmentId}
                    onChange={(e) => setEmpForm({ ...empForm, departmentId: e.target.value })}>
                    <option value="">— Aucun</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Manager">
                  <select className="input" value={empForm.managerId}
                    onChange={(e) => setEmpForm({ ...empForm, managerId: e.target.value })}>
                    <option value="">— Aucun</option>
                    {managers.filter((m) => m.id !== id).map((m) => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Téléphone">
                <input className="input" value={empForm.phone}
                  onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} />
              </Field>
              <Field label="Adresse">
                <input className="input" value={empForm.address}
                  onChange={(e) => setEmpForm({ ...empForm, address: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date de naissance">
                  <input type="date" className="input" value={empForm.birthDate}
                    onChange={(e) => setEmpForm({ ...empForm, birthDate: e.target.value })} />
                </Field>
                <Field label="Date d'embauche">
                  <input type="date" className="input" value={empForm.hireDate}
                    onChange={(e) => setEmpForm({ ...empForm, hireDate: e.target.value })} />
                </Field>
              </div>
            </div>
          </section>
        </div>

        {/* Save bar */}
        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={saveMut.isPending || !dirty}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm px-6 py-2.5 rounded-lg transition">
            {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Enregistrer les modifications
          </button>
        </div>
      </form>

      {/* Quick links */}
      {user.employeeId && (
        <section className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-700 mb-4">Accès rapide</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickLink to={`/tasks?userId=${user.id}`} icon={<ClipboardList size={16} />} label="Tâches" color="blue" />
            <QuickLink to={`/hr?tab=leaves&userId=${user.id}`} icon={<CalendarOff size={16} />} label="Congés" color="amber" />
            <QuickLink to={`/hr?tab=contracts&employeeId=${user.employeeId}`} icon={<FileText size={16} />} label="Contrats" color="violet" />
            <QuickLink to={`/attendance?employeeId=${user.employeeId}`} icon={<Clock size={16} />} label="Assiduité" color="emerald" />
          </div>
        </section>
      )}
    </div>
  );
}

function QuickLink({ to, icon, label, color }: { to: string; icon: React.ReactNode; label: string; color: string }) {
  const colors: Record<string, string> = {
    blue:    'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200',
    amber:   'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200',
    violet:  'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200',
    emerald: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return (
    <Link to={to} className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition ${colors[color]}`}>
      {icon} {label}
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
