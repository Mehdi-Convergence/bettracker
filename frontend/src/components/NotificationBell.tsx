import { useEffect, useState, useRef, useCallback } from "react";
import { Bell, Check, AlertTriangle, TrendingDown, Flag, Zap, Target } from "lucide-react";
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from "@/services/api";
import type { AppNotification } from "@/types";

const ICON_MAP: Record<string, typeof Bell> = {
  stop_loss: AlertTriangle,
  low_bankroll: TrendingDown,
  campaign_ending: Flag,
  new_ticket: Zap,
  smart_stop: Target,
};

const COLOR_MAP: Record<string, string> = {
  stop_loss: "#f04438",
  low_bankroll: "#f79009",
  campaign_ending: "#3b5bdb",
  new_ticket: "#12b76a",
  smart_stop: "#7c3aed",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const data = await getUnreadCount();
      setUnreadCount(data.count);
    } catch { /* silent */ }
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Fetch notifications when opening
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getNotifications()
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleMarkRead = async (id: number) => {
    try {
      const updated = await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg bg-transparent border border-[#e3e6eb] flex items-center justify-center cursor-pointer text-[#8a919e] hover:bg-[#f4f5f7] hover:border-[#cdd1d9] hover:text-[#111318] transition-all relative"
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold text-white bg-[#f04438] rounded-full px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-[360px] bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#e3e6eb] z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e3e6eb]">
            <span className="text-[14px] font-semibold text-[#111318]">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-[12px] text-[#3b5bdb] hover:text-[#2b4bc0] bg-transparent border-none cursor-pointer font-medium"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-[13px] text-[#8a919e]">Chargement...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[#8a919e]">
                Aucune notification
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = ICON_MAP[n.type] || Bell;
                const color = COLOR_MAP[n.type] || "#8a919e";
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && handleMarkRead(n.id)}
                    className={`flex gap-3 px-4 py-3 border-b border-[#f4f5f7] transition-colors ${
                      n.is_read
                        ? "bg-white"
                        : "bg-[#f8f9fb] cursor-pointer hover:bg-[#f0f2f5]"
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `${color}12` }}
                    >
                      <Icon size={15} style={{ color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-[13px] leading-tight ${
                            n.is_read ? "text-[#8a919e]" : "text-[#111318] font-semibold"
                          }`}
                        >
                          {n.title}
                        </span>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-[#3b5bdb] shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-[12px] text-[#8a919e] mt-0.5 leading-relaxed line-clamp-2 m-0">
                        {n.message}
                      </p>
                      <span className="text-[11px] text-[#b0b7c3] mt-1 block">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
