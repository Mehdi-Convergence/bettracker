import { Pencil, Save, Plus, RotateCcw } from "lucide-react";

interface DashboardToolbarProps {
  isEditMode: boolean;
  onToggleEditMode: () => void;
  onSave: () => void;
  onAddWidget: () => void;
  onResetLayout: () => void;
  isSaving?: boolean;
}

export function DashboardToolbar({
  isEditMode,
  onToggleEditMode,
  onSave,
  onAddWidget,
  onResetLayout,
  isSaving,
}: DashboardToolbarProps) {
  return (
    <div className="flex items-center gap-2">
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
