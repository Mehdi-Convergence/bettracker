import { Link } from "react-router-dom";

export default function FooterLegal() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-3 px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs mt-auto">
      <span>© 2026 BetTracker — Jeu responsable 18+</span>
      <nav className="flex items-center gap-3">
        <Link
          to="/mentions-legales"
          className="text-slate-400 hover:text-slate-200 transition-colors no-underline"
        >
          Mentions légales
        </Link>
        <span className="text-slate-600">|</span>
        <Link
          to="/cgu"
          className="text-slate-400 hover:text-slate-200 transition-colors no-underline"
        >
          CGU
        </Link>
        <span className="text-slate-600">|</span>
        <Link
          to="/confidentialite"
          className="text-slate-400 hover:text-slate-200 transition-colors no-underline"
        >
          Confidentialité
        </Link>
      </nav>
    </footer>
  );
}
