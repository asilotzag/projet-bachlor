import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderOpen, CheckSquare, Users2, BarChart2, Building2, LogOut, Clock, MessageSquare, CalendarDays, UserCircle, TrendingUp, BookOpen, Network, UsersRound,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import type { Role } from '@pfe/shared';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',  label: 'Tableau de bord', icon: <LayoutDashboard size={18} /> },
  { to: '/documents',  label: 'Documents (GED)',  icon: <FolderOpen size={18} /> },
  { to: '/tasks',      label: 'Tâches',           icon: <CheckSquare size={18} /> },
  { to: '/hr',         label: 'Ressources Hum.',  icon: <Users2 size={18} /> },
  { to: '/analytics',  label: 'Analytics',        icon: <TrendingUp size={18} />, roles: ['ADMIN', 'RH', 'MANAGER'] },
  { to: '/reports',    label: 'Rapports',         icon: <BarChart2 size={18} />, roles: ['ADMIN', 'MANAGER'] },
  { to: '/attendance',  label: 'Assiduité',        icon: <Clock size={18} />,  roles: ['ADMIN', 'RH'] },
  { to: '/users',      label: 'Utilisateurs',     icon: <Users2 size={18} />, roles: ['ADMIN', 'RH'] },
  { to: '/journal',    label: 'Journal de travail', icon: <BookOpen size={18} /> },
  { to: '/orgchart',  label: 'Organigramme',     icon: <Network size={18} />, roles: ['ADMIN', 'RH', 'MANAGER'] },
  { to: '/team',      label: 'Équipes',          icon: <UsersRound size={18} />, roles: ['ADMIN', 'RH', 'MANAGER'] },
  { to: '/chat',       label: 'Messages',         icon: <MessageSquare size={18} /> },
  { to: '/calendar',  label: 'Calendrier',       icon: <CalendarDays  size={18} /> },
  { to: '/profile',   label: 'Mon profil',       icon: <UserCircle size={18} /> },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  const { data: conversations = [] } = useQuery<{ unreadCount: number }[]>({
    queryKey: ['chat-conversations'],
    queryFn: () => api.get('/api/chat/conversations').then((r) => r.data),
    refetchInterval: 30_000,
    enabled: !!user,
  });
  const chatUnread = conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0);

  const { data: pendingTeam } = useQuery<{ count: number }>({
    queryKey: ['supervision-pending-count'],
    queryFn: () => api.get('/api/supervision/requests/count').then((r) => r.data),
    refetchInterval: 60_000,
    enabled: user?.role === 'ADMIN' || user?.role === 'RH',
  });

  const visible = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-slate-900 text-slate-100 shrink-0">
      {/* En-tête */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700/60">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
          <Building2 size={16} className="text-white" />
        </div>
        <span className="font-semibold text-sm tracking-wide">Gestion Entreprise</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`
            }
          >
            {item.icon}
            {item.label}
            {item.to === '/chat' && chatUnread > 0 && (
              <span className="ml-auto bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.2rem] text-center leading-none">
                {chatUnread > 99 ? '99+' : chatUnread}
              </span>
            )}
            {item.to === '/team' && (pendingTeam?.count ?? 0) > 0 && (
              <span className="ml-auto bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.2rem] text-center leading-none">
                {pendingTeam!.count}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Profil + déconnexion */}
      <div className="border-t border-slate-700/60 px-4 py-4">
        <div className="text-xs text-slate-400 mb-0.5">{user?.fullName}</div>
        <div className="text-xs text-slate-500 mb-3">{user?.email}</div>
        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-900/60 text-blue-300 mb-3">
          {user?.role}
        </span>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          <LogOut size={15} />
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}
