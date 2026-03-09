import { type ReactNode } from "react"
import { cn } from "./cn"

const colors = {
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
  purple: "text-purple-600",
  slate: "text-slate-900",
}

const sizes = {
  sm: { card: "p-3", value: "text-lg", label: "text-xs" },
  md: { card: "p-4", value: "text-2xl", label: "text-sm" },
}

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  color?: keyof typeof colors
  size?: keyof typeof sizes
  className?: string
}

export function StatCard({ label, value, icon, color = "slate", size = "md", className }: StatCardProps) {
  const s = sizes[size]

  return (
    <div className={cn("bg-white rounded-lg shadow-sm border border-slate-200", s.card, className)}>
      <div className="flex items-center justify-between">
        <p className={cn("text-slate-500", s.label)}>{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className={cn("font-bold mt-1", s.value, colors[color])}>{value}</p>
    </div>
  )
}
