import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  assignee?: { fullName: string } | null;
}

interface Props {
  tasks: Task[];
}

const STATUS_COLORS: Record<string, string> = {
  TODO:        'bg-slate-400',
  IN_PROGRESS: 'bg-blue-500',
  IN_REVIEW:   'bg-amber-500',
  DONE:        'bg-emerald-500',
  BLOCKED:     'bg-red-500',
};

const STATUS_LABELS: Record<string, string> = {
  TODO:        'À faire',
  IN_PROGRESS: 'En cours',
  IN_REVIEW:   'En révision',
  DONE:        'Terminé',
  BLOCKED:     'Bloqué',
};

function getDaysBetween(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function GanttView({ tasks }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [weekOffset, setWeekOffset] = useState(0);

  const viewStart = useMemo(() => {
    const d = new Date(today);
    // go to Monday of current week
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
    return d;
  }, [today, weekOffset]);

  const DAYS = 14; // 2 weeks view
  const DAY_WIDTH = 48;

  const dates = useMemo(
    () => Array.from({ length: DAYS }, (_, i) => addDays(viewStart, i)),
    [viewStart],
  );

  // Only show tasks that have a dueDate
  const tasksWithDates = tasks.filter((t) => t.dueDate);

  const rows = tasksWithDates.map((t) => {
    const start = new Date(t.createdAt);
    start.setHours(0, 0, 0, 0);
    const due = new Date(t.dueDate!);
    due.setHours(0, 0, 0, 0);

    const visStart = start < viewStart ? viewStart : start;
    const visEnd   = due > addDays(viewStart, DAYS - 1) ? addDays(viewStart, DAYS - 1) : due;

    const left = getDaysBetween(viewStart, visStart);
    const width = Math.max(1, getDaysBetween(visStart, visEnd) + 1);
    const visible = visEnd >= viewStart && visStart <= addDays(viewStart, DAYS - 1);

    const isOverdue = due < today && t.status !== 'DONE';

    return { ...t, left, width, visible, isOverdue, due };
  });

  const rangeLabel = `${viewStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — ${
    addDays(viewStart, DAYS - 1).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }`;

  const todayOffset = getDaysBetween(viewStart, today);

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((v) => v - 2)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[200px] text-center">{rangeLabel}</span>
          <button
            onClick={() => setWeekOffset((v) => v + 2)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => setWeekOffset(0)}
          className="text-xs text-violet-600 hover:text-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 transition"
        >
          Aujourd'hui
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(STATUS_LABELS).map(([s, label]) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`w-2.5 h-2.5 rounded-sm ${STATUS_COLORS[s]}`} />
            {label}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div style={{ minWidth: 320 + DAYS * DAY_WIDTH }}>
          {/* Header row */}
          <div className="flex border-b border-slate-200 sticky top-0 bg-white z-10">
            <div className="w-80 shrink-0 px-4 py-2.5 text-xs font-medium text-slate-500 border-r border-slate-200">
              Tâche
            </div>
            <div className="flex">
              {dates.map((d, i) => {
                const isToday = getDaysBetween(viewStart, today) === i;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={i}
                    style={{ width: DAY_WIDTH }}
                    className={`shrink-0 text-center py-2.5 text-[11px] font-medium border-r border-slate-100 ${
                      isToday ? 'bg-violet-50 text-violet-700' : isWeekend ? 'bg-slate-50 text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    <div>{d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3)}</div>
                    <div className={`text-xs font-bold ${isToday ? 'text-violet-600' : ''}`}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task rows */}
          {rows.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Aucune tâche avec échéance définie
            </div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="flex border-b border-slate-100 hover:bg-slate-50 transition group">
                {/* Task name */}
                <div className="w-80 shrink-0 px-4 py-3 border-r border-slate-200 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[row.status] ?? 'bg-slate-400'}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${row.isOverdue ? 'text-red-600' : 'text-slate-700'}`}>
                      {row.title}
                      {row.isOverdue && <span className="ml-1 text-xs text-red-500">⚠ Retard</span>}
                    </p>
                    {row.assignee && (
                      <p className="text-xs text-slate-400 truncate">{row.assignee.fullName}</p>
                    )}
                  </div>
                </div>

                {/* Bar area */}
                <div className="flex relative" style={{ width: DAYS * DAY_WIDTH }}>
                  {/* Today marker */}
                  {todayOffset >= 0 && todayOffset < DAYS && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-violet-400 z-10 opacity-60"
                      style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                    />
                  )}

                  {/* Weekend shading */}
                  {dates.map((d, i) => {
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return isWeekend ? (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 bg-slate-50"
                        style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                      />
                    ) : null;
                  })}

                  {/* Gantt bar */}
                  {row.visible && (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-full flex items-center px-2 text-white text-[10px] font-medium shadow-sm ${
                        row.isOverdue ? 'bg-red-500' : (STATUS_COLORS[row.status] ?? 'bg-slate-400')
                      }`}
                      style={{
                        left: row.left * DAY_WIDTH + 2,
                        width: row.width * DAY_WIDTH - 4,
                      }}
                      title={`${row.title} — échéance ${row.due.toLocaleDateString('fr-FR')}`}
                    >
                      <span className="truncate">{row.title}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
