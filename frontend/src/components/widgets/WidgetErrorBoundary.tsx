import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; widgetId: string; widgetType: string; }
interface State { hasError: boolean; error: Error | null; }

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Widget ${this.props.widgetType}] Error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full rounded-xl border border-red-200 bg-red-50 flex flex-col items-center justify-center p-4 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
          <p className="text-sm font-semibold text-gray-900 mb-1">Erreur widget</p>
          {this.state.error && (
            <p className="text-xs text-red-600 font-mono bg-red-100 px-2 py-1 rounded mt-1 max-w-full overflow-hidden">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
