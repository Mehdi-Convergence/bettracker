import { BaseWidget } from "./BaseWidget";
import { Activity } from "lucide-react";

interface FeedItem {
  id: string | number;
  label: string;
  detail?: string;
  time: string;
  type: "win" | "loss" | "pending" | "info";
}

interface ActivityFeedWidgetProps {
  title?: string;
  items: FeedItem[];
  isLoading?: boolean;
}

const TYPE_COLORS: Record<FeedItem["type"], string> = {
  win: "bg-emerald-500",
  loss: "bg-red-500",
  pending: "bg-amber-500",
  info: "bg-blue-500",
};

export function ActivityFeedWidget({ title = "Activite recente", items, isLoading }: ActivityFeedWidgetProps) {
  return (
    <BaseWidget title={title} icon={<Activity className="h-4 w-4" />} isLoading={isLoading}>
      {items.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">Aucune activite</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${TYPE_COLORS[item.type]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{item.label}</p>
                {item.detail && <p className="text-xs text-slate-500 truncate">{item.detail}</p>}
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0">{item.time}</span>
            </div>
          ))}
        </div>
      )}
    </BaseWidget>
  );
}
