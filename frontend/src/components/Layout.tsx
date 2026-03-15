import { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  ScanSearch,
  Flag,
  Layers,
  FlaskConical,
  MessageCircle,
  Settings,
  User,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  HelpCircle,
  Send,
  X,
  Menu,
  BarChart2,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { BreadcrumbProvider, useBreadcrumb } from "@/contexts/BreadcrumbContext";
import NotificationBell from "@/components/NotificationBell";
import OnboardingModal from "@/components/OnboardingModal";
import { TourProvider, useTourContext } from "@/contexts/TourContext";
import { sendFeedback } from "@/services/api";

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
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/scanner", label: "Scan matchs", icon: ScanSearch },
    ],
  },
  {
    label: "Paris",
    items: [
      { to: "/campaign", label: "Campagnes", icon: Flag },
      { to: "/portfolio", label: "Portfolio", icon: Layers },
    ],
  },
  {
    label: "Suivi",
    items: [
      { to: "/analytics", label: "Analytique", icon: BarChart2 },
      { to: "/backtest", label: "Backtest", icon: FlaskConical },
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
  "/dashboard": "Dashboard",
  "/scanner": "Scan matchs",
  "/analytics": "Analytique",
  "/backtest": "Backtest",
  "/campaign": "Campagnes",
  "/portfolio": "Portfolio",
  "/settings": "Mon profil",
  "/parametres": "Paramètres",
  "/ai-analyst": "IA Analyste",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function Breadcrumb() {
  const location = useLocation();
  const { label } = useBreadcrumb();

  // Dynamic breadcrumb for /campaign/:id
  const campaignDetailMatch = location.pathname.match(/^\/campaign\/(\d+)$/);
  if (campaignDetailMatch) {
    return (
      <div className="flex items-center gap-1.5 text-[13px] text-[#8a919e]">
        <span>BetTracker</span>
        <span className="text-[11px] text-[#b0b7c3]">&rsaquo;</span>
        <Link to="/campaign" className="hover:text-[#111318] transition-colors no-underline text-[#8a919e]">Campagnes</Link>
        <span className="text-[11px] text-[#b0b7c3]">&rsaquo;</span>
        <span className="text-[#111318] font-semibold">{label || "..."}</span>
      </div>
    );
  }

  const currentPage = PAGE_NAMES[location.pathname] || "BetTracker";
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-[#8a919e]">
      <span>BetTracker</span>
      <span className="text-[11px] text-[#b0b7c3]">&rsaquo;</span>
      <span className="text-[#111318] font-semibold">{currentPage}</span>
    </div>
  );
}

function HelpAndFeedback() {
  const { requestTour } = useTourContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function handleSend() {
    if (!message.trim()) return;
    setStatus("sending");
    try {
      await sendFeedback(message.trim());
      setStatus("done");
      setTimeout(() => { setFeedbackOpen(false); setMessage(""); setStatus("idle"); }, 2000);
    } catch {
      setStatus("error");
    }
  }

  function openFeedback() { setMenuOpen(false); setFeedbackOpen(true); }
  function startTour() { setMenuOpen(false); requestTour?.(); }

  return (
    <>
      {/* Single ? button */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all text-[13px] font-bold border-none ${
            menuOpen
              ? "bg-[#e8eaed] text-[#111318]"
              : "bg-[#f4f5f7] text-[#5a6272] hover:bg-[#e8eaed] hover:text-[#111318]"
          }`}
        >
          ?
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-10 z-50 bg-white border border-[#e3e6eb] rounded-xl shadow-lg py-1 w-48 overflow-hidden">
              {requestTour && (
                <button onClick={startTour}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#3c4149] hover:bg-[#f4f5f7] transition-colors text-left bg-transparent border-none cursor-pointer">
                  <HelpCircle size={14} className="text-[#3b5bdb]" />
                  Visite guidée
                </button>
              )}
              <button onClick={openFeedback}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#3c4149] hover:bg-[#f4f5f7] transition-colors text-left bg-transparent border-none cursor-pointer">
                <MessageCircle size={14} className="text-[#7c3aed]" />
                Envoyer un message
              </button>
            </div>
          </>
        )}
      </div>

      {/* Feedback modal */}
      {feedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }} onClick={() => setFeedbackOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[440px] mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-extrabold text-[#111318]">Envoyer un message</h3>
              <button onClick={() => setFeedbackOpen(false)} className="text-[#b0b7c3] hover:text-[#111318] bg-transparent border-none cursor-pointer p-1 transition-colors">
                <X size={18} />
              </button>
            </div>

            {status === "done" ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-[14px] font-semibold text-[#12b76a]">Message envoyé, merci !</p>
              </div>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Retour, bug, suggestion..."
                  rows={5}
                  className="w-full border border-[#e3e6eb] rounded-xl px-3.5 py-3 text-[13px] text-[#111318] outline-none resize-none focus:border-[#7c3aed] focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)] transition-all placeholder:text-[#b0b7c3]"
                />
                {status === "error" && (
                  <p className="text-[12px] text-[#f04438] mt-1.5">Erreur d'envoi, réessaie.</p>
                )}
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || status === "sending"}
                  className="w-full mt-3 py-[11px] rounded-xl bg-[#7c3aed] text-white text-[13px] font-bold flex items-center justify-center gap-2 cursor-pointer border-none hover:bg-[#6d28d9] transition-all disabled:opacity-50"
                >
                  {status === "sending" ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <Send size={14} />
                  )}
                  Envoyer
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [verifSent, setVerifSent] = useState(false);

  const resendVerification = useCallback(async () => {
    try {
      const token = (await import("@/services/api")).getAccessToken();
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setVerifSent(true);
    } catch {
      // Silencieux — l'utilisateur peut reessayer
    }
  }, []);

  // Ferme le drawer mobile à chaque navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const w = collapsed ? "w-[60px] min-w-[60px]" : "w-[228px] min-w-[228px]";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── OVERLAY MOBILE ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        className={`${w} flex flex-col transition-all duration-200 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[228px] max-md:min-w-[228px] ${mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"}`}
        style={{ background: SB.bg }}
      >
        {/* Logo */}
        <Link
          to="/dashboard"
          className={`h-14 flex items-center gap-[9px] no-underline ${collapsed ? "justify-center px-0" : "px-[18px]"} hover:opacity-80 transition-opacity`}
          style={{ borderBottom: `1px solid ${SB.border}` }}
        >
          <div className="w-7 h-7 bg-[#4f8cff] rounded-[7px] flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" className="w-[15px] h-[15px]">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-extrabold text-[15px] tracking-tight text-white whitespace-nowrap">
                Bet<span className="text-[#7eb8ff]">Tracker</span>
              </span>
              <span className="text-[9px] font-bold tracking-widest uppercase px-[5px] py-[2px] rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white leading-none shrink-0">
                BETA
              </span>
            </div>
          )}
        </Link>

        {/* Navigation */}
        <nav className={`flex-1 py-2.5 ${collapsed ? "px-1.5" : "px-2"} flex flex-col gap-px overflow-y-auto`}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <span
                  className="block text-[10px] font-semibold tracking-[0.1em] uppercase px-2.5 pt-2.5 pb-1.5"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  {section.label}
                </span>
              )}
              {collapsed && <div className="h-1.5" />}
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/dashboard"}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center ${collapsed ? "justify-center" : "gap-[9px]"} ${collapsed ? "px-0 py-2" : "px-2.5 py-2"} rounded-lg text-[13.5px] transition-all duration-100 no-underline ${
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
                      size={collapsed ? 18 : 16}
                      className="shrink-0 transition-opacity"
                      style={{ opacity: 0.45 }}
                    />
                    {!collapsed && item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}

          {/* Divider */}
          <div className="h-px mx-2 my-1.5" style={{ background: SB.border }} />

          {/* IA Analyste — admin only for now, "Bientot" badge for others */}
          {user?.is_admin ? (
            <NavLink
              to="/ai-analyst"
              title={collapsed ? "IA Analyste" : undefined}
              className={`flex items-center ${collapsed ? "justify-center" : "gap-[9px]"} ${collapsed ? "px-0 py-2" : "px-2.5 py-2"} rounded-lg text-[13.5px] font-semibold no-underline`}
              style={{
                background: "rgba(79,140,255,0.12)",
                color: "#7eb8ff",
                border: "1px solid rgba(79,140,255,0.18)",
              }}
            >
              <MessageCircle size={collapsed ? 18 : 16} className="shrink-0" />
              {!collapsed && "IA Analyste"}
            </NavLink>
          ) : (
            <div
              className={`flex items-center ${collapsed ? "justify-center" : "gap-[9px]"} ${collapsed ? "px-0 py-2" : "px-2.5 py-2"} rounded-lg text-[13.5px] font-semibold opacity-50 cursor-default`}
              style={{
                background: "rgba(79,140,255,0.06)",
                color: "#7eb8ff",
                border: "1px solid rgba(79,140,255,0.10)",
              }}
              title="Bientot disponible"
            >
              <MessageCircle size={collapsed ? 18 : 16} className="shrink-0" />
              {!collapsed && (
                <>
                  IA Analyste
                  <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold bg-[rgba(79,140,255,0.15)] text-[#7eb8ff]">Bientot</span>
                </>
              )}
            </div>
          )}
          {/* Admin link — visible aux admins uniquement */}
          {user?.is_admin && (
            <>
              <div className="h-px mx-2 my-1.5" style={{ background: SB.border }} />
              <NavLink
                to="/admin"
                title={collapsed ? "Admin" : undefined}
                className={`flex items-center ${collapsed ? "justify-center" : "gap-[9px]"} ${collapsed ? "px-0 py-2" : "px-2.5 py-2"} rounded-lg text-[13.5px] font-semibold no-underline`}
                style={{
                  background: "rgba(240,68,56,0.10)",
                  color: "#f04438",
                  border: "1px solid rgba(240,68,56,0.18)",
                }}
              >
                <ShieldAlert size={collapsed ? 18 : 16} className="shrink-0" />
                {!collapsed && "Admin"}
              </NavLink>
            </>
          )}
        </nav>

        {/* Bottom */}
        <div style={{ borderTop: `1px solid ${SB.border}` }} className="p-2">
          {/* Collapse toggle — masqué sur mobile */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`max-md:hidden w-full flex items-center ${collapsed ? "justify-center" : "gap-[9px]"} ${collapsed ? "px-0" : "px-2.5"} py-2 rounded-lg text-[13.5px] transition-all cursor-pointer border-none bg-transparent`}
            style={{ color: SB.text }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = SB.hover;
              e.currentTarget.style.color = SB.textHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = SB.text;
            }}
          >
            {collapsed ? <ChevronsRight size={16} className="shrink-0" style={{ opacity: 0.45 }} /> : <ChevronsLeft size={16} className="shrink-0" style={{ opacity: 0.45 }} />}
            {!collapsed && "Réduire"}
          </button>

          <NavLink
            to="/parametres"
            title={collapsed ? "Paramètres" : undefined}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-[9px]"} ${collapsed ? "px-0" : "px-2.5"} py-2 rounded-lg text-[13.5px] no-underline transition-all`}
            style={({ isActive }) => ({
              color: isActive ? "#fff" : SB.text,
              background: isActive && location.pathname === "/parametres" ? SB.active : "transparent",
            })}
          >
            <Settings size={16} className="shrink-0" style={{ opacity: 0.45 }} />
            {!collapsed && "Paramètres"}
          </NavLink>
          <NavLink
            to="/settings"
            end
            title={collapsed ? "Mon profil" : undefined}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-[9px]"} ${collapsed ? "px-0" : "px-2.5"} py-2 rounded-lg text-[13.5px] no-underline transition-all`}
            style={({ isActive }) => ({
              color: isActive ? "#fff" : SB.text,
              background: isActive && location.pathname === "/settings" ? SB.active : "transparent",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            <User size={16} className="shrink-0" style={{ opacity: 0.45 }} />
            {!collapsed && "Mon profil"}
          </NavLink>
          <button
            onClick={logout}
            title={collapsed ? "Déconnexion" : undefined}
            className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-[9px]"} ${collapsed ? "px-0" : "px-2.5"} py-2 rounded-lg text-[13.5px] transition-all cursor-pointer border-none bg-transparent`}
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
            {!collapsed && "Déconnexion"}
          </button>

          <div className="h-px mx-2 my-1.5" style={{ background: SB.border }} />

          {/* User chip */}
          {user && (
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-[9px]"} ${collapsed ? "px-0" : "px-2.5"} py-[9px] rounded-lg`}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ background: "linear-gradient(135deg, #4f8cff, #a78bfa)" }}
              >
                {getInitials(user.display_name)}
              </div>
              {!collapsed && (
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
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <TourProvider>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Topbar */}
          <div className="h-14 min-h-14 border-b border-[#e3e6eb] bg-white flex items-center px-7 gap-3 max-md:px-4">
            {/* Hamburger mobile */}
            <button
              className="hidden max-md:flex items-center justify-center w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer text-[#5a6272] hover:bg-[#f4f5f7] shrink-0"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <Breadcrumb />
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <HelpAndFeedback />
            </div>
          </div>

          {/* Bandeau verification email */}
          {user && !user.email_verified && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-sm flex items-center justify-between">
              <span>Verifiez votre adresse email pour securiser votre compte.</span>
              {verifSent ? (
                <span className="text-amber-400 ml-4 text-xs">Email envoye !</span>
              ) : (
                <button
                  onClick={resendVerification}
                  className="text-amber-400 underline hover:text-amber-300 ml-4 bg-transparent border-none cursor-pointer text-sm p-0"
                >
                  Renvoyer l'email
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-5 flex flex-col">
            <BreadcrumbProvider>
              <Outlet />
            </BreadcrumbProvider>
          </main>
        </div>
      </TourProvider>

      {/* Onboarding modal */}
      {user && !user.onboarding_completed && <OnboardingModal />}
    </div>
  );
}
