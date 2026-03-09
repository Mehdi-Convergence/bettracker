import { type ReactNode } from "react"
import { cn } from "./cn"

const paddings = {
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
}

interface CardProps {
  children: ReactNode
  padding?: keyof typeof paddings
  danger?: boolean
  className?: string
}

export function Card({ children, padding = "md", danger = false, className }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-lg shadow-sm border",
        danger ? "border-red-200" : "border-slate-200",
        paddings[padding],
        className,
      )}
    >
      {children}
    </div>
  )
}
