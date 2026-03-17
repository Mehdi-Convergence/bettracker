import { useState, useRef, useEffect } from "react";
import {
  Pencil,
  Save,
  Plus,
  RotateCcw,
  ChevronDown,
  Copy,
  Trash2,
  PenLine,
  Check,
  X,
  LayoutDashboard,
} from "lucide-react";

export interface PresetInfo {
  id: string;
  name: string;
}

interface DashboardToolbarProps {
  isEditMode: boolean;
  onToggleEditMode: () => void;
  onSave: () => void;
  onAddWidget: () => void;
  onResetLayout: () => void;
  isSaving?: boolean;
  // Presets
  presets: PresetInfo[];
  activePresetId: string | null;
  onSelectPreset: (id: string) => void;
  onCreatePreset: (name: string) => void;
  onRenamePreset: (id: string, name: string) => void;
  onDeletePreset: (id: string) => void;
  onDuplicatePreset: (id: string) => void;
}

export function DashboardToolbar({
  isEditMode,
  onToggleEditMode,
  onSave,
  onAddWidget,
  onResetLayout,
  isSaving,
  presets,
  activePresetId,
  onSelectPreset,
  onCreatePreset,
  onRenamePreset,
  onDeletePreset,
  onDuplicatePreset,
}: DashboardToolbarProps) {
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activePreset = presets.find((p) => p.id === activePresetId);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPresetMenu(false);
        setIsCreating(false);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus input when creating/renaming
  useEffect(() => {
    if ((isCreating || renamingId) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating, renamingId]);

  const handleCreateSubmit = () => {
    const name = inputValue.trim();
    if (name) {
      onCreatePreset(name);
      setInputValue("");
      setIsCreating(false);
    }
  };

  const handleRenameSubmit = () => {
    const name = inputValue.trim();
    if (name && renamingId) {
      onRenamePreset(renamingId, name);
      setRenamingId(null);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (isCreating) handleCreateSubmit();
      else if (renamingId) handleRenameSubmit();
    }
    if (e.key === "Escape") {
      setIsCreating(false);
      setRenamingId(null);
      setInputValue("");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Preset selector */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowPresetMenu(!showPresetMenu)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-w-[140px]"
        >
          <LayoutDashboard className="h-4 w-4 text-blue-600" />
          <span className="truncate max-w-[120px]">
            {activePreset?.name ?? "Dashboard"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        </button>

        {showPresetMenu && (
          <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50">
            <div className="p-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-slate-500 uppercase px-2 py-1">
                Dashboards ({presets.length}/10)
              </p>
            </div>
            <div className="max-h-60 overflow-auto p-1">
              {presets.map((preset) => (
                <div key={preset.id} className="group flex items-center gap-1">
                  {renamingId === preset.id ? (
                    <div className="flex items-center gap-1 flex-1 px-2 py-1">
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button onClick={handleRenameSubmit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setRenamingId(null); setInputValue(""); }} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          onSelectPreset(preset.id);
                          setShowPresetMenu(false);
                        }}
                        className={`flex-1 text-left px-3 py-2 text-sm rounded-lg transition-colors truncate ${
                          preset.id === activePresetId
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-slate-700 hover:bg-gray-50"
                        }`}
                      >
                        {preset.name}
                      </button>
                      <div className="hidden group-hover:flex items-center gap-0.5 pr-1">
                        <button
                          onClick={() => { setRenamingId(preset.id); setInputValue(preset.name); }}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Renommer"
                        >
                          <PenLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDuplicatePreset(preset.id)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Dupliquer"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {presets.length > 1 && (
                          <button
                            onClick={() => onDeletePreset(preset.id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Create new */}
            <div className="border-t border-gray-100 p-2">
              {isCreating ? (
                <div className="flex items-center gap-1 px-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nom du dashboard..."
                    className="flex-1 px-2 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button onClick={handleCreateSubmit} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setIsCreating(false); setInputValue(""); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setIsCreating(true); setInputValue(""); }}
                  disabled={presets.length >= 10}
                  className="flex items-center gap-1.5 w-full px-3 py-2 text-sm font-medium text-blue-600 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4" />
                  Nouveau dashboard
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit mode controls */}
      {isEditMode ? (
        <>
          <button
            onClick={onAddWidget}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </button>
          <button
            onClick={onResetLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "..." : "Sauvegarder"}
          </button>
          <button
            onClick={onToggleEditMode}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Terminer
          </button>
        </>
      ) : (
        <button
          onClick={onToggleEditMode}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Pencil className="h-4 w-4" />
          Personnaliser
        </button>
      )}
    </div>
  );
}
