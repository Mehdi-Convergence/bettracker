import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Search, FlaskConical, Wallet, Rocket } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/scanner", label: "Scanner", icon: Search },
  { to: "/backtest", label: "Backtest", icon: FlaskConical },
  { to: "/campaign", label: "Campagne", icon: Rocket },
  { to: "/portfolio", label: "Portfolio", icon: Wallet },
];

export default function Layout() {
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
        <div className="p-3 border-t border-slate-700 text-xs text-slate-500">
          v0.2.0 - 16 leagues
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6 bg-slate-100">
        <Outlet />
      </main>
    </div>
  );
}
