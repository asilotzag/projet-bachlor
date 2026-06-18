import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Users2, Plus, Loader2, UserCheck, UserX, Calendar,
  Briefcase, Clock, CheckCircle, XCircle, AlertCircle, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import AccessDenied from '../components/ui/AccessDenied';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Department { id: number; name: string; _count?: { employees: number } }
interface Employee {
  id: string; position: string; phone?: string; hireDate: string;
  user: { id: string; fullName: string; email: string; role: { name: string } };
  department?: Department;
  contracts: Contract[];
}
interface Contract {
  id: number; type: string; startDate: string; endDate?: string;
  salary?: number; isActive: boolean;
}
interface LeaveRequest {
  id: number; type: string; startDate: string; endDate: string;
  reason?: string; status: string; createdAt: string;
  employee: { user: { fullName: string } };
  approvedBy?: { fullName: string };
}
interface Attendance {
  id: number; date: string; status: string; checkIn?: string; checkOut?: string;
  employee: { user: { fullName: string } };
}
// ─── Config ───────────────────────────────────────────────────────────────────

const CONTRACT_LABELS: Record<string, string> = {
  CDI: 'CDI', CDD: 'CDD', STAGE: 'Stage', FREELANCE: 'Freelance', APPRENTISSAGE: 'Apprentissage',
};
const LEAVE_LABELS: Record<string, string> = {
  CONGE_PAYE: 'Congé payé', CONGE_SANS_SOLDE: 'Sans solde', MALADIE: 'Maladie',
  MATERNITE: 'Maternité', PATERNITE: 'Paternité', AUTRE: 'Autre',
};
const STATUS_STYLES: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  EN_ATTENTE: { label: 'En attente', cls: 'bg-amber-100 text-amber-700',  icon: <AlertCircle size={12} /> },
  APPROUVE:   { label: 'Approuvé',   cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={12} /> },
  REFUSE:     { label: 'Refusé',     cls: 'bg-red-100 text-red-600',      icon: <XCircle size={12} /> },
};
const ATTEND_STYLES: Record<string, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  ABSENT:  'bg-red-100 text-red-700',
  RETARD:  'bg-amber-100 text-amber-700',
  DEMI_JOURNEE: 'bg-blue-100 text-blue-700',
};

type Tab = 'employees' | 'leaves' | 'attendance';

// ─── Page principale ──────────────────────────────────────────────────────────

export default function HRPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'EMPLOYE';
  const [tab, setTab] = useState<Tab>(role === 'EMPLOYE' ? 'leaves' : 'employees');
  const isHRAdmin = role === 'ADMIN' || role === 'RH';
  const isManager = role === 'MANAGER';

  const allTabs: { id: Tab; label: string; icon: React.ReactNode; roles?: string[] }[] = [
    { id: 'employees',  label: 'Employés',  icon: <Users2 size={15} /> },
    { id: 'leaves',     label: 'Congés',    icon: <Calendar size={15} /> },
    { id: 'attendance', label: 'Présence',  icon: <Clock size={15} /> },
  ];

  // EMPLOYE only sees Congés (own leaves)
  const tabs = role === 'EMPLOYE'
    ? allTabs.filter((t) => t.id === 'leaves')
    : allTabs;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Users2 className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-slate-800 flex-1">Ressources Humaines</h1>
      </div>

      {/* Onglets */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-auto">
        {tab === 'employees'  && <EmployeesTab isHRAdmin={isHRAdmin} />}
        {tab === 'leaves'     && <LeavesTab isHRAdmin={isHRAdmin} />}
        {tab === 'attendance' && <AttendanceTab isHRAdmin={isHRAdmin} isManager={isManager} />}
      </div>
    </div>
  );
}

// ─── Onglet Employés ──────────────────────────────────────────────────────────

function EmployeesTab({ isHRAdmin }: { isHRAdmin: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  const { data: employees = [], isLoading, error } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => (await api.get('/api/hr/employees')).data,
  });

  if ((error as any)?.response?.status === 403) return <AccessDenied />;
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/api/hr/departments')).data,
  });
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500">{employees.length} employé{employees.length !== 1 ? 's' : ''}</p>
        {isHRAdmin && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            <Plus size={15} /> Créer un compte
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : employees.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users2 size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm">Aucun profil employé. {isHRAdmin ? 'Ajoutez le premier !' : ''}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employees.map((emp) => (
            <div key={emp.id} className="bg-white rounded-xl border border-slate-200 hover:shadow-md transition p-5 cursor-pointer" onClick={() => setSelectedEmp(emp)}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                  {emp.user.fullName[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{emp.user.fullName}</p>
                  <p className="text-xs text-slate-500">{emp.position}</p>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                {emp.department && <p className="flex items-center gap-1"><Briefcase size={11} /> {emp.department.name}</p>}
                {emp.contracts[0] && (
                  <p className="flex items-center gap-1">
                    <UserCheck size={11} />
                    <span className="font-medium text-emerald-600">{CONTRACT_LABELS[emp.contracts[0].type]}</span>
                  </p>
                )}
                <p>Embauché le {new Date(emp.hireDate).toLocaleDateString('fr-FR')}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal fiche employé */}
      {selectedEmp && (
        <EmployeeDetailModal
          employee={selectedEmp}
          departments={departments}
          isHRAdmin={isHRAdmin}
          onClose={() => setSelectedEmp(null)}
          onUpdate={() => qc.invalidateQueries({ queryKey: ['employees'] })}
        />
      )}

      {/* Modal ajout profil */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <EmployeeCreateForm
            departments={departments}
            onClose={() => setShowForm(false)}
            onSuccess={() => qc.invalidateQueries({ queryKey: ['employees'] })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Détail employé ───────────────────────────────────────────────────────────

function EmployeeDetailModal({ employee, departments, isHRAdmin, onClose, onUpdate }: {
  employee: Employee; departments: Department[];
  isHRAdmin: boolean; onClose: () => void; onUpdate: () => void;
}) {
  const qc = useQueryClient();
  const [showContract, setShowContract] = useState(false);
  const [contractForm, setContractForm] = useState({ type: 'CDI', startDate: '', salary: '', notes: '' });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ['contracts', employee.id],
    queryFn: async () => (await api.get(`/api/hr/employees/${employee.id}/contracts`)).data,
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => api.put(`/api/hr/employees/${employee.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); onUpdate(); toast.success('Mis à jour'); },
  });

  const addContractMut = useMutation({
    mutationFn: (data: any) => api.post(`/api/hr/employees/${employee.id}/contracts`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts', employee.id] }); setShowContract(false); toast.success('Contrat ajouté'); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              {employee.user.fullName[0].toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-slate-800">{employee.user.fullName}</h2>
              <p className="text-xs text-slate-500">{employee.user.email}</p>
            </div>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Infos générales */}
          <section>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Informations</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Poste</label>
                {isHRAdmin
                  ? <input className="input text-sm" defaultValue={employee.position} onBlur={(e) => updateMut.mutate({ position: e.target.value })} />
                  : <p className="text-sm text-slate-700">{employee.position}</p>}
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Département</label>
                {isHRAdmin
                  ? (
                    <select className="input text-sm" defaultValue={employee.department?.id ?? ''} onChange={(e) => updateMut.mutate({ departmentId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— Aucun —</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )
                  : <p className="text-sm text-slate-700">{employee.department?.name ?? '—'}</p>}
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Téléphone</label>
                {isHRAdmin
                  ? <input className="input text-sm" defaultValue={employee.phone ?? ''} onBlur={(e) => updateMut.mutate({ phone: e.target.value || null })} />
                  : <p className="text-sm text-slate-700">{employee.phone ?? '—'}</p>}
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Date d'embauche</label>
                <p className="text-sm text-slate-700">{new Date(employee.hireDate).toLocaleDateString('fr-FR')}</p>
              </div>
            </div>
          </section>

          {/* Contrats */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Contrats</h3>
              {isHRAdmin && <button onClick={() => setShowContract(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus size={12} /> Ajouter</button>}
            </div>
            {contracts.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Aucun contrat enregistré.</p>
            ) : (
              <div className="space-y-2">
                {contracts.map((c) => (
                  <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border text-sm ${c.isActive ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                    <div>
                      <span className="font-medium">{CONTRACT_LABELS[c.type]}</span>
                      <span className="text-slate-400 ml-2 text-xs">
                        {new Date(c.startDate).toLocaleDateString('fr-FR')}
                        {c.endDate ? ` → ${new Date(c.endDate).toLocaleDateString('fr-FR')}` : ' (en cours)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.salary && <span className="text-xs text-slate-500">{c.salary.toLocaleString('fr-FR')} MAD</span>}
                      {c.isActive && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Actif</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showContract && (
              <form onSubmit={(e) => { e.preventDefault(); addContractMut.mutate({ ...contractForm, startDate: new Date(contractForm.startDate).toISOString(), salary: contractForm.salary ? Number(contractForm.salary) : null }); }} className="mt-3 p-4 border border-slate-200 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Type</label>
                    <select className="input text-sm" value={contractForm.type} onChange={(e) => setContractForm({ ...contractForm, type: e.target.value })}>
                      {Object.entries(CONTRACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Date début *</label>
                    <input type="date" className="input text-sm" required value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Salaire (MAD)</label>
                    <input type="number" className="input text-sm" value={contractForm.salary} onChange={(e) => setContractForm({ ...contractForm, salary: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowContract(false)} className="flex-1 py-2 rounded-lg border border-slate-300 text-sm text-slate-600">Annuler</button>
                  <button type="submit" disabled={addContractMut.isPending} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60">
                    {addContractMut.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Enregistrer'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Formulaire création employé (compte + profil) ────────────────────────────

function EmployeeCreateForm({ departments, onClose, onSuccess }: {
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', role: 'EMPLOYE',
    position: '', departmentId: '', phone: '', hireDate: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/api/hr/employees/full', data).then((r) => r.data),
    onSuccess: () => {
      toast.success('Compte et profil créés avec succès');
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur lors de la création'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate({
      fullName: form.fullName,
      email: form.email,
      password: form.password,
      role: form.role,
      position: form.position,
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      phone: form.phone || null,
      hireDate: form.hireDate ? new Date(form.hireDate).toISOString() : undefined,
    });
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-7 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Créer un compte</h2>
          <p className="text-xs text-slate-400 mt-0.5">Le compte sera actif immédiatement</p>
        </div>
        <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Section compte */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Informations du compte</p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom complet <span className="text-red-500">*</span></label>
            <input className="input" required placeholder="Ex: Sara Chraibi" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email <span className="text-red-500">*</span></label>
            <input className="input" type="email" required placeholder="sara@entreprise.com" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Mot de passe <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? 'text' : 'password'}
                required minLength={6}
                placeholder="Min. 6 caractères"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                {showPassword ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Rôle <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 gap-2">
              {(['EMPLOYE', 'MANAGER', 'RH'] as const).map((r) => (
                <button
                  key={r} type="button"
                  onClick={() => set('role', r)}
                  className={`py-2 rounded-lg border text-sm font-medium transition ${
                    form.role === r
                      ? r === 'EMPLOYE' ? 'bg-emerald-600 border-emerald-600 text-white'
                        : r === 'MANAGER' ? 'bg-amber-500 border-amber-500 text-white'
                        : 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {r === 'EMPLOYE' ? 'Employé' : r === 'MANAGER' ? 'Manager' : 'RH'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section profil */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Profil professionnel</p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Poste <span className="text-red-500">*</span></label>
            <input className="input" required placeholder="Ex: Développeur Full Stack" value={form.position} onChange={(e) => set('position', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Département</label>
              <select className="input" value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                <option value="">— Aucun —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date d'embauche</label>
              <input type="date" className="input" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Téléphone</label>
            <input className="input" placeholder="+212 6XX XXX XXX" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition">
            Annuler
          </button>
          <button type="submit" disabled={createMut.isPending} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60 transition">
            {createMut.isPending && <Loader2 size={14} className="animate-spin" />}
            {createMut.isPending ? 'Création…' : 'Créer le compte'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Onglet Congés ────────────────────────────────────────────────────────────

function LeavesTab({ isHRAdmin }: { isHRAdmin: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  const { data: leaves = [], isLoading, error } = useQuery<LeaveRequest[]>({
    queryKey: ['leaves', filterStatus],
    queryFn: async () => {
      const params = filterStatus ? `?status=${filterStatus}` : '';
      return (await api.get(`/api/hr/leaves${params}`)).data;
    },
  });

  if ((error as any)?.response?.status === 403) return <AccessDenied />;

  const approveMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.put(`/api/hr/leaves/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leaves'] }); toast.success('Demande mise à jour'); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const createLeaveMut = useMutation({
    mutationFn: (data: any) => api.post('/api/hr/leaves', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leaves'] }); toast.success('Demande envoyée !'); setShowForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <select className="input max-w-xs text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="EN_ATTENTE">En attente</option>
          <option value="APPROUVE">Approuvés</option>
          <option value="REFUSE">Refusés</option>
        </select>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition ml-auto">
          <Plus size={15} /> Demander un congé
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : leaves.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><Calendar size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm">Aucune demande de congé.</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Employé</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Période</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                {isHRAdmin && <th className="px-5 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaves.map((l) => {
                const st = STATUS_STYLES[l.status];
                const days = Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1;
                return (
                  <tr key={l.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3.5 font-medium text-slate-700">{l.employee.user.fullName}</td>
                    <td className="px-5 py-3.5 text-slate-500">{LEAVE_LABELS[l.type]}</td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {new Date(l.startDate).toLocaleDateString('fr-FR')} → {new Date(l.endDate).toLocaleDateString('fr-FR')}
                      <span className="ml-1 text-xs text-slate-400">({days}j)</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full w-fit font-medium ${st.cls}`}>
                        {st.icon} {st.label}
                      </span>
                    </td>
                    {isHRAdmin && (
                      <td className="px-5 py-3.5">
                        {l.status === 'EN_ATTENTE' && (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => approveMut.mutate({ id: l.id, status: 'APPROUVE' })} className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600 transition" title="Approuver">
                              <UserCheck size={15} />
                            </button>
                            <button onClick={() => approveMut.mutate({ id: l.id, status: 'REFUSE' })} className="p-1.5 rounded hover:bg-red-100 text-red-500 transition" title="Refuser">
                              <UserX size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal demande congé */}
      {showForm && (
        <LeaveForm
          onClose={() => setShowForm(false)}
          onSubmit={(data) => createLeaveMut.mutate(data)}
          isPending={createLeaveMut.isPending}
        />
      )}
    </div>
  );
}

function LeaveForm({ onClose, onSubmit, isPending }: { onClose: () => void; onSubmit: (d: any) => void; isPending: boolean }) {
  const [form, setForm] = useState({ type: 'CONGE_PAYE', startDate: '', endDate: '', reason: '' });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800">Demande de congé</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, startDate: new Date(form.startDate).toISOString(), endDate: new Date(form.endDate).toISOString() }); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Type de congé</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {Object.entries(LEAVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Début *</label>
              <input type="date" className="input" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fin *</label>
              <input type="date" className="input" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Motif</label>
            <textarea className="input resize-none" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600">Annuler</button>
            <button type="submit" disabled={isPending} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60">
              {isPending && <Loader2 size={14} className="animate-spin" />} Envoyer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Onglet Présence ──────────────────────────────────────────────────────────

function AttendanceTab({ isHRAdmin, isManager }: { isHRAdmin: boolean; isManager: boolean }) {
  const qc = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [empFilter, setEmpFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data: records = [], isLoading, error } = useQuery<Attendance[]>({
    queryKey: ['attendance', month, empFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ month });
      if (empFilter) params.set('employeeId', empFilter);
      return (await api.get(`/api/hr/attendance?${params}`)).data;
    },
  });

  // Load employees list for the filter dropdown (ADMIN, RH, MANAGER all see their scoped list)
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => (await api.get('/api/hr/employees')).data,
    enabled: isHRAdmin || isManager,
  });

  if ((error as any)?.response?.status === 403) return <AccessDenied />;

  const upsertMut = useMutation({
    mutationFn: (data: any) => api.post('/api/hr/attendance', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Présence enregistrée'); setShowForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const stats = {
    present: records.filter((r) => r.status === 'PRESENT').length,
    absent:  records.filter((r) => r.status === 'ABSENT').length,
    retard:  records.filter((r) => r.status === 'RETARD').length,
  };

  return (
    <div className="p-6">
      {/* Filtres & stats */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input type="month" className="input max-w-xs text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
        {(isHRAdmin || isManager) && (
          <select className="input max-w-xs text-sm" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
            <option value="">Tous les employés</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.user.fullName}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">{stats.present} présents</span>
          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">{stats.absent} absents</span>
          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{stats.retard} retards</span>
        </div>
        {isHRAdmin && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            <Plus size={15} /> Saisir présence
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><Clock size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm">Aucune donnée de présence pour cette période.</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Employé</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Arrivée</th>
                <th className="px-5 py-3 font-medium">Départ</th>
                <th className="px-5 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3.5 font-medium text-slate-700">{r.employee.user.fullName}</td>
                  <td className="px-5 py-3.5 text-slate-500">{new Date(r.date).toLocaleDateString('fr-FR')}</td>
                  <td className="px-5 py-3.5 text-slate-500">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-5 py-3.5 text-slate-500">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${ATTEND_STYLES[r.status]}`}>{r.status.replace('_', ' ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <AttendanceForm employees={employees} onClose={() => setShowForm(false)} onSubmit={(d) => upsertMut.mutate(d)} isPending={upsertMut.isPending} />
        </div>
      )}
    </div>
  );
}

function AttendanceForm({ employees, onClose, onSubmit, isPending }: {
  employees: Employee[]; onClose: () => void; onSubmit: (d: any) => void; isPending: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ employeeId: '', date: today, status: 'PRESENT', checkIn: '', checkOut: '', notes: '' });

  return (
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-800">Saisir une présence</h2>
        <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, checkIn: form.checkIn ? new Date(`${form.date}T${form.checkIn}`).toISOString() : null, checkOut: form.checkOut ? new Date(`${form.date}T${form.checkOut}`).toISOString() : null }); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Employé *</label>
          <select className="input" required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
            <option value="">— Sélectionner —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.user.fullName}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Date *</label>
            <input type="date" className="input" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Statut</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="PRESENT">Présent</option>
              <option value="ABSENT">Absent</option>
              <option value="RETARD">Retard</option>
              <option value="DEMI_JOURNEE">Demi-journée</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Arrivée</label>
            <input type="time" className="input" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Départ</label>
            <input type="time" className="input" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600">Annuler</button>
          <button type="submit" disabled={isPending} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60">
            {isPending && <Loader2 size={14} className="animate-spin" />} Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
