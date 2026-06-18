import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { User, Briefcase, Lock, Save, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface MyProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  employee: {
    position: string | null;
    phone: string | null;
    address: string | null;
    birthDate: string | null;
    hireDate: string | null;
    department: { name: string } | null;
    manager: { fullName: string } | null;
  } | null;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur',
  RH: 'Ressources Humaines',
  MANAGER: 'Manager',
  EMPLOYE: 'Employé',
};

export default function ProfilePage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const [contactForm, setContactForm] = useState({ phone: '', address: '' });
  const [pwdForm, setPwdForm] = useState({ password: '', confirm: '' });
  const [contactDirty, setContactDirty] = useState(false);

  const { data: profile, isLoading } = useQuery<MyProfile>({
    queryKey: ['my-profile'],
    queryFn: async () => (await api.get('/api/users/me')).data,
  });

  useEffect(() => {
    if (!profile) return;
    setContactForm({
      phone:   profile.employee?.phone   ?? '',
      address: profile.employee?.address ?? '',
    });
    setContactDirty(false);
  }, [profile]);

  const contactMut = useMutation({
    mutationFn: (data: { phone: string | null; address: string | null }) =>
      api.put('/api/users/me', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      toast.success('Coordonnées mises à jour');
      setContactDirty(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  const pwdMut = useMutation({
    mutationFn: (data: { password: string }) => api.put('/api/users/me', data),
    onSuccess: () => {
      toast.success('Mot de passe modifié');
      setPwdForm({ password: '', confirm: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  });

  function handleContactSave(e: React.FormEvent) {
    e.preventDefault();
    contactMut.mutate({
      phone:   contactForm.phone   || null,
      address: contactForm.address || null,
    });
  }

  function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (pwdForm.password !== pwdForm.confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    pwdMut.mutate({ password: pwdForm.password });
  }

  if (isLoading || !profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={28} />
      </div>
    );
  }

  const emp = profile.employee;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <User className="text-blue-600" size={24} />
        <h1 className="text-2xl font-bold text-slate-800">Mon profil</h1>
      </div>

      <div className="space-y-6">

        {/* Identity card — read-only */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Briefcase size={16} className="text-violet-500" />
            <h2 className="font-semibold text-slate-700">Informations professionnelles</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <ReadField label="Nom complet"      value={profile.fullName} />
            <ReadField label="Email"            value={profile.email} />
            <ReadField label="Rôle"             value={ROLE_LABELS[profile.role] ?? profile.role} />
            <ReadField label="Poste"            value={emp?.position ?? '—'} />
            <ReadField label="Département"      value={emp?.department?.name ?? '—'} />
            <ReadField label="Manager"          value={emp?.manager?.fullName ?? '—'} />
            <ReadField label="Date d'embauche"  value={emp?.hireDate ? new Date(emp.hireDate).toLocaleDateString('fr-FR') : '—'} />
            <ReadField label="Date de naissance" value={emp?.birthDate ? new Date(emp.birthDate).toLocaleDateString('fr-FR') : '—'} />
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Ces informations sont gérées par votre responsable RH ou un administrateur.
          </p>
        </section>

        {/* Contact — editable */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <User size={16} className="text-blue-500" />
            <h2 className="font-semibold text-slate-700">Coordonnées</h2>
          </div>
          <form onSubmit={handleContactSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Téléphone">
                <input className="input" value={contactForm.phone} placeholder="+212 6xx xxx xxx"
                  onChange={(e) => { setContactForm({ ...contactForm, phone: e.target.value }); setContactDirty(true); }} />
              </Field>
              <Field label="Adresse">
                <input className="input" value={contactForm.address} placeholder="Ville, Pays"
                  onChange={(e) => { setContactForm({ ...contactForm, address: e.target.value }); setContactDirty(true); }} />
              </Field>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={contactMut.isPending || !contactDirty}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition">
                {contactMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Enregistrer
              </button>
            </div>
          </form>
        </section>

        {/* Change password */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock size={16} className="text-slate-500" />
            <h2 className="font-semibold text-slate-700">Changer le mot de passe</h2>
          </div>
          <form onSubmit={handlePasswordSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nouveau mot de passe">
                <input type="password" className="input" value={pwdForm.password} required minLength={6}
                  placeholder="••••••••"
                  onChange={(e) => setPwdForm({ ...pwdForm, password: e.target.value })} />
              </Field>
              <Field label="Confirmer le mot de passe">
                <input type="password" className="input" value={pwdForm.confirm} required minLength={6}
                  placeholder="••••••••"
                  onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={pwdMut.isPending || !pwdForm.password}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition">
                {pwdMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                Modifier le mot de passe
              </button>
            </div>
          </form>
        </section>

      </div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="font-medium text-slate-700">{value}</p>
    </div>
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
