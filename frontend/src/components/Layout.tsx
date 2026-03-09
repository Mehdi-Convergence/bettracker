import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ScanSearch,
  Ticket,
  Flag,
  Layers,
  History,
  BarChart3,
  MessageCircle,
  Settings,
  User,
  LogOut,
  Bell,
  Search,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/* ── Sidebar colors ── */
const SB = {
  bg: "#1e2535",
  border: "rgba(255,255,255,0.07)",
  text: "rgba(255,255,255,0.48)",
  textHover: "rgba(255,255,255,0.82)",
  hover: "rgba(255,255,255,0.05)",
  active: "rgba(255,255,255,0.09)",
};

/* ── Navigation structure ── */
const NAV_SECTIONS = [
  {
    label: "Analyse",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/scanner", label: "Scan matchs", icon: ScanSearch, badge: null },
    ],
  },
  {
    label: "Paris",
    items: [
      { to: "/scanner?tab=tickets", label: "Tickets", icon: Ticket, badge: null, badgeColor: "amber" as const },
      { to: "/campaign", label: "Campagnes", icon: Flag },
      { to: "/portfolio", label: "Portfolio", icon: Layers },
    ],
  },
  {
    label: "Suivi",
    items: [
      { to: "/portfolio?view=history", label: "Historique", icon: History },
      { to: "/backtest", label: "Statistiques", icon: BarChart3 },
    ],
  },
];

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "text-slate-400" },
  pro: { label: "Pro", color: "text-[#7eb8ff]" },
  premium: { label: "Elite", color: "text-purple-400" },
};

/* ── Breadcrumb map ── */
const PAGE_NAMES: Record<string, string> = {
  "/": "Dashboard",
  "/scanner": "Scan matchs",
  "/backtest": "Statistiques",
  "/campaign": "Campagnes",
  "/portfolio": "Portfolio",
  "/settings": "Mon profil",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const currentPage = PAGE_NAMES[location.pathname] || "BetTracker";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── SIDEBAR ── */}
      <aside
        className="w-[228px] min-w-[228px] flex flex-col"
        style={{ background: SB.bg }}
      >
        {/* Logo */}
        <div
          className="h-14 px-[18px] flex items-center gap-[9px]"
          style={{ borderBottom: `1px solid ${SB.border}` }}
        >
          <div className="w-7 h-7 bg-[#4f8cff] rounded-[7px] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" className="w-[15px] h-[15px]">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <span className="font-extrabold text-[15px] tracking-tight text-white">
            Bet<span className="text-[#7eb8ff]">Tracker</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2.5 px-2 flex flex-col gap-px overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <span
                className="block text-[10px] font-semibold tracking-[0.1em] uppercase px-2.5 pt-2.5 pb-1.5"
                style={{ color: "rgba(255,255,255,0.2)" }}
              >
                {section.label}
              </span>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-[9px] px-2.5 py-2 rounded-lg text-[13.5px] transition-all duration-100 no-underline ${
                        isActive
                          ? "font-semibold text-white"
                          : "font-normal hover:text-[rgba(255,255,255,0.82)]"
                      }`
                    }
                    style={({ isActive }) => ({
                      color: isActive ? "#fff" : SB.text,
                      background: isActive ? SB.active : "transparent",
                    })}
                  >
                    <Icon
                      size={16}
                      className="shrink-0 transition-opacity"
                      style={{ opacity: 0.45 }}
                    />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}

          {/* Divider */}
          <div className="h-px mx-2 my-1.5" style={{ background: SB.border }} />

          {/* IA Analyste */}
          <NavLink
            to="/scanner?mode=ai"
            className="flex items-center gap-[9px] px-2.5 py-2 rounded-lg text-[13.5px] font-semibold no-underline"
            style={{
              background: "rgba(79,140,255,0.12)",
              color: "#7eb8ff",
              border: "1px solid rgba(79,140,255,0.18)",
            }}
          >
            <MessageCircle size={16} className="shrink-0" />
            IA Analyste
            <span
              className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(126,184,255,0.15)", color: "#7eb8ff" }}
            >
              β
            </span>
          </NavLink>
        </nav>

        {/* Bottom */}
        <div style={{ borderTop: `1px solid ${SB.border}` }} className="p-2">
          <NavLink
            to="/settings"
            className="flex items-center gap-[9px] px-2.5 py-2 rounded-lg text-[13.5px] no-underline transition-all"
            style={({ isActive }) => ({
              color: isActive ? "#fff" : SB.text,
              background: isActive && location.pathname === "/settings" ? SB.active : "transparent",
            })}
          >
            <Settings size={16} className="shrink-0" style={{ opacity: 0.45 }} />
            Paramètres
          </NavLink>
          <NavLink
            to="/settings"
            end
            className="flex items-center gap-[9px] px-2.5 py-2 rounded-lg text-[13.5px] no-underline transition-all"
            style={({ isActive }) => ({
              color: isActive ? "#fff" : SB.text,
              background: isActive && location.pathname === "/settings" ? SB.active : "transparent",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            <User size={16} className="shrink-0" style={{ opacity: 0.45 }} />
            Mon profil
          </NavLink>
          <button
            onClick={logout}
            className="w-full flex items-center gap-[9px] px-2.5 py-2 rounded-lg text-[13.5px] transition-all cursor-pointer border-none bg-transparent"
            style={{ color: "rgba(240,68,56,0.65)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(240,68,56,0.08)";
              e.currentTarget.style.color = "#f04438";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(240,68,56,0.65)";
            }}
          >
            <LogOut size={16} className="shrink-0" style={{ opacity: 0.45 }} />
            Déconnexion
          </button>

          <div className="h-px mx-2 my-1.5" style={{ background: SB.border }} />

          {/* User chip */}
          {user && (
            <div className="flex items-center gap-[9px] px-2.5 py-[9px] rounded-lg">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ background: "linear-gradient(135deg, #4f8cff, #a78bfa)" }}
              >
                {getInitials(user.display_name)}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.82)" }}>
                  {user.display_name}
                </div>
                <div
                  className={`text-[10.5px] uppercase tracking-wide ${TIER_CONFIG[user.tier]?.color || "text-slate-400"}`}
                >
                  {TIER_CONFIG[user.tier]?.label || user.tier} · actif
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="h-14 min-h-14 border-b border-[#e3e6eb] bg-white flex items-center px-7 gap-3">
          <div className="flex items-center gap-1.5 text-[13px] text-[#8a919e]">
            <span>BetTracker</span>
            <span className="text-[11px] text-[#b0b7c3]">›</span>
            <span className="text-[#111318] font-semibold">{currentPage}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="w-8 h-8 rounded-lg bg-transparent border border-[#e3e6eb] flex items-center justify-center cursor-pointer text-[#8a919e] hover:bg-[#f4f5f7] hover:border-[#cdd1d9] hover:text-[#111318] transition-all relative">
              <Bell size={14} />
              <span className="absolute top-[5px] right-[5px] w-[5px] h-[5px] bg-[#3b5bdb] rounded-full border-[1.5px] border-white" />
            </button>
            <button className="w-8 h-8 rounded-lg bg-transparent border border-[#e3e6eb] flex items-center justify-center cursor-pointer text-[#8a919e] hover:bg-[#f4f5f7] hover:border-[#cdd1d9] hover:text-[#111318] transition-all">
              <Search size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
