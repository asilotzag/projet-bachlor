import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import ProfilePage from './pages/ProfilePage';
import AnalyticsPage from './pages/AnalyticsPage';
import GEDPage from './pages/GEDPage';
import TasksPage from './pages/TasksPage';
import HRPage from './pages/HRPage';
import PlaceholderPage from './pages/PlaceholderPage';
import AssiduitePage   from './pages/AssiduitePage';
import ChatPage        from './pages/ChatPage';
import CalendarPage    from './pages/CalendarPage';
import WorkJournalPage from './pages/WorkJournalPage';
import OrgChartPage from './pages/OrgChartPage';
import TeamPage from './pages/TeamPage';
import ReportsPage from './pages/ReportsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          {/* Route publique */}
          <Route path="/login" element={<LoginPage />} />

          {/* Routes protégées (AppLayout redirige vers /login si non connecté) */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/documents" element={<GEDPage />} />
            <Route path="/tasks"     element={<TasksPage />} />
            <Route path="/hr"        element={<HRPage />} />
            <Route path="/reports"   element={<ReportsPage />} />
            <Route path="/users"      element={<UsersPage />} />
            <Route path="/users/:id"  element={<UserDetailPage />} />
            <Route path="/profile"    element={<ProfilePage />} />
            <Route path="/analytics"  element={<AnalyticsPage />} />
            <Route path="/attendance" element={<AssiduitePage />} />
            <Route path="/chat"       element={<ChatPage />} />
            <Route path="/calendar"   element={<CalendarPage />} />
            <Route path="/journal"    element={<WorkJournalPage />} />
            <Route path="/orgchart"   element={<OrgChartPage />} />
            <Route path="/team"       element={<TeamPage />} />
          </Route>

          {/* Racine → dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
