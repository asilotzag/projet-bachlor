import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  ChevronLeft, ChevronRight, Plus, X, Check, Users, Calendar,
  MapPin, Clock, ExternalLink,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type EventType = 'TASK' | 'LEAVE' | 'CONTRACT' | 'MEETING';
type ViewMode  = 'month' | 'week' | 'day';

interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  start: string;
  end?: string;
  status?: string;
  link: string;
  ownerId?: string;
}

interface ChatUser { id: string; fullName: string; role: { name: string } }

// ── Constants ──────────────────────────────────────────────────────────────────

const EVENT_PILL: Record<EventType, string> = {
  TASK:     'bg-red-100 text-red-700 border border-red-200',
  LEAVE:    'bg-yellow-100 text-yellow-700 border border-yellow-200',
  CONTRACT: 'bg-orange-100 text-orange-700 border border-orange-200',
  MEETING:  'bg-blue-100 text-blue-700 border border-blue-200',
};
const EVENT_DOT: Record<EventType, string> = {
  TASK: 'bg-red-500', LEAVE: 'bg-yellow-500', CONTRACT: 'bg-orange-500', MEETING: 'bg-blue-500',
};
const TYPE_LABEL: Record<EventType, string> = {
  TASK: 'Tâche', LEAVE: 'Congé', CONTRACT: 'Contrat', MEETING: 'Réunion',
};
const DAYS_FR   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// ── Date helpers ───────────────────────────────────────────────────────────────

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function eventOnDay(ev: CalendarEvent, day: Date): boolean {
  const start = dateOnly(new Date(ev.start));
  const end   = ev.end ? dateOnly(new Date(ev.end)) : start;
  const d     = dateOnly(day);
  return start <= d && end >= d;
}

function getMonthGrid(year: number, month: number): Date[] {
  const first  = new Date(year, month, 1);
  const last   = new Date(year, month + 1, 0);
  const days: Date[] = [];
  const startDow = (first.getDay() + 6) % 7; // Monday = 0
  for (let i = startDow - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length < 42) {
    const prev = days[days.length - 1];
    const next = new Date(prev); next.setDate(prev.getDate() + 1);
    days.push(next);
  }
  return days;
}

function getWeekDays(ref: Date): Date[] {
  const dow = (ref.getDay() + 6) % 7;
  const mon = new Date(ref); mon.setDate(ref.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
  });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function isoLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── EventPill ─────────────────────────────────────────────────────────────────

function EventPill({ ev, onClick }: { ev: CalendarEvent; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-xs px-1.5 py-0.5 rounded mb-0.5 flex items-center gap-1 truncate ${EVENT_PILL[ev.type]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${EVENT_DOT[ev.type]}`} />
      <span className="truncate">{ev.title}</span>
    </button>
  );
}

// ── EventPopover ──────────────────────────────────────────────────────────────

function EventPopover({ ev, pos, onClose }: { ev: CalendarEvent; pos: { x: number; y: number }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const left = Math.min(pos.x + 8, window.innerWidth  - 300);
  const top  = Math.min(pos.y + 8, window.innerHeight - 220);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-4 w-72"
      style={{ left, top }}
    >
      <div className="flex items-start justify-between mb-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EVENT_PILL[ev.type]}`}>
          {TYPE_LABEL[ev.type]}
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
      <h3 className="font-semibold text-slate-800 text-sm mb-2">{ev.title}</h3>
      <div className="space-y-1 mb-3">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Calendar size={11} />
          {fmtDate(new Date(ev.start))}
          {ev.type === 'MEETING' && ` à ${fmtTime(ev.start)}`}
        </p>
        {ev.end && ev.end !== ev.start && (
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Clock size={11} />
            {ev.type === 'MEETING'
              ? `Fin : ${fmtTime(ev.end)}`
              : `Au ${fmtDate(new Date(ev.end))}`}
          </p>
        )}
        {ev.status && <p className="text-xs text-slate-400">Statut : {ev.status}</p>}
      </div>
      <a
        href={ev.link}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        <ExternalLink size={11} /> Voir détails
      </a>
    </div>
  );
}

// ── DayCell (used in MonthView) ───────────────────────────────────────────────

function DayCell({
  day, isCurrentMonth, events, today, onEventClick,
}: {
  day: Date; isCurrentMonth: boolean; events: CalendarEvent[]; today: Date;
  onEventClick: (ev: CalendarEvent, e: React.MouseEvent) => void;
}) {
  const isToday = day.toDateString() === today.toDateString();
  const MAX = 3;
  const visible = events.slice(0, MAX);
  const overflow = events.length - MAX;

  return (
    <div className={`min-h-[90px] p-1.5 border-b border-r border-slate-100 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/60'}`}>
      <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full mb-1 ${
        isToday ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400'
      }`}>
        {day.getDate()}
      </span>
      <div>
        {visible.map((ev) => (
          <EventPill key={ev.id} ev={ev} onClick={(e) => onEventClick(ev, e)} />
        ))}
        {overflow > 0 && (
          <span className="text-xs text-slate-400 pl-1">+{overflow} autre{overflow > 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}

// ── MonthView ─────────────────────────────────────────────────────────────────

function MonthView({ date, events, onEventClick }: {
  date: Date; events: CalendarEvent[];
  onEventClick: (ev: CalendarEvent, e: React.MouseEvent) => void;
}) {
  const grid  = useMemo(() => getMonthGrid(date.getFullYear(), date.getMonth()), [date]);
  const today = useMemo(() => new Date(), []);

  return (
    <div className="flex-1 overflow-auto">
      {/* Header row */}
      <div className="grid grid-cols-7 border-l border-t border-slate-100">
        {DAYS_FR.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-slate-500 py-2 border-b border-r border-slate-100">
            {d}
          </div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-7 border-l border-slate-100">
        {grid.map((day, i) => (
          <DayCell
            key={i}
            day={day}
            isCurrentMonth={day.getMonth() === date.getMonth()}
            events={events.filter((ev) => eventOnDay(ev, day))}
            today={today}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </div>
  );
}

// ── WeekView ──────────────────────────────────────────────────────────────────

function WeekView({ date, events, onEventClick }: {
  date: Date; events: CalendarEvent[];
  onEventClick: (ev: CalendarEvent, e: React.MouseEvent) => void;
}) {
  const days  = useMemo(() => getWeekDays(date), [date]);
  const today = useMemo(() => new Date(), []);

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 border-l border-t border-slate-100 min-w-[600px]">
        {days.map((day, i) => {
          const isToday = day.toDateString() === today.toDateString();
          const dayEvents = events.filter((ev) => eventOnDay(ev, day));
          return (
            <div key={i} className="border-b border-r border-slate-100">
              {/* Column header */}
              <div className={`text-center py-2 border-b border-slate-100 ${isToday ? 'bg-blue-50' : ''}`}>
                <p className="text-xs text-slate-500">{DAYS_FR[i]}</p>
                <span className={`inline-flex items-center justify-center w-7 h-7 text-sm font-semibold rounded-full ${
                  isToday ? 'bg-blue-600 text-white' : 'text-slate-700'
                }`}>{day.getDate()}</span>
              </div>
              {/* Events */}
              <div className="p-1.5 min-h-[120px] space-y-0.5">
                {dayEvents.map((ev) => (
                  <EventPill key={ev.id} ev={ev} onClick={(e) => onEventClick(ev, e)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DayView ───────────────────────────────────────────────────────────────────

function DayView({ date, events, onEventClick }: {
  date: Date; events: CalendarEvent[];
  onEventClick: (ev: CalendarEvent, e: React.MouseEvent) => void;
}) {
  const dayEvents = useMemo(
    () => events.filter((ev) => eventOnDay(ev, date)).sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    ),
    [events, date],
  );

  return (
    <div className="flex-1 overflow-auto p-4">
      {dayEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm">
          <Calendar size={32} className="text-slate-200 mb-2" />
          Aucun événement ce jour
        </div>
      ) : (
        <div className="space-y-2 max-w-xl">
          {dayEvents.map((ev) => (
            <button
              key={ev.id}
              onClick={(e) => onEventClick(ev, e)}
              className={`w-full text-left rounded-xl px-4 py-3 flex items-start gap-3 ${EVENT_PILL[ev.type]} hover:opacity-80 transition-opacity`}
            >
              <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${EVENT_DOT[ev.type]}`} />
              <div>
                <p className="text-sm font-medium">{ev.title}</p>
                <p className="text-xs mt-0.5 opacity-70">
                  {ev.type === 'MEETING'
                    ? `${fmtTime(ev.start)}${ev.end ? ` → ${fmtTime(ev.end)}` : ''}`
                    : TYPE_LABEL[ev.type]}
                  {ev.status ? ` · ${ev.status}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NewMeetingModal ───────────────────────────────────────────────────────────

function NewMeetingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const now   = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [startAt,     setStartAt]     = useState(isoLocal(now));
  const [endAt,       setEndAt]       = useState(isoLocal(later));
  const [location,    setLocation]    = useState('');
  const [search,      setSearch]      = useState('');
  const [selected,    setSelected]    = useState<string[]>([]);
  const { user } = useAuth();

  const { data: users = [] } = useQuery<ChatUser[]>({
    queryKey: ['chat-users'],
    queryFn: () => api.get('/api/chat/users').then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post('/api/meetings', {
      title, description, startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(), location, attendeeIds: selected,
    }),
    onSuccess: () => { onCreated(); onClose(); },
  });

  const toggle = (id: string) =>
    setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const filtered = users.filter((u) =>
    u.id !== user?.id && u.fullName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Nouvelle réunion</h2>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Titre *</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Intitulé de la réunion" autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Début *</label>
              <input type="datetime-local" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Fin *</label>
              <input type="datetime-local" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              <MapPin size={11} className="inline mr-1" />Lieu / lien vidéo
            </label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Salle B2 ou https://meet.example.com/..."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              <Users size={11} className="inline mr-1" />Participants
            </label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="max-h-36 overflow-y-auto divide-y divide-slate-50 border border-slate-100 rounded-lg">
              {filtered.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm flex items-center gap-2"
                    onClick={() => toggle(u.id)}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      selected.includes(u.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                    }`}>
                      {selected.includes(u.id) && <Check size={10} className="text-white" />}
                    </span>
                    <span className="truncate">{u.fullName}</span>
                    <span className="ml-auto text-xs text-slate-400">{u.role.name}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="text-xs text-slate-400 px-3 py-2">Aucun utilisateur</li>}
            </ul>
            {selected.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">{selected.length} participant{selected.length > 1 ? 's' : ''} sélectionné{selected.length > 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100">
          <button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 transition-colors"
            disabled={!title.trim() || !startAt || !endAt || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? 'Création…' : 'Créer la réunion'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main CalendarPage ─────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  const [view,            setView]          = useState<ViewMode>('month');
  const [currentDate,     setCurrentDate]   = useState(() => new Date());
  const [activeTypes,     setActiveTypes]   = useState<Set<EventType>>(
    new Set(['TASK', 'LEAVE', 'CONTRACT', 'MEETING']),
  );
  const [selectedEvent,   setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [popoverPos,      setPopoverPos]    = useState({ x: 0, y: 0 });
  const [showNewMeeting,  setShowNewMeeting] = useState(false);

  // Compute date range for query
  const { from, to } = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    if (view === 'month') {
      const grid = getMonthGrid(y, m);
      return { from: grid[0], to: grid[grid.length - 1] };
    }
    if (view === 'week') {
      const days = getWeekDays(currentDate);
      return { from: days[0], to: days[6] };
    }
    return { from: dateOnly(currentDate), to: dateOnly(currentDate) };
  }, [view, currentDate]);

  const { data: rawEvents = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', from.toISOString(), to.toISOString()],
    queryFn: () =>
      api.get(`/api/calendar/events?from=${from.toISOString()}&to=${to.toISOString()}`).then((r) => r.data),
  });

  const events = useMemo(
    () => rawEvents.filter((ev) => activeTypes.has(ev.type)),
    [rawEvents, activeTypes],
  );

  // Deep link: open meeting popover from ?meetingId=
  useEffect(() => {
    const mid = searchParams.get('meetingId');
    if (mid && rawEvents.length > 0) {
      const ev = rawEvents.find((e) => e.id === `meeting-${mid}`);
      if (ev) {
        setSelectedEvent(ev);
        setPopoverPos({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
      }
    }
  }, [searchParams, rawEvents]);

  const handleEventClick = useCallback((ev: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(ev);
    setPopoverPos({ x: e.clientX, y: e.clientY });
  }, []);

  const navigate = (dir: number) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === 'month') d.setMonth(d.getMonth() + dir);
      if (view === 'week')  d.setDate(d.getDate() + dir * 7);
      if (view === 'day')   d.setDate(d.getDate() + dir);
      return d;
    });
  };

  const toggleType = (type: EventType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const periodLabel = useMemo(() => {
    if (view === 'month') return `${MONTHS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (view === 'week') {
      const days = getWeekDays(currentDate);
      return `${fmtDate(days[0])} – ${fmtDate(days[6])}`;
    }
    return fmtDate(currentDate);
  }, [view, currentDate]);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex flex-wrap items-center gap-3">
        {/* Navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          ><ChevronLeft size={16} /></button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 text-xs font-medium rounded-lg hover:bg-slate-100 text-slate-600"
          >Aujourd'hui</button>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          ><ChevronRight size={16} /></button>
        </div>

        {/* Period label */}
        <h2 className="font-semibold text-slate-800 text-sm min-w-[200px]">{periodLabel}</h2>

        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs ml-auto">
          {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                view === v ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {v === 'month' ? 'Mois' : v === 'week' ? 'Semaine' : 'Jour'}
            </button>
          ))}
        </div>

        {/* New meeting button */}
        <button
          onClick={() => setShowNewMeeting(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
        >
          <Plus size={14} /> Nouvelle réunion
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-4 flex-wrap">
        <span className="text-xs text-slate-500 font-medium">Afficher :</span>
        {(['TASK', 'LEAVE', 'CONTRACT', 'MEETING'] as EventType[]).map((type) => (
          <label key={type} className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="sr-only"
              checked={activeTypes.has(type)}
              onChange={() => toggleType(type)}
            />
            <span className={`w-4 h-4 rounded border flex items-center justify-center ${
              activeTypes.has(type) ? `${EVENT_DOT[type]} border-transparent` : 'border-slate-300 bg-white'
            }`}>
              {activeTypes.has(type) && <Check size={10} className="text-white" />}
            </span>
            <span className="text-xs text-slate-600">{TYPE_LABEL[type]}s</span>
          </label>
        ))}
        {isLoading && <span className="text-xs text-slate-400 ml-auto">Chargement…</span>}
      </div>

      {/* ── Calendar view ── */}
      <div className="flex-1 overflow-hidden flex flex-col" onClick={() => setSelectedEvent(null)}>
        {view === 'month' && (
          <MonthView date={currentDate} events={events} onEventClick={handleEventClick} />
        )}
        {view === 'week' && (
          <WeekView date={currentDate} events={events} onEventClick={handleEventClick} />
        )}
        {view === 'day' && (
          <DayView date={currentDate} events={events} onEventClick={handleEventClick} />
        )}
      </div>

      {/* ── Popover ── */}
      {selectedEvent && (
        <EventPopover ev={selectedEvent} pos={popoverPos} onClose={() => setSelectedEvent(null)} />
      )}

      {/* ── New meeting modal ── */}
      {showNewMeeting && (
        <NewMeetingModal
          onClose={() => setShowNewMeeting(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['calendar-events'] })}
        />
      )}
    </div>
  );
}
