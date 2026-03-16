import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Navigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useAuth } from "@/contexts/AuthContext";
import {
  aiChatStream,
  getAIConversations,
  getAIConversationMessages,
  deleteAIConversation,
  getAIContext,
} from "@/services/api";
import type {
  AIConversation,
  AIMessageData,
  AIContext,
  AIContextValueBet,
} from "@/types";
import {
  MessageCircle,
  Send,
  TrendingUp,
  Zap,
  BarChart3,
  CreditCard,
  CheckSquare,
  Trash2,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Gauge,
  Trophy,
  Target,
  Settings,
  History,
  Plus,
  StickyNote,
} from "lucide-react";

/* ================================================================
   MARKDOWN
   ================================================================ */

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text: string): string {
  const raw = marked.parse(text);
  const html = typeof raw === "string" ? raw : "";
  return DOMPurify.sanitize(html);
}

/* ================================================================
   TYPES
   ================================================================ */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  streaming?: boolean;
}

const QUICK_ACTIONS = [
  { label: "Analyser mon ticket", icon: CheckSquare },
  { label: "Value bets du jour", icon: TrendingUp },
  { label: "Ticket auto", icon: Zap },
  { label: "Review strategie", icon: BarChart3 },
  { label: "Simulation bankroll", icon: CreditCard },
];

const SPORT_LABELS: Record<string, string> = {
  football: "Football",
  tennis: "Tennis",
  nba: "NBA",
  mlb: "MLB",
  rugby: "Rugby",
  pmu: "PMU",
};

const ALL_SPORTS = ["football", "tennis", "nba", "mlb", "rugby"];

interface CtxSettings {
  period: number;
  vb_limit: number;
  min_edge: number;
  sports: string[];
  notes: string;
}

const DEFAULT_CTX_SETTINGS: CtxSettings = { period: 30, vb_limit: 7, min_edge: 0, sports: [], notes: "" };

function loadCtxSettings(): CtxSettings {
  try {
    const raw = localStorage.getItem("ai_ctx_settings");
    if (raw) return { ...DEFAULT_CTX_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_CTX_SETTINGS };
}

function saveCtxSettings(s: CtxSettings) {
  localStorage.setItem("ai_ctx_settings", JSON.stringify(s));
}

/* compact inline number input with suffix */
function MiniInput({ value, onChange, suffix, min, max, w = 38 }: { value: number; onChange: (v: number) => void; suffix?: string; min?: number; max?: number; w?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 bg-[rgba(124,58,237,.06)] rounded px-1 py-0.5">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        className="text-[10px] font-bold font-mono text-[#7c3aed] bg-transparent border-none outline-none text-center appearance-none font-[inherit]"
        style={{ width: `${w}px`, MozAppearance: "textfield" }}
      />
      {suffix && <span className="text-[9px] text-[#7c3aed] font-semibold">{suffix}</span>}
    </span>
  );
}

const SPORT_COLORS: Record<string, string> = {
  football: "#12b76a",
  tennis: "#f79009",
  nba: "#3b5bdb",
  mlb: "#ef4444",
  rugby: "#8b5cf6",
  pmu: "#06b6d4",
};

/* ================================================================
   MINI SPARKLINE (SVG)
   ================================================================ */

function Sparkline({ data, color = "#12b76a", w = 120, h = 32 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const lastVal = data[data.length - 1];
  const lineColor = lastVal >= 0 ? color : "#f04438";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <defs>
        <linearGradient id={`spark-grad-${lineColor}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${pts.join(" ")} ${w},${h}`}
        fill={`url(#spark-grad-${lineColor})`}
      />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ================================================================
   CONTEXT PANEL — right sidebar with real data
   ================================================================ */

function ContextPanel({
  context,
  onSendMessage,
  ctxSettings,
  onCtxSettingsChange,
}: {
  context: AIContext | null;
  onSendMessage: (text: string) => void;
  ctxSettings: CtxSettings;
  onCtxSettingsChange: (s: CtxSettings, skipReload?: boolean) => void;
}) {
  const rl = context?.rate_limit;
  const perf = context?.performance;
  const vbs = context?.value_bets || [];

  return (
    <div className="w-[310px] min-w-[310px] border-l border-[#e3e6eb] flex flex-col overflow-hidden max-lg:hidden" style={{ background: "var(--bg-surface)" }}>
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[#e3e6eb] flex items-center justify-between" style={{ background: "var(--bg-card)" }}>
        <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
          <div className="w-2 h-2 rounded-full bg-[#12b76a] animate-pulse" />
          Contexte actif
        </div>
        <span className="px-2 py-0.5 rounded text-[9.5px] font-semibold tracking-wide uppercase" style={{ background: "var(--green-bg)", color: "var(--green)" }}>
          Mis a jour
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">

        {/* ── QUOTA ── */}
        {rl && (
          <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">
              <Gauge size={10} className="text-[#3b5bdb]" />
              Quota quotidien
            </div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11.5px] text-[#8a919e]">Messages</span>
              <span className="text-[13px] font-bold font-mono text-[#111318]">
                {rl.used}/{rl.limit}
              </span>
            </div>
            <div className="w-full h-[6px] rounded-full bg-[#f0f1f3] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min((rl.used / rl.limit) * 100, 100)}%`,
                  backgroundColor: rl.remaining <= 2 ? "var(--red)" : rl.remaining <= 10 ? "var(--amber)" : "var(--green)",
                }}
              />
            </div>
          </div>
        )}

        {/* ── PERFORMANCES ── */}
        {perf && (
          <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider">
                <Trophy size={10} className="text-[#f79009]" />
                Performances
              </div>
              <MiniInput value={ctxSettings.period} onChange={(v) => onCtxSettingsChange({ ...ctxSettings, period: v })} suffix="j" min={1} max={365} w={32} />
            </div>

            {/* Sport filter pills */}
            <div className="flex gap-1 flex-wrap mb-2">
              {ALL_SPORTS.map((s) => {
                const active = ctxSettings.sports.length === 0 || ctxSettings.sports.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => {
                      const current = ctxSettings.sports.length === 0 ? [...ALL_SPORTS] : [...ctxSettings.sports];
                      const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
                      onCtxSettingsChange({ ...ctxSettings, sports: next.length === ALL_SPORTS.length ? [] : next });
                    }}
                    className={`px-1.5 py-[1px] rounded text-[9px] font-semibold border cursor-pointer transition-all font-[inherit] ${
                      active
                        ? "border-transparent text-white"
                        : "border-[#e3e6eb] bg-[#f7f8fa] text-[#b0b7c3]"
                    }`}
                    style={active ? { backgroundColor: SPORT_COLORS[s] || "var(--text-muted)" } : undefined}
                  >
                    {SPORT_LABELS[s] || s}
                  </button>
                );
              })}
            </div>

            {perf.total_bets > 0 ? (<>

            {/* ROI big number */}
            <div className="text-center mb-2">
              <span className={`text-[28px] font-extrabold font-mono leading-none ${perf.roi >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                {perf.roi >= 0 ? "+" : ""}{perf.roi}%
              </span>
              <span className="text-[11px] text-[#8a919e] ml-1.5">ROI global</span>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <div className="text-center">
                <div className="text-[15px] font-bold font-mono text-[#111318]">{perf.total_bets}</div>
                <div className="text-[9.5px] text-[#b0b7c3]">Tickets</div>
              </div>
              <div className="text-center">
                <div className={`text-[15px] font-bold font-mono ${perf.win_rate >= 50 ? "text-[#12b76a]" : "text-[#f79009]"}`}>{perf.win_rate}%</div>
                <div className="text-[9.5px] text-[#b0b7c3]">Reussite</div>
              </div>
              <div className="text-center">
                <div className="text-[15px] font-bold font-mono text-[#111318]">{perf.total_stake.toLocaleString("fr-FR")}</div>
                <div className="text-[9.5px] text-[#b0b7c3]">Mise totale</div>
              </div>
              <div className="text-center">
                <div className={`text-[15px] font-bold font-mono ${perf.total_pl >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                  {perf.total_pl >= 0 ? "+" : ""}{perf.total_pl.toLocaleString("fr-FR")}
                </div>
                <div className="text-[9.5px] text-[#b0b7c3]">Gain net</div>
              </div>
            </div>

            {/* Sparkline */}
            {perf.timeline.length > 1 && (
              <Sparkline data={perf.timeline.map((t) => t.pl)} w={260} h={36} />
            )}

            {/* By sport mini bars */}
            {Object.keys(perf.by_sport).length > 0 && (
              <div className="flex gap-3 mt-2 justify-center">
                {Object.entries(perf.by_sport).map(([sport, s]) => (
                  <div key={sport} className="text-center">
                    <div className={`text-[12px] font-bold font-mono ${s.roi >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                      {s.roi >= 0 ? "+" : ""}{s.roi}%
                    </div>
                    <div className="text-[9px] text-[#b0b7c3]">{SPORT_LABELS[sport] || sport}</div>
                  </div>
                ))}
              </div>
            )}
            </>) : (
              <div className="text-[11px] text-[#b0b7c3] text-center py-2">Aucun pari sur cette periode</div>
            )}
          </div>
        )}

        {/* ── VALUE BETS DU JOUR ── */}
        <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider">
              <Target size={10} className="text-[#3b5bdb]" />
              Value bets - {vbs.length}
            </div>
            <div className="flex items-center gap-1">
              <MiniInput value={ctxSettings.vb_limit} onChange={(v) => onCtxSettingsChange({ ...ctxSettings, vb_limit: v })} min={1} max={20} w={28} />
              <MiniInput value={ctxSettings.min_edge} onChange={(v) => onCtxSettingsChange({ ...ctxSettings, min_edge: v })} suffix="%" min={0} max={50} w={28} />
            </div>
          </div>
          {vbs.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {vbs.map((vb, i) => (
                <ValueBetRow key={i} vb={vb} onSend={onSendMessage} />
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-[#b0b7c3] text-center py-2">Aucun value bet disponible</div>
          )}
        </div>

        {/* ── QUESTIONS SUGGEREES ── */}
        <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">
            <MessageCircle size={10} className="text-[#3b5bdb]" />
            Questions suggerees
          </div>
          <div className="flex gap-1 flex-wrap">
            {[
              "Quel est mon ROI ce mois-ci ?",
              "Value bets football ce soir",
              "Analyse mes derniers paris",
              "Resume mes campagnes actives",
              "Quel sport est le plus rentable ?",
              "Simulation bankroll Kelly",
            ].map((q) => (
              <button
                key={q}
                onClick={() => onSendMessage(q)}
                className="px-2 py-[3px] rounded text-[10px] font-medium border border-[#e3e6eb] bg-[#f7f8fa] text-[#8a919e] cursor-pointer transition-all hover:border-[rgba(124,58,237,.15)] hover:text-[#7c3aed] hover:bg-[rgba(124,58,237,.05)] whitespace-nowrap font-[inherit]"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ── NOTES / DONNEES PERSO ── */}
        <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">
            <StickyNote size={10} className="text-[#f79009]" />
            Notes & donnees
          </div>
          <textarea
            value={ctxSettings.notes}
            onChange={(e) => onCtxSettingsChange({ ...ctxSettings, notes: e.target.value }, true)}
            placeholder="Ajoute des infos pour l'IA : bankroll, objectifs, contraintes, donnees externes..."
            rows={3}
            className="w-full text-[11px] text-[#111318] bg-[#f7f8fa] border border-[#e3e6eb] rounded-lg px-2.5 py-2 outline-none resize-y leading-relaxed font-[inherit] placeholder:text-[#b0b7c3] focus:border-[#7c3aed] focus:bg-white transition-colors min-h-[60px] max-h-[150px]"
          />
        </div>
      </div>
    </div>
  );
}

/* value bet row in context panel */
function ValueBetRow({ vb, onSend }: { vb: AIContextValueBet; onSend: (t: string) => void }) {
  const sportColor = SPORT_COLORS[vb.sport] || "#8a919e";
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-[#f7f8fa]"
      onClick={() => onSend(`Analyse le match ${vb.match}`)}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-[#111318] truncate">{vb.match}</div>
        <div className="text-[9px] text-[#b0b7c3] truncate">
          {vb.league}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[12px] font-bold font-mono" style={{ color: sportColor }}>
          {vb.prob}%
        </span>
        <span className="text-[10px] font-semibold text-[#12b76a]">+{vb.edge}%</span>
      </div>
    </div>
  );
}

/* ================================================================
   WELCOME SCREEN
   ================================================================ */

function WelcomeScreen({ onSend }: { onSend: (text: string) => void }) {
  const suggestions = [
    { icon: TrendingUp, label: "Value bets du jour", desc: "Quels matchs ont le meilleur edge ?" },
    { icon: BarChart3, label: "Mon ROI ce mois", desc: "Analyse mes performances recentes" },
    { icon: CheckSquare, label: "Analyser mon ticket", desc: "Verifie la qualite de mes selections" },
    { icon: CreditCard, label: "Gestion bankroll", desc: "Simulation Kelly et sizing optimal" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg,#7c3aed,#4f8cff)" }}>
        <MessageCircle size={24} className="text-white" />
      </div>
      <h2 className="text-[20px] font-extrabold text-[#111318] mb-1">IA Analyste</h2>
      <p className="text-[13px] text-[#8a919e] mb-6 text-center max-w-[380px]">
        Pose-moi n'importe quelle question sur tes paris, tes stats, les matchs du jour ou ta strategie.
      </p>
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-2.5 w-full max-w-[500px]">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onSend(s.label)}
            className="flex items-start gap-2.5 p-3.5 rounded-xl border border-[#e3e6eb] bg-white text-left cursor-pointer transition-all hover:border-[rgba(124,58,237,.2)] hover:bg-[rgba(124,58,237,.03)] hover:shadow-[0_2px_8px_rgba(16,24,40,.06)] font-[inherit]"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[rgba(124,58,237,.07)]">
              <s.icon size={16} className="text-[#7c3aed]" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#111318]">{s.label}</div>
              <div className="text-[11.5px] text-[#8a919e] mt-0.5">{s.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */

export default function AIAnalyste() {
  const { user } = useAuth();

  const userInitials = useMemo(() => {
    if (!user?.display_name) return "U";
    return user.display_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  }, [user?.display_name]);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sidebar state
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [context, setContext] = useState<AIContext | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [ctxSettings, setCtxSettings] = useState<CtxSettings>(loadCtxSettings);
  const historyRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Close history dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    if (showHistory) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showHistory]);

  // Load context + conversations on mount
  useEffect(() => {
    loadConversations();
    loadContext();
  }, []);

  async function loadConversations() {
    try {
      const data = await getAIConversations();
      setConversations(data);
    } catch {
      // silent
    }
  }

  async function loadContext(settings?: CtxSettings) {
    try {
      const s = settings || ctxSettings;
      const data = await getAIContext({
        period: s.period,
        vb_limit: s.vb_limit,
        min_edge: s.min_edge,
        sports: s.sports.length > 0 ? s.sports.join(",") : undefined,
      });
      setContext(data);
    } catch {
      // silent
    }
  }

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCtxSettingsChange(newSettings: CtxSettings, skipReload = false) {
    setCtxSettings(newSettings);
    saveCtxSettings(newSettings);
    if (skipReload) return;
    // Debounce API reload (300ms)
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => loadContext(newSettings), 300);
  }

  async function loadConversation(id: number) {
    try {
      const msgs = await getAIConversationMessages(id);
      setConversationId(id);
      setMessages(
        msgs.map((m: AIMessageData) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          time: (() => {
            try { return new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
          })(),
        }))
      );
      setError(null);
      setShowMobileSidebar(false);
    } catch {
      setError("Impossible de charger cette conversation");
    }
  }

  async function handleDeleteConversation(id: number) {
    try {
      await deleteAIConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        handleNewConversation();
      }
    } catch {
      // silent
    }
  }

  function handleNewConversation() {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setShowMobileSidebar(false);
  }

  const handleSend = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isStreaming) return;

    setInput("");
    setError(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: msg,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      let currentConvId = conversationId;

      for await (const event of aiChatStream(msg, currentConvId)) {
        if (event.type === "token" && event.text) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + event.text } : m
            )
          );
          if (event.conversationId && !currentConvId) {
            currentConvId = event.conversationId;
            setConversationId(event.conversationId);
          }
        } else if (event.type === "done") {
          if (event.conversationId && !currentConvId) {
            currentConvId = event.conversationId;
            setConversationId(event.conversationId);
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m
            )
          );
        } else if (event.type === "error") {
          setError(event.message || "Erreur lors de la generation");
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Erreur de connexion";
      setError(errorMsg);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m
        )
      );
      loadContext();
      loadConversations();
    }
  }, [input, isStreaming, conversationId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Admin only for now
  if (user && !user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  /* ── Render ── */
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -mx-6 -my-5 overflow-x-hidden" style={{ background: "var(--bg-card)" }}>

      {/* == HEADER == */}
      <div className="shrink-0 px-5 py-2.5 border-b border-[#e3e6eb] flex items-center justify-between" style={{ background: "var(--bg-card)" }}>
        <div className="flex items-center gap-3">
          <h1 className="text-[20px] font-extrabold tracking-tight text-[#111318]">IA Analyste</h1>
          {context?.rate_limit && (
            <span className="text-[11px] text-[#b0b7c3] font-mono max-sm:hidden">
              {context.rate_limit.remaining} msg restants
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { handleNewConversation(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e3e6eb] text-[#8a919e] text-[12px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-colors font-[inherit]"
            style={{ background: "var(--bg-card)" }}
          >
            <Plus size={13} />
            <span className="max-sm:hidden">Nouvelle conversation</span>
          </button>
          {/* History dropdown */}
          <div className="relative" ref={historyRef}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium cursor-pointer transition-colors font-[inherit] ${
                showHistory
                  ? "border-[#7c3aed] bg-[rgba(124,58,237,.05)] text-[#7c3aed]"
                  : "border-[#e3e6eb] text-[#8a919e] hover:border-[#cdd1d9] hover:text-[#3c4149]"
              }`}
            >
              <History size={13} />
              <span className="max-sm:hidden">Historique</span>
            </button>
            {showHistory && (
              <div className="absolute right-0 top-full mt-1.5 w-[320px] max-sm:w-[280px] rounded-xl border border-[#e3e6eb] shadow-[0_8px_24px_rgba(16,24,40,.12)] z-50 overflow-hidden" style={{ background: "var(--bg-card)" }}>
                <div className="px-3 py-2.5 border-b border-[#e3e6eb] flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[#111318]">Conversations</span>
                  <span className="text-[10px] text-[#b0b7c3]">{conversations.length} conv.</span>
                </div>
                {conversations.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[12px] text-[#b0b7c3]">Aucune conversation</div>
                ) : (
                  <div className="max-h-[350px] overflow-y-auto py-1">
                    {conversations.map((c) => (
                      <div
                        key={c.id}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-all group ${
                          conversationId === c.id
                            ? "bg-[rgba(124,58,237,.06)]"
                            : "hover:bg-[#f7f8fa]"
                        }`}
                        onClick={() => { loadConversation(c.id); setShowHistory(false); }}
                      >
                        <MessageCircle size={12} className={`shrink-0 ${conversationId === c.id ? "text-[#7c3aed]" : "text-[#b0b7c3]"}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-[12px] font-medium truncate ${conversationId === c.id ? "text-[#7c3aed]" : "text-[#111318]"}`}>
                            {c.title || "Sans titre"}
                          </div>
                          <div className="text-[10px] text-[#b0b7c3]">
                            {c.message_count} messages
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteConversation(c.id); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#b0b7c3] hover:text-[#f04438] hover:bg-[rgba(240,68,56,.06)] transition-all cursor-pointer border-none bg-transparent"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e3e6eb] text-[#8a919e] text-[12px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-colors font-[inherit]"
            style={{ background: "var(--bg-card)" }}
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* == BODY == */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── CHAT ZONE ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Error banner */}
          {error && (
            <div className="mx-5 mt-3 px-3.5 py-2.5 rounded-lg bg-[rgba(240,68,56,.06)] border border-[rgba(240,68,56,.15)] flex items-center gap-2 text-[13px] text-[#f04438]">
              <AlertCircle size={14} />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-[#f04438] hover:text-[#d92d2d] cursor-pointer border-none bg-transparent font-[inherit] text-[12px] font-semibold">
                Fermer
              </button>
            </div>
          )}

          {/* Messages or Welcome */}
          {messages.length === 0 ? (
            <WelcomeScreen onSend={handleSend} />
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 items-start animate-[fadeUp_0.3s_ease_both] ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  {/* Avatar */}
                  {msg.role === "assistant" ? (
                    <div className="w-[32px] h-[32px] rounded-full shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#4f8cff)" }}>
                      <MessageCircle size={15} className="text-white" />
                    </div>
                  ) : (
                    <div className="w-[32px] h-[32px] rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg,#4f8cff,#a78bfa)" }}>
                      {userInitials}
                    </div>
                  )}

                  {/* Message content */}
                  <div className={`max-w-[75%] max-sm:max-w-[90%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : ""}`}>
                    <div
                      className={`px-4 py-3 text-[13.5px] leading-relaxed ${
                        msg.role === "assistant"
                          ? "border border-[#e3e6eb] text-[#111318] rounded-[4px_14px_14px_14px] ai-message-content"
                          : "bg-[#3b5bdb] text-white rounded-[14px_4px_14px_14px]"
                      }`}
                      style={msg.role === "assistant" ? { background: "var(--bg-card)", boxShadow: "0 1px 4px rgba(16,24,40,.05)" } : undefined}
                    >
                      {msg.role === "assistant" ? (
                        <>
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content || "") }} />
                          {msg.streaming && (
                            <span className="inline-block w-1.5 h-4 bg-[#7c3aed] rounded-sm ml-0.5 animate-pulse" />
                          )}
                        </>
                      ) : (
                        <span>{msg.content}</span>
                      )}
                    </div>
                    <span className={`text-[10px] text-[#b0b7c3] ${msg.role === "user" ? "text-right" : ""}`}>{msg.time}</span>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === "" && (
                <div className="flex gap-2.5 items-start">
                  <div className="w-[32px] h-[32px] rounded-full shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#4f8cff)" }}>
                    <MessageCircle size={15} className="text-white" />
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 border border-[#e3e6eb] rounded-[4px_14px_14px_14px]" style={{ background: "var(--bg-card)", boxShadow: "0 1px 4px rgba(16,24,40,.05)" }}>
                    <Loader2 size={14} className="text-[#7c3aed] animate-spin" />
                    <span className="text-[12px] text-[#8a919e]">Analyse en cours...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* ── INPUT BAR ── */}
          <div className="shrink-0 px-5 py-3 border-t border-[#e3e6eb]" style={{ background: "var(--bg-card)" }}>
            {/* Quick action chips */}
            {messages.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2 max-sm:hidden">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => handleSend(qa.label)}
                    disabled={isStreaming}
                    className="flex items-center gap-[5px] px-2.5 py-1 rounded-full text-[11px] font-medium border border-[#e3e6eb] bg-[#f7f8fa] text-[#8a919e] cursor-pointer transition-all hover:border-[rgba(124,58,237,.18)] hover:text-[#7c3aed] hover:bg-[rgba(124,58,237,.07)] whitespace-nowrap font-[inherit] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <qa.icon size={11} />
                    {qa.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? "En cours de generation..." : "Pose une question sur un match, ton ticket, ta strategie..."}
                rows={1}
                disabled={isStreaming}
                className="flex-1 px-3.5 py-[11px] border-[1.5px] border-[#e3e6eb] rounded-xl text-[13.5px] text-[#111318] bg-[#f7f8fa] outline-none transition-all resize-none leading-normal font-[inherit] min-h-[44px] max-h-[120px] focus:border-[#7c3aed] focus:bg-white focus:shadow-[0_0_0_3px_rgba(124,58,237,.07)] disabled:opacity-50"
              />
              <button
                onClick={() => handleSend()}
                disabled={isStreaming || !input.trim()}
                className="w-10 h-10 rounded-[10px] border-none bg-[#7c3aed] text-white flex items-center justify-center cursor-pointer transition-all hover:bg-[#6d28d9] hover:scale-105 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* ── CONTEXT PANEL (desktop) ── */}
        <ContextPanel
          context={context}
          onSendMessage={handleSend}
          ctxSettings={ctxSettings}
          onCtxSettingsChange={handleCtxSettingsChange}
        />

        {/* ── MOBILE CONTEXT DRAWER ── */}
        {showMobileSidebar && (
          <div className="absolute inset-0 z-50 lg:hidden flex">
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowMobileSidebar(false)} />
            <div className="relative ml-auto w-[310px] max-w-[85vw] h-full flex flex-col animate-slide-in overflow-hidden" style={{ background: "var(--bg-surface)" }}>
              <div className="shrink-0 px-4 py-3 border-b border-[#e3e6eb] flex items-center justify-between" style={{ background: "var(--bg-card)" }}>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowMobileSidebar(false)} className="p-1 rounded cursor-pointer border-none bg-transparent text-[#8a919e] hover:text-[#111318]">
                    <ChevronLeft size={18} />
                  </button>
                  <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                    <div className="w-2 h-2 rounded-full bg-[#12b76a] animate-pulse" />
                    Contexte actif
                  </div>
                </div>
                {context?.rate_limit && (
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-semibold tracking-wide uppercase" style={{ background: "var(--green-bg)", color: "var(--green)" }}>
                    {context.rate_limit.remaining}/{context.rate_limit.limit}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
                {/* Quota */}
                {context?.rate_limit && (
                  <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">
                      <Gauge size={10} className="text-[#3b5bdb]" />
                      Quota quotidien
                    </div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11.5px] text-[#8a919e]">Messages</span>
                      <span className="text-[13px] font-bold font-mono text-[#111318]">{context.rate_limit.used}/{context.rate_limit.limit}</span>
                    </div>
                    <div className="w-full h-[6px] rounded-full bg-[#f0f1f3] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{
                        width: `${Math.min((context.rate_limit.used / context.rate_limit.limit) * 100, 100)}%`,
                        backgroundColor: context.rate_limit.remaining <= 2 ? "var(--red)" : context.rate_limit.remaining <= 10 ? "var(--amber)" : "var(--green)",
                      }} />
                    </div>
                  </div>
                )}

                {/* Performance */}
                {context?.performance && (
                  <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider">
                        <Trophy size={10} className="text-[#f79009]" />
                        Performances
                      </div>
                      <MiniInput value={ctxSettings.period} onChange={(v) => handleCtxSettingsChange({ ...ctxSettings, period: v })} suffix="j" min={1} max={365} w={32} />
                    </div>
                    {/* Sport filter pills */}
                    <div className="flex gap-1 flex-wrap mb-2">
                      {ALL_SPORTS.map((s) => {
                        const active = ctxSettings.sports.length === 0 || ctxSettings.sports.includes(s);
                        return (
                          <button
                            key={s}
                            onClick={() => {
                              const current = ctxSettings.sports.length === 0 ? [...ALL_SPORTS] : [...ctxSettings.sports];
                              const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
                              handleCtxSettingsChange({ ...ctxSettings, sports: next.length === ALL_SPORTS.length ? [] : next });
                            }}
                            className={`px-1.5 py-[1px] rounded text-[9px] font-semibold border cursor-pointer transition-all font-[inherit] ${
                              active ? "border-transparent text-white" : "border-[#e3e6eb] bg-[#f7f8fa] text-[#b0b7c3]"
                            }`}
                            style={active ? { backgroundColor: SPORT_COLORS[s] || "var(--text-muted)" } : undefined}
                          >
                            {SPORT_LABELS[s] || s}
                          </button>
                        );
                      })}
                    </div>
                    {context.performance.total_bets > 0 ? (
                      <>
                        <div className="text-center mb-2">
                          <span className={`text-[28px] font-extrabold font-mono leading-none ${context.performance.roi >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                            {context.performance.roi >= 0 ? "+" : ""}{context.performance.roi}%
                          </span>
                          <span className="text-[11px] text-[#8a919e] ml-1.5">ROI</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div className="text-center">
                            <div className="text-[15px] font-bold font-mono text-[#111318]">{context.performance.total_bets}</div>
                            <div className="text-[9.5px] text-[#b0b7c3]">Tickets</div>
                          </div>
                          <div className="text-center">
                            <div className={`text-[15px] font-bold font-mono ${context.performance.win_rate >= 50 ? "text-[#12b76a]" : "text-[#f79009]"}`}>{context.performance.win_rate}%</div>
                            <div className="text-[9.5px] text-[#b0b7c3]">Reussite</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[15px] font-bold font-mono text-[#111318]">{context.performance.total_stake.toLocaleString("fr-FR")}</div>
                            <div className="text-[9.5px] text-[#b0b7c3]">Mise totale</div>
                          </div>
                          <div className="text-center">
                            <div className={`text-[15px] font-bold font-mono ${context.performance.total_pl >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                              {context.performance.total_pl >= 0 ? "+" : ""}{context.performance.total_pl.toLocaleString("fr-FR")}
                            </div>
                            <div className="text-[9.5px] text-[#b0b7c3]">Gain net</div>
                          </div>
                        </div>
                        {context.performance.timeline.length > 1 && (
                          <Sparkline data={context.performance.timeline.map((t) => t.pl)} w={260} h={36} />
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] text-[#b0b7c3] text-center py-2">Aucun pari sur cette periode</div>
                    )}
                  </div>
                )}

                {/* Value bets */}
                <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider">
                      <Target size={10} className="text-[#3b5bdb]" />
                      Value bets - {context?.value_bets?.length || 0}
                    </div>
                    <div className="flex items-center gap-1">
                      <MiniInput value={ctxSettings.vb_limit} onChange={(v) => handleCtxSettingsChange({ ...ctxSettings, vb_limit: v })} min={1} max={20} w={28} />
                      <MiniInput value={ctxSettings.min_edge} onChange={(v) => handleCtxSettingsChange({ ...ctxSettings, min_edge: v })} suffix="%" min={0} max={50} w={28} />
                    </div>
                  </div>
                  {context?.value_bets && context.value_bets.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {context.value_bets.map((vb, i) => (
                        <ValueBetRow key={i} vb={vb} onSend={(t) => { setShowMobileSidebar(false); handleSend(t); }} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#b0b7c3] text-center py-2">Aucun value bet disponible</div>
                  )}
                </div>

                {/* Questions suggerees */}
                <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">
                    <MessageCircle size={10} className="text-[#3b5bdb]" />
                    Questions suggerees
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {["Quel est mon ROI ce mois-ci ?", "Value bets football ce soir", "Analyse mes derniers paris", "Resume mes campagnes actives", "Quel sport est le plus rentable ?", "Simulation bankroll Kelly"].map((q) => (
                      <button key={q} onClick={() => { setShowMobileSidebar(false); handleSend(q); }}
                        className="px-2 py-[3px] rounded text-[10px] font-medium border border-[#e3e6eb] bg-[#f7f8fa] text-[#8a919e] cursor-pointer transition-all hover:border-[rgba(124,58,237,.15)] hover:text-[#7c3aed] hover:bg-[rgba(124,58,237,.05)] whitespace-nowrap font-[inherit]">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes & donnees */}
                <div className="rounded-xl border border-[#e3e6eb] p-3" style={{ background: "var(--bg-card)" }}>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">
                    <StickyNote size={10} className="text-[#f79009]" />
                    Notes & donnees
                  </div>
                  <textarea
                    value={ctxSettings.notes}
                    onChange={(e) => handleCtxSettingsChange({ ...ctxSettings, notes: e.target.value }, true)}
                    placeholder="Ajoute des infos pour l'IA..."
                    rows={3}
                    className="w-full text-[11px] text-[#111318] bg-[#f7f8fa] border border-[#e3e6eb] rounded-lg px-2.5 py-2 outline-none resize-y leading-relaxed font-[inherit] placeholder:text-[#b0b7c3] focus:border-[#7c3aed] focus:bg-white transition-colors min-h-[60px] max-h-[150px]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
