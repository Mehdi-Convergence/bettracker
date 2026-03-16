import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface BaseWidgetProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  isLoading?: boolean;
  className?: string;
}

export function BaseWidget({ title, subtitle, icon, children, isLoading, className = "" }: BaseWidgetProps) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow h-full flex flex-col ${className}`}>
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <div className="flex items-center gap-2">
          {icon && <div className="text-blue-600">{icon}</div>}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="flex-1 p-3 overflow-auto relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : children}
      </div>
    </div>
  );
}
