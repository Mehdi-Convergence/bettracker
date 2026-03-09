import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Search, FlaskConical, Wallet, Rocket, LogOut, User, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/scanner", label: "Scanner", icon: Search },
  { to: "/backtest", label: "Backtest", icon: FlaskConical },
  { to: "/campaign", label: "Campagne", icon: Rocket },
  { to: "/portfolio", label: "Portfolio", icon: Wallet },
];

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "bg-slate-600 text-slate-200" },
  pro: { label: "Pro", color: "bg-blue-600 text-white" },
  premium: { label: "Premium", color: "bg-amber-500 text-white" },
};

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar */}
      <nav className="w-56 bg-slate-900 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-lg font-bold text-white">BetTracker</h1>
          <p className="text-xs text-slate-400">Value Bet Detection</p>
        </div>
        <div className="flex-1 py-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-blue-600/20 text-blue-400 border-r-2 border-blue-400"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
        {user && (
          <div className="p-3 border-t border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <User size={14} className="text-slate-400" />
              <span className="text-sm text-slate-200 truncate">{user.display_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TIER_LABELS[user.tier]?.color || "bg-slate-600 text-slate-200"}`}>
                {TIER_LABELS[user.tier]?.label || user.tier}
              </span>
              <div className="flex items-center gap-2">
                <NavLink to="/settings" className="text-slate-400 hover:text-white transition-colors">
                  <Settings size={12} />
                </NavLink>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors"
                >
                  <LogOut size={12} />
                  Quitter
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6 bg-slate-100">
        <Outlet />
      </main>
    </div>
  );
}
