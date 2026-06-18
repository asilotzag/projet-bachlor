import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckSquare, Users, Calendar, FileText, UserCircle,
  AlertCircle, Clock, X, CheckCheck,
} from 'lucide-react';
import { useNotificationContext } from '../../contexts/NotificationContext';
import type { AppNotification } from '../../hooks/useNotifications';

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'à l\'instant';
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function NotifIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4 flex-shrink-0';
  if (type === 'TASK_DUE_SOON') return <Clock className={`${cls} text-amber-500`} />;
  if (type.startsWith('TASK_')) return <CheckSquare className={`${cls} text-blue-500`} />;
  if (type.startsWith('PROJECT_')) return <Users className={`${cls} text-purple-500`} />;
  if (type.startsWith('LEAVE_')) return <Calendar className={`${cls} text-green-500`} />;
  if (type.startsWith('CONTRACT_')) return <FileText className={`${cls} text-orange-500`} />;
  if (type.startsWith('ATTENDANCE_')) return <AlertCircle className={`${cls} text-red-500`} />;
  if (type.startsWith('ACCOUNT_')) return <UserCircle className={`${cls} text-slate-500`} />;
  return <Bell className={`${cls} text-slate-400`} />;
}

// ── NotificationItem ───────────────────────────────────────────────────────────

function NotificationItem({
  notif,
  onRead,
  onRemove,
}: {
  notif: AppNotification;
  onRead: () => void;
  onRemove: () => void;
}) {
  const navigate = useNavigate();

  function handleClick() {
    if (!notif.isRead) onRead();
    if (notif.link) navigate(notif.link);
  }

  return (
    <div
      className={`flex gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer group transition-colors ${
        notif.isRead ? 'opacity-70' : 'bg-blue-50/40'
      }`}
      onClick={handleClick}
    >
      {/* unread dot */}
      <div className="mt-1 flex-shrink-0 w-2">
        {!notif.isRead && (
          <span className="block w-2 h-2 rounded-full bg-blue-500" />
        )}
      </div>

      <NotifIcon type={notif.type} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{notif.title}</p>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.body}</p>
        <p className="text-xs text-slate-400 mt-1">{relativeTime(notif.createdAt)}</p>
      </div>

      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200 flex-shrink-0 mt-0.5"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Supprimer"
      >
        <X className="w-3 h-3 text-slate-400" />
      </button>
    </div>
  );
}

// ── NotificationBell ───────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification } =
    useNotificationContext();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-slate-100 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAllAsRead()}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                title="Tout marquer comme lu"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Tout lire
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Aucune notification</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notif={n}
                  onRead={() => void markAsRead(n.id)}
                  onRemove={() => void removeNotification(n.id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
