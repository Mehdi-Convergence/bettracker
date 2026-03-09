import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, Mail, Lock, Eye, EyeOff, UserPlus, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Mode = "login" | "signup";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Signup
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPwd, setSignupPwd] = useState("");
  const [signupErr, setSignupErr] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupErr("");
    if (signupPwd.length < 8) { setSignupErr("Min. 8 caractères"); return; }
    setSignupLoading(true);
    try {
      await register(signupEmail, signupPwd, signupName);
      navigate("/");
    } catch (err: unknown) {
      setSignupErr(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSignupLoading(false);
    }
  };

  const inputCls = "w-full py-[11px] pl-[38px] pr-3.5 bg-white border-[1.5px] border-[#e3e6eb] rounded-[10px] text-[14px] text-[#111318] outline-none transition-all focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.07)] placeholder:text-[#b0b7c3]";
  const inputNoPadCls = "w-full py-[11px] px-3.5 bg-white border-[1.5px] border-[#e3e6eb] rounded-[10px] text-[14px] text-[#111318] outline-none transition-all focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.07)] placeholder:text-[#b0b7c3]";
  const labelCls = "text-[11.5px] font-semibold text-[#3c4149] tracking-wide";

  return (
    <div className="grid min-h-screen" style={{ gridTemplateColumns: "1fr 1fr" }}>
      {/* ── LEFT PANEL: BRANDING ── */}
      <div className="relative overflow-hidden flex flex-col justify-between p-10 px-12" style={{ background: "#1e2535" }}>
        {/* Grid decoration */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Glow circles */}
        <div className="absolute -top-30 -right-30 w-[480px] h-[480px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(79,140,255,0.15) 0%, transparent 70%)" }} />
        <div className="absolute -bottom-20 -left-20 w-[360px] h-[360px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(18,183,106,0.1) 0%, transparent 70%)" }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#4f8cff] rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" className="w-[17px] h-[17px]">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <span className="font-extrabold text-[17px] tracking-tight text-white">
            Bet<span className="text-[#7eb8ff]">Tracker</span>
          </span>
        </div>

        {/* Center content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
          <div className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#7eb8ff] mb-4">
            Value Bet Detection
          </div>
          <h1 className="text-[38px] font-extrabold tracking-tight leading-[1.1] text-white mb-4">
            Pariez plus{" "}
            <span className="bg-gradient-to-r from-[#7eb8ff] to-[#12b76a] bg-clip-text text-transparent">
              intelligemment
            </span>
          </h1>
          <p className="text-[15px] leading-relaxed max-w-[360px] mb-9" style={{ color: "rgba(255,255,255,0.48)" }}>
            Détection automatique des value bets, suivi de vos performances et campagnes intelligentes. Tout ce qu'il faut pour des paris basés sur les données.
          </p>

          <div className="flex flex-col gap-3">
            {[
              { emoji: "🔍", text: "Scan automatique des matchs à fort edge", bg: "rgba(79,140,255,0.15)" },
              { emoji: "📊", text: "Suivi ROI en temps réel · Historique complet", bg: "rgba(18,183,106,0.15)" },
              { emoji: "🤖", text: "Campagnes auto-pilotées par l'algorithme", bg: "rgba(247,144,9,0.15)" },
              { emoji: "💬", text: "IA Analyste disponible 24h/24", bg: "rgba(139,92,246,0.15)" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 text-[13.5px]" style={{ color: "rgba(255,255,255,0.65)" }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[13px]" style={{ background: f.bg }}>
                  {f.emoji}
                </div>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        {/* Social proof */}
        <div
          className="relative z-10 flex items-center gap-3 px-4 py-3.5 rounded-xl"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex">
            {["#4f8cff", "#12b76a", "#f79009", "#7c3aed", "#f04438"].map((c, i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2"
                style={{ background: c, borderColor: "#1e2535", marginLeft: i > 0 ? "-8px" : 0 }}
              >
                {["A", "T", "R", "M", "K"][i]}
              </div>
            ))}
          </div>
          <div className="text-[12px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            <strong style={{ color: "rgba(255,255,255,0.85)" }}>+1 240 bettors</strong> font confiance à BetTracker · ROI moyen <strong className="text-[#12b76a]">+14.2%</strong>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: FORM ── */}
      <div className="bg-[#f4f5f7] flex items-center justify-center px-8 py-10">
        <div className="w-full max-w-[400px] animate-fade-up">
          {/* Header */}
          <div className="mb-7">
            <h2 className="text-[22px] font-extrabold tracking-tight text-[#111318]">
              {mode === "login" ? "Bon retour" : "Créez votre compte"}
            </h2>
            <p className="text-[13px] text-[#8a919e] mt-1">
              {mode === "login" ? "Connectez-vous à votre espace BetTracker" : "7 jours gratuits · aucune carte requise"}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex bg-white border border-[#e3e6eb] rounded-[10px] p-[3px] mb-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-[9px] text-[13px] font-medium rounded-lg cursor-pointer transition-all border-none ${
                mode === "login" ? "bg-[#1e2535] text-white font-semibold" : "bg-transparent text-[#8a919e] hover:text-[#3c4149]"
              }`}
            >
              Connexion
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-[9px] text-[13px] font-medium rounded-lg cursor-pointer transition-all border-none ${
                mode === "signup" ? "bg-[#1e2535] text-white font-semibold" : "bg-transparent text-[#8a919e] hover:text-[#3c4149]"
              }`}
            >
              Créer un compte
            </button>
          </div>

          {/* ── LOGIN FORM ── */}
          {mode === "login" && (
            <form onSubmit={handleLogin}>
              <div className="flex flex-col gap-3.5">
                {error && (
                  <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#f04438]" style={{ background: "rgba(240,68,56,0.06)", border: "1px solid rgba(240,68,56,0.2)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Adresse e-mail</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className={inputCls}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Mot de passe</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Votre mot de passe"
                      className={inputCls + " pr-[42px]"}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[#b0b7c3] hover:text-[#111318] transition-colors p-0"
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between -mt-1">
                  <label className="flex items-center gap-2 text-[12.5px] text-[#8a919e] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="w-[15px] h-[15px] accent-[#3b5bdb] cursor-pointer"
                    />
                    Se souvenir de moi
                  </label>
                  <Link to="/forgot-password" className="text-[12.5px] text-[#3b5bdb] font-medium no-underline hover:underline">
                    Mot de passe oublié ?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-[13px] rounded-[10px] border-none bg-[#3b5bdb] text-white text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all shadow-[0_2px_8px_rgba(59,91,219,0.3)] hover:bg-[#2f4ac7] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(59,91,219,0.35)] disabled:opacity-70 mt-1"
                >
                  {loading ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <LogIn size={16} />
                  )}
                  Se connecter
                </button>
              </div>

              <div className="text-center text-[13px] text-[#8a919e] mt-5 pt-5 border-t border-[#e3e6eb]">
                Pas encore de compte ?{" "}
                <button type="button" onClick={() => setMode("signup")} className="text-[#3b5bdb] font-semibold bg-transparent border-none cursor-pointer hover:underline p-0">
                  Essai gratuit 7 jours →
                </button>
              </div>
            </form>
          )}

          {/* ── SIGNUP FORM ── */}
          {mode === "signup" && (
            <form onSubmit={handleSignup}>
              <div className="flex flex-col gap-3.5">
                {/* Trial badge */}
                <div
                  className="flex items-center gap-2.5 px-3.5 py-3 rounded-[10px] text-[12.5px] text-[#3c4149]"
                  style={{ background: "linear-gradient(90deg, rgba(18,183,106,0.07), rgba(18,183,106,0.03))", border: "1px solid rgba(18,183,106,0.2)" }}
                >
                  <Check size={16} className="text-[#12b76a] shrink-0" />
                  <span><strong className="text-[#12b76a]">7 jours gratuits</strong> · Aucune CB requise · Résiliation en 1 clic</span>
                </div>

                {signupErr && (
                  <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#f04438]" style={{ background: "rgba(240,68,56,0.06)", border: "1px solid rgba(240,68,56,0.2)" }}>
                    {signupErr}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Pseudo</label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    <input
                      type="text"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="MehdiQ_bets"
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Adresse e-mail</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Mot de passe</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                    <input
                      type="password"
                      value={signupPwd}
                      onChange={(e) => setSignupPwd(e.target.value)}
                      placeholder="Min. 8 caractères"
                      className={inputNoPadCls + " pl-[38px]"}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={signupLoading}
                  className="w-full py-[13px] rounded-[10px] border-none bg-[#12b76a] text-white text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all shadow-[0_2px_8px_rgba(18,183,106,0.3)] hover:bg-[#0ea55e] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(18,183,106,0.35)] disabled:opacity-70"
                >
                  {signupLoading ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <UserPlus size={16} />
                  )}
                  Créer mon compte gratuit
                </button>

                <p className="text-[11px] text-[#b0b7c3] text-center leading-relaxed">
                  En créant un compte vous acceptez les{" "}
                  <Link to="#" className="text-[#3b5bdb] no-underline">CGU</Link> et la{" "}
                  <Link to="#" className="text-[#3b5bdb] no-underline">politique de confidentialité</Link>.
                </p>
              </div>

              <div className="text-center text-[13px] text-[#8a919e] mt-5 pt-5 border-t border-[#e3e6eb]">
                Déjà un compte ?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-[#3b5bdb] font-semibold bg-transparent border-none cursor-pointer hover:underline p-0">
                  Se connecter →
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

    </div>
  );
}
