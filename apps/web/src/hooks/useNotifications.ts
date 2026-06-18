import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../lib/api';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await api.get<AppNotification[]>('/api/notifications');
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.isRead).length);
    } catch {
      // silent — user may not be authenticated yet
    }
  }, []);

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    esRef.current?.close();

    const es = new EventSource(
      `${API_BASE}/api/notifications/stream?token=${encodeURIComponent(token)}`,
    );
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const notif: AppNotification = JSON.parse(e.data as string);
        setNotifications((prev) => [notif, ...prev]);
        setUnreadCount((c) => c + 1);
      } catch {
        // malformed push — ignore
      }
    };

    // Forward named chat SSE events as window CustomEvents
    es.addEventListener('chat_message', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data as string);
        window.dispatchEvent(new CustomEvent('chat:message', { detail: payload }));
      } catch { /* ignore */ }
    });

    es.addEventListener('chat_message_edit', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data as string);
        window.dispatchEvent(new CustomEvent('chat:message_edit', { detail: payload }));
      } catch { /* ignore */ }
    });

    es.addEventListener('chat_message_delete', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data as string);
        window.dispatchEvent(new CustomEvent('chat:message_delete', { detail: payload }));
      } catch { /* ignore */ }
    });

    es.addEventListener('analytics_refresh', () => {
      window.dispatchEvent(new CustomEvent('analytics:refresh'));
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      reconnectRef.current = setTimeout(connect, 5_000);
    };
  }, []);

  useEffect(() => {
    void fetchAll();
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [fetchAll, connect]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.patch('/api/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, []);

  const removeNotification = useCallback(
    async (id: string) => {
      const notif = notifications.find((n) => n.id === id);
      try {
        await api.delete(`/api/notifications/${id}`);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (notif && !notif.isRead) setUnreadCount((c) => Math.max(0, c - 1));
      } catch { /* ignore */ }
    },
    [notifications],
  );

  return { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification };
}
