import { X } from "lucide-react";
import {
  widgetRegistry,
  widgetCategories,
  type WidgetType,
  type WidgetCategory,
} from "../widgets/registry";
import { useState } from "react";

interface WidgetPickerProps {
  onSelect: (type: WidgetType) => void;
  onClose: () => void;
}

export function WidgetPicker({ onSelect, onClose }: WidgetPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<WidgetCategory | "all">("all");

  const entries = Object.entries(widgetRegistry) as [WidgetType, (typeof widgetRegistry)[WidgetType]][];
  const filtered =
    selectedCategory === "all"
      ? entries
      : entries.filter(([, def]) => def.category === selectedCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-900">Ajouter un widget</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 px-6 py-3 border-b overflow-x-auto">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              selectedCategory === "all"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Tous
          </button>
          {(Object.entries(widgetCategories) as [WidgetCategory, { label: string }][]).map(
            ([cat, { label }]) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>

        {/* Widget list */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map(([type, def]) => (
              <button
                key={type}
                onClick={() => {
                  onSelect(type);
                  onClose();
                }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-center group"
              >
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600 group-hover:bg-blue-200 transition-colors">
                  {def.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{def.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{def.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
