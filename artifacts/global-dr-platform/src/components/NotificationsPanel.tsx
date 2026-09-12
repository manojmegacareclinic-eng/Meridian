import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useListNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  getListNotificationsQueryKey,
} from '@workspace/api-client-react';
import type { ListNotificationsResponse } from '@workspace/api-client-react';
import { CalendarDays, CheckCheck, CircleAlert, FileCheck2, Landmark, Radar, Vote } from 'lucide-react';
import { queryClient } from '@/lib/query';

type NotificationItem = ListNotificationsResponse['items'][number];

const KIND_META: Record<NotificationItem['kind'], { icon: typeof Landmark; label: string }> = {
  position_change: { icon: Landmark, label: 'Position change' },
  meeting_upcoming: { icon: CalendarDays, label: 'Upcoming meeting' },
  agreement_expiring: { icon: FileCheck2, label: 'Agreement expiring' },
  follow_up_overdue: { icon: CircleAlert, label: 'Overdue follow-up' },
  election_approaching: { icon: Vote, label: 'Election approaching' },
  new_finding: { icon: Radar, label: 'New finding' },
};

const relativeTime = (value: string) => {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'just now';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const invalidateNotifications = () =>
  void queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const notificationsQuery = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const items = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const sorted = [...items].sort((a, b) => Number(a.isRead) - Number(b.isRead));

  const focusItem = (item: NotificationItem) => {
    if (item.countryId == null || item.kind === 'meeting_upcoming') return;
    if (item.kind === 'position_change') {
      void navigate({ to: '/country/$countryId', params: { countryId: String(item.countryId) }, search: { tab: 'government' } });
    } else if (item.kind === 'agreement_expiring') {
      void navigate({ to: '/country/$countryId', params: { countryId: String(item.countryId) }, search: { tab: 'documents' } });
    } else if (item.kind === 'follow_up_overdue') {
      void navigate({ to: '/country/$countryId', params: { countryId: String(item.countryId) }, search: { tab: 'tasks' } });
    } else {
      void navigate({ to: '/country/$countryId', params: { countryId: String(item.countryId) } });
    }
  };

  const openItem = (item: NotificationItem) => {
    if (!item.isRead) {
      markRead.mutate(
        { id: item.id },
        {
          onSuccess: () => {
            invalidateNotifications();
            onClose();
            focusItem(item);
          },
          onError: () => {
            invalidateNotifications();
            onClose();
            focusItem(item);
          },
        },
      );
    } else {
      onClose();
      focusItem(item);
    }
  };

  const markAll = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => invalidateNotifications(),
      onError: () => invalidateNotifications(),
    });
  };

  return (
    <div ref={ref} role="menu" data-testid="notifications-panel" className="absolute right-0 top-full z-30 mt-2 w-[min(92vw,400px)] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_18px_50px_hsl(190_37%_15%/.24)]">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Notifications</p>
        <button onClick={markAll} disabled={unreadCount === 0} data-testid="notifications-mark-all-read" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-40">
          <CheckCheck size={13} /> Mark all read
        </button>
      </div>
      <div className="max-h-[68vh] overflow-y-auto">
        {notificationsQuery.isLoading ? (
          <div className="space-y-2 p-4" data-testid="notifications-loading">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />
            ))}
          </div>
        ) : notificationsQuery.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <CircleAlert className="text-[hsl(var(--destructive))]" size={22} />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Notifications could not be loaded.</p>
            <button onClick={() => void notificationsQuery.refetch()} className="rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))]" data-testid="notifications-retry">Retry</button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-6 py-12 text-center" data-testid="notifications-empty">
            <CheckCheck className="mx-auto mb-3 text-[hsl(157_38%_39%)]" size={22} />
            <p className="text-sm font-bold text-[hsl(var(--foreground))]">All caught up</p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">No alerts right now.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {sorted.map((item) => {
              const meta = KIND_META[item.kind];
              const Icon = meta.icon;
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => openItem(item)} data-testid={`notifications-item-${item.id}`} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-[hsl(var(--muted))] ${item.isRead ? 'bg-[hsl(var(--card))]' : 'bg-[hsl(var(--primary)/.06)]'}`}>
                    <span className={`relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${item.isRead ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]' : 'bg-[hsl(42_76%_68%/.24)] text-[hsl(28_55%_28%)]'}`}>
                      <Icon size={15} />
                      {!item.isRead && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[hsl(4_64%_48%)] ring-2 ring-[hsl(var(--card))]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{meta.label}</span>
                        <span className="shrink-0 text-[10px] text-[hsl(var(--muted-foreground))]">{relativeTime(item.createdAt)}</span>
                      </span>
                      <span className="mt-1 block text-[13px] font-semibold leading-snug text-[hsl(var(--foreground))]">{item.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-[hsl(var(--muted-foreground))]">{item.body}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}