/** Shared campaign & betting helpers used across multiple pages. */

// ── Color tokens ──
export const GREEN = "#12b76a";
export const RED = "#f04438";
export const AMBER = "#f79009";

// ── Campaign status config ──
export const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  active:   { label: "Active",    dot: GREEN,    bg: "bg-emerald-50", text: "text-emerald-700" },
  paused:   { label: "En pause",  dot: AMBER,    bg: "bg-amber-50",   text: "text-amber-700" },
  stoploss: { label: "Stop-loss", dot: RED,      bg: "bg-red-50",     text: "text-red-700" },
  archived: { label: "Archivée",  dot: "#8a919e", bg: "bg-slate-100", text: "text-slate-500" },
};

// ── Outcome helpers ──
export function outcomeLabel(o: string): string {
  return o === "H" ? "Dom" : o === "D" ? "Nul" : o === "A" ? "Ext" : o;
}

export function outcomeBadgeVariant(o: string): "blue" | "amber" | "red" {
  return o === "H" ? "blue" : o === "D" ? "amber" : "red";
}
