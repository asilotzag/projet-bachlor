import { Outlet, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationProvider } from '../../contexts/NotificationContext';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import ChatbotWidget from '../ChatbotWidget';

export default function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <NotificationProvider>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex items-center justify-end px-6 py-2 bg-white border-b border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">{user.fullName}</span>
              <NotificationBell />
            </div>
          </header>
          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <ChatbotWidget />
    </NotificationProvider>
  );
}
