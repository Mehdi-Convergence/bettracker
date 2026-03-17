import { useState } from "react";
import { X, Settings } from "lucide-react";
import {
  widgetRegistry,
  type WidgetType,
  type WidgetConfig,
  type WidgetConfigOption,
} from "../widgets/registry";

interface WidgetConfigPanelProps {
  widgetId: string;
  widgetType: WidgetType;
  title: string;
  config: WidgetConfig;
  onSave: (widgetId: string, title: string, config: WidgetConfig) => void;
  onClose: () => void;
}

export function WidgetConfigPanel({
  widgetId,
  widgetType,
  title: initialTitle,
  config: initialConfig,
  onSave,
  onClose,
}: WidgetConfigPanelProps) {
  const def = widgetRegistry[widgetType];
  const [title, setTitle] = useState(initialTitle);
  const [config, setConfig] = useState<WidgetConfig>({ ...def.defaultConfig, ...initialConfig });

  const handleChange = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    onSave(widgetId, title, config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">Configurer le widget</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Titre</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Config options */}
          {def.configOptions.map((opt) => (
            <ConfigField
              key={opt.key}
              option={opt}
              value={(config as Record<string, unknown>)[opt.key]}
              onChange={(v) => handleChange(opt.key, v)}
            />
          ))}

          {def.configOptions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              Ce widget n'a pas d'options configurables.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Config field renderer ----

function ConfigField({
  option,
  value,
  onChange,
}: {
  option: WidgetConfigOption;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (option.type) {
    case "select":
      return (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{option.label}</label>
          <select
            value={(value as string) ?? option.defaultValue ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {option.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );

    case "multi-select": {
      const selected = (value as string[]) ?? (option.defaultValue as string[]) ?? [];
      return (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{option.label}</label>
          <div className="space-y-1.5">
            {option.options?.map((o) => (
              <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange([...selected, o.value]);
                    } else {
                      const next = selected.filter((s) => s !== o.value);
                      if (next.length > 0) onChange(next);
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    case "color":
      return (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{option.label}</label>
          <div className="flex gap-2 flex-wrap">
            {option.options?.map((o) => (
              <button
                key={o.value}
                onClick={() => onChange(o.value)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  value === o.value ? "border-slate-900 scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: o.value }}
                title={o.label}
              />
            ))}
          </div>
        </div>
      );

    case "number":
      return (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{option.label}</label>
          <input
            type="number"
            value={(value as number) ?? option.defaultValue ?? 5}
            min={1}
            max={50}
            onChange={(e) => onChange(parseInt(e.target.value, 10) || 5)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      );

    case "text":
      return (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{option.label}</label>
          <input
            type="text"
            value={(value as string) ?? option.defaultValue ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      );

    default:
      return null;
  }
}
