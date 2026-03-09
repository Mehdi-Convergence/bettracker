import { type ReactNode } from "react"
import { cn } from "./cn"

const variants = {
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  error: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
}

interface AlertProps {
  variant?: keyof typeof variants
  children: ReactNode
  className?: string
}

export function Alert({ variant = "info", children, className }: AlertProps) {
  return (
    <div
      className={cn(
        "rounded-lg p-3 text-sm border",
        variants[variant],
        className,
      )}
    >
      {children}
    </div>
  )
}
