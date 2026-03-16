import {
  BarChart2,
  TrendingUp,
  PieChart,
  Gauge,
  Table,
  Activity,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

export type WidgetType =
  | "stat-card"
  | "trend-card"
  | "gauge"
  | "line-chart"
  | "pie-chart"
  | "bar-chart"
  | "data-table"
  | "activity-feed"
  | "value-bets";

export type WidgetCategory = "kpi" | "charts" | "operational" | "betting";

export interface WidgetDefinition {
  name: string;
  description: string;
  icon: ReactNode;
  category: WidgetCategory;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
}

export const widgetRegistry: Record<WidgetType, WidgetDefinition> = {
  "stat-card": {
    name: "Carte KPI",
    description: "Metrique simple avec tendance",
    icon: <BarChart2 className="h-4 w-4" />,
    category: "kpi",
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
  },
  "trend-card": {
    name: "Carte Tendance",
    description: "Metrique avec mini graphique",
    icon: <TrendingUp className="h-4 w-4" />,
    category: "kpi",
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
  },
  gauge: {
    name: "Jauge",
    description: "Jauge circulaire pour pourcentages",
    icon: <Gauge className="h-4 w-4" />,
    category: "kpi",
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 3, h: 3 },
  },
  "line-chart": {
    name: "Graphique Lineaire",
    description: "Courbe d'evolution temporelle",
    icon: <TrendingUp className="h-4 w-4" />,
    category: "charts",
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
  },
  "pie-chart": {
    name: "Graphique Circulaire",
    description: "Repartition en parts",
    icon: <PieChart className="h-4 w-4" />,
    category: "charts",
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
  },
  "bar-chart": {
    name: "Graphique a Barres",
    description: "Comparaison de valeurs",
    icon: <BarChart2 className="h-4 w-4" />,
    category: "charts",
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
  },
  "data-table": {
    name: "Table de Donnees",
    description: "Tableau avec tri, filtre et export",
    icon: <Table className="h-4 w-4" />,
    category: "operational",
    defaultSize: { w: 8, h: 5 },
    minSize: { w: 6, h: 4 },
  },
  "activity-feed": {
    name: "Activite Recente",
    description: "Timeline d'activite",
    icon: <Activity className="h-4 w-4" />,
    category: "operational",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
  },
  "value-bets": {
    name: "Value Bets",
    description: "Opportunites detectees par le scanner",
    icon: <Zap className="h-4 w-4" />,
    category: "betting",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
  },
};

export const widgetCategories: Record<WidgetCategory, { label: string; icon: ReactNode }> = {
  kpi: { label: "KPI & Metriques", icon: <BarChart2 className="h-4 w-4" /> },
  charts: { label: "Graphiques", icon: <TrendingUp className="h-4 w-4" /> },
  operational: { label: "Operationnel", icon: <Activity className="h-4 w-4" /> },
  betting: { label: "Paris", icon: <Zap className="h-4 w-4" /> },
};
