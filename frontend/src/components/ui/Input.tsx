import { type InputHTMLAttributes, forwardRef } from "react"
import { cn } from "./cn"

const sizes = {
  sm: "px-2.5 py-1.5 text-sm",
  md: "px-3 py-2 text-sm",
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  inputSize?: keyof typeof sizes
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, inputSize = "md", className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-")

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
            "disabled:bg-slate-100 disabled:text-slate-500",
            sizes[inputSize],
            error && "border-red-500 focus:ring-red-500 focus:border-red-500",
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    )
  },
)

Input.displayName = "Input"
