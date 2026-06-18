import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { PublicUser } from '@pfe/shared';

interface AuthState {
  user: PublicUser | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('token'),
    isLoading: true,
  });

  // Au démarrage, si un token existe, on recharge l'utilisateur.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    api.get<PublicUser>('/api/auth/me')
      .then((r) => setState({ user: r.data, token, isLoading: false }))
      .catch(() => {
        localStorage.removeItem('token');
        setState({ user: null, token: null, isLoading: false });
      });
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post<{ token: string; user: PublicUser }>('/api/auth/login', {
      email,
      password,
    });
    localStorage.setItem('token', data.token);
    setState({ user: data.user, token: data.token, isLoading: false });
  }

  function logout() {
    localStorage.removeItem('token');
    setState({ user: null, token: null, isLoading: false });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un <AuthProvider>');
  return ctx;
}
