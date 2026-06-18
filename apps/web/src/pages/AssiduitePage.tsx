import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Clock, History, Save, Download, Loader2, Users2,
  CheckCircle, XCircle, AlertTriangle, Moon,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'RETARD' | 'DEMI_JOURNEE';

interface TodayRow {
  employeeId: string;
  fullName:   string;
  department: string | null;
  attendance: {
    id: number;
    status: AttendanceStatus;
    checkIn:  string | null;
    checkOut: string | null;
    notes:    string | null;
  } | null;
}

interface HistoryRecord {
  id:         number;
  date:       string;
  status:     AttendanceStatus;
  checkIn:    string | null;
  checkOut:   string | null;
  notes:      string | null;
  employee: {
    user:       { fullName: string };
    department: { name: string } | null;
  };
}

interface Department { id: number; name: string }
interface Employee   { id: string; user: { fullName: string } }

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AttendanceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PRESENT:     { label: 'Présent',      color: 'bg-emerald-100 text-emerald-700 ring-emerald-300', icon: <CheckCircle size={13} /> },
  ABSENT:      { label: 'Absent',       color: 'bg-red-100 text-red-700 ring-red-300',             icon: <XCircle size={13} /> },
  RETARD:      { label: 'Retard',       color: 'bg-amber-100 text-amber-700 ring-amber-300',       icon: <AlertTriangle size={13} /> },
  DEMI_JOURNEE:{ label: 'Demi-journée', color: 'bg-blue-100 text-blue-700 ring-blue-300',          icon: <Moon size={13} /> },
};

const ALL_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'RETARD', 'DEMI_JOURNEE'];

// ── Helper: time string from ISO ──────────────────────────────────────────────

function isoToTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function timeToISO(time: string, dateISO: string): string | null {
  if (!time) return null;
  return new Date(`${dateISO}T${time}:00.000Z`).toISOString();
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(records: HistoryRecord[]) {
  const headers = ['Employé', 'Département', 'Date', 'Statut', 'Arrivée', 'Départ', 'Note'];
  const rows = records.map((r) => [
    r.employee.user.fullName,
    r.employee.department?.name ?? '',
    new Date(r.date).toLocaleDateString('fr-FR'),
    STATUS_CFG[r.status].label,
    isoToTime(r.checkIn),
    isoToTime(r.checkOut),
    r.notes ?? '',
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `assiduité-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Row state ─────────────────────────────────────────────────────────────────

interface RowState {
  status:   AttendanceStatus;
  checkIn:  string;
  checkOut: string;
  notes:    string;
}

function initRow(row: TodayRow): RowState {
  const a = row.attendance;
  return {
    status:   (a?.status ?? 'PRESENT') as AttendanceStatus,
    checkIn:  isoToTime(a?.checkIn ?? null),
    checkOut: isoToTime(a?.checkOut ?? null),
    notes:    a?.notes ?? '',
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// TODAY TAB
// ════════════════════════════════════════════════════════════════════════════════

function TodayTab() {
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery<TodayRow[]>({
    queryKey: ['attendance-today'],
    queryFn: async () => (await api.get('/api/attendance/today')).data,
  });

  // form state: employeeId → RowState
  const [form, setForm] = useState<Record<string, RowState>>({});

  // initialise / re-sync whenever API data arrives
  useEffect(() => {
    if (rows.length === 0) return;
    setForm((prev) => {
      const next: Record<string, RowState> = {};
      for (const row of rows) {
        next[row.employeeId] = prev[row.employeeId] ?? initRow(row);
      }
      return next;
    });
  }, [rows]);

  const saveMut = useMutation({
    mutationFn: () =>
      api.post('/api/attendance/batch', {
        records: rows.map((row) => {
          const state = form[row.employeeId];
          const todayISO = new Date().toISOString().slice(0, 10);
          return {
            employeeId: row.employeeId,
            status:     state?.status ?? 'PRESENT',
            checkIn:    state?.checkIn  ? timeToISO(state.checkIn,  todayISO) : null,
            checkOut:   state?.checkOut ? timeToISO(state.checkOut, todayISO) : null,
            notes:      state?.notes || null,
          };
        }),
      }),
    onSuccess: () => {
      toast.success('Assiduité enregistrée !');
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur lors de l\'enregistrement'),
  });

  const recordedCount = rows.filter((r) => r.attendance !== null).length;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Users2 className="w-10 h-10 mb-3 text-slate-300" />
        <p className="text-sm">Aucun employé actif trouvé.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">
            <span className="text-lg font-bold text-slate-800">{recordedCount}</span>
            <span className="text-slate-400">/{rows.length}</span>
            <span className="ml-1 text-slate-500">enregistrés</span>
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            recordedCount === rows.length
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            {recordedCount === rows.length ? 'Complet' : 'Incomplet'}
          </span>
        </div>

        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || rows.length === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
        >
          {saveMut.isPending
            ? <Loader2 size={15} className="animate-spin" />
            : <Save size={15} />}
          Enregistrer tout
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left border-b border-slate-200">
            <tr>
              <th className="px-5 py-3 font-medium">Employé</th>
              <th className="px-5 py-3 font-medium">Département</th>
              <th className="px-5 py-3 font-medium">Statut</th>
              <th className="px-5 py-3 font-medium">Arrivée</th>
              <th className="px-5 py-3 font-medium">Départ</th>
              <th className="px-5 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const state = form[row.employeeId];
              if (!state) return null;
              const needsTime = state.status !== 'PRESENT';

              function update(patch: Partial<RowState>) {
                setForm((prev) => ({
                  ...prev,
                  [row.employeeId]: { ...prev[row.employeeId], ...patch },
                }));
              }

              return (
                <tr key={row.employeeId} className={`hover:bg-slate-50/60 transition ${
                  row.attendance ? '' : 'bg-amber-50/30'
                }`}>
                  {/* Name */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {row.fullName[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-800">{row.fullName}</span>
                    </div>
                  </td>

                  {/* Dept */}
                  <td className="px-5 py-3 text-slate-500 text-xs">
                    {row.department ?? '—'}
                  </td>

                  {/* Status pills */}
                  <td className="px-5 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {ALL_STATUSES.map((s) => {
                        const cfg = STATUS_CFG[s];
                        const active = state.status === s;
                        return (
                          <button
                            key={s}
                            onClick={() => update({ status: s })}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition ${
                              active
                                ? `${cfg.color} ring-1`
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {cfg.icon}
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  {/* CheckIn */}
                  <td className="px-5 py-3">
                    {needsTime ? (
                      <input
                        type="time"
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-28 focus:ring-2 focus:ring-blue-300 focus:outline-none"
                        value={state.checkIn}
                        onChange={(e) => update({ checkIn: e.target.value })}
                      />
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>

                  {/* CheckOut */}
                  <td className="px-5 py-3">
                    {needsTime ? (
                      <input
                        type="time"
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-28 focus:ring-2 focus:ring-blue-300 focus:outline-none"
                        value={state.checkOut}
                        onChange={(e) => update({ checkOut: e.target.value })}
                      />
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="px-5 py-3">
                    <input
                      type="text"
                      placeholder="Note…"
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-36 focus:ring-2 focus:ring-blue-300 focus:outline-none placeholder-slate-300"
                      value={state.notes}
                      onChange={(e) => update({ notes: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// HISTORIQUE TAB
// ════════════════════════════════════════════════════════════════════════════════

function HistoriqueTab() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const [from,         setFrom]         = useState(monthAgo);
  const [to,           setTo]           = useState(today);
  const [empFilter,    setEmpFilter]    = useState('');
  const [deptFilter,   setDeptFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: records = [], isLoading } = useQuery<HistoryRecord[]>({
    queryKey: ['attendance-history', from, to, empFilter, deptFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from)         params.set('from',         from);
      if (to)           params.set('to',           to);
      if (empFilter)    params.set('employeeId',   empFilter);
      if (deptFilter)   params.set('departmentId', deptFilter);
      if (statusFilter) params.set('status',       statusFilter);
      return (await api.get(`/api/attendance/history?${params}`)).data;
    },
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => (await api.get('/api/hr/employees')).data,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/api/hr/departments')).data,
  });

  // aggregate stats
  const stats = useMemo(() => ({
    present:     records.filter((r) => r.status === 'PRESENT').length,
    absent:      records.filter((r) => r.status === 'ABSENT').length,
    retard:      records.filter((r) => r.status === 'RETARD').length,
    demiJournee: records.filter((r) => r.status === 'DEMI_JOURNEE').length,
  }), [records]);

  return (
    <div className="p-6">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Du</label>
          <input type="date" className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Au</label>
          <input type="date" className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Employé</label>
          <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
            <option value="">Tous</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.user.fullName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Département</label>
          <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">Tous</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Statut</label>
          <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
          </select>
        </div>
        <button
          onClick={() => exportCSV(records)}
          disabled={records.length === 0}
          className="ml-auto flex items-center gap-2 border border-slate-300 hover:bg-slate-50 disabled:opacity-40 text-slate-600 text-sm font-medium px-4 py-1.5 rounded-lg transition"
        >
          <Download size={14} /> Exporter CSV
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {[
          { label: 'Présents',     count: stats.present,     cls: 'bg-emerald-100 text-emerald-700' },
          { label: 'Absents',      count: stats.absent,      cls: 'bg-red-100 text-red-700' },
          { label: 'Retards',      count: stats.retard,      cls: 'bg-amber-100 text-amber-700' },
          { label: 'Demi-journées',count: stats.demiJournee, cls: 'bg-blue-100 text-blue-700' },
          { label: 'Total',        count: records.length,    cls: 'bg-slate-100 text-slate-600' },
        ].map(({ label, count, cls }) => (
          <span key={label} className={`px-3 py-1 rounded-full text-xs font-medium ${cls}`}>
            {count} {label}
          </span>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <History className="w-10 h-10 mb-3 text-slate-300" />
          <p className="text-sm">Aucune donnée pour ces filtres.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 font-medium">Employé</th>
                <th className="px-5 py-3 font-medium">Département</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Arrivée</th>
                <th className="px-5 py-3 font-medium">Départ</th>
                <th className="px-5 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => {
                const cfg = STATUS_CFG[r.status];
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 font-medium text-slate-800">{r.employee.user.fullName}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{r.employee.department?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {new Date(r.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{isoToTime(r.checkIn) || '—'}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{isoToTime(r.checkOut) || '—'}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs max-w-xs truncate">{r.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════════════════

type Tab = 'today' | 'history';

export default function AssiduitePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('today');

  if (user?.role !== 'ADMIN' && user?.role !== 'RH') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-slate-400">
        <Clock className="w-10 h-10 mb-3 text-slate-300" />
        <p className="text-sm">Accès réservé aux responsables RH et administrateurs.</p>
      </div>
    );
  }

  const tabs = [
    { id: 'today'   as Tab, label: "Aujourd'hui", icon: <Clock size={15} /> },
    { id: 'history' as Tab, label: 'Historique',  icon: <History size={15} /> },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Clock className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-slate-800 flex-1">Assiduité</h1>
        <span className="text-sm text-slate-400">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {/* Tabs */}
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

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50">
        {tab === 'today'   && <TodayTab />}
        {tab === 'history' && <HistoriqueTab />}
      </div>
    </div>
  );
}
