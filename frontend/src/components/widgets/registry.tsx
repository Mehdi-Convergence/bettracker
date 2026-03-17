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

// ---- Widget config types ----

export type MetricKey =
  | "roi"
  | "win_rate"
  | "total_pl"
  | "total_bets"
  | "total_staked"
  | "recent_roi"
  | "recent_pl"
  | "recent_bets_count"
  | "streak";

export type SeriesKey = "cumulative" | "pl";

export type BreakdownKey = "count" | "pl" | "roi" | "win_rate" | "staked";

export type DataSourceKey = "recent_bets" | "campaigns";

export interface WidgetConfigOption {
  key: string;
  label: string;
  type: "select" | "color" | "number" | "text" | "multi-select";
  options?: { value: string; label: string }[];
  defaultValue?: string | number | string[];
}

export interface WidgetConfig {
  metric?: MetricKey;
  color?: string;
  suffix?: string;
  series?: SeriesKey[];
  dataKey?: BreakdownKey;
  dataSource?: DataSourceKey;
  pageSize?: number;
}

// ---- Widget definition ----

export interface WidgetDefinition {
  name: string;
  description: string;
  icon: ReactNode;
  category: WidgetCategory;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  configOptions: WidgetConfigOption[];
  defaultConfig: WidgetConfig;
}

// ---- Metric options (reused across types) ----

const METRIC_OPTIONS: { value: string; label: string }[] = [
  { value: "roi", label: "ROI (%)" },
  { value: "win_rate", label: "Win Rate (%)" },
  { value: "total_pl", label: "P&L Total" },
  { value: "total_bets", label: "Nombre de paris" },
  { value: "total_staked", label: "Total mise" },
  { value: "recent_roi", label: "ROI recent (30j)" },
  { value: "recent_pl", label: "P&L recent (30j)" },
  { value: "recent_bets_count", label: "Paris recents (30j)" },
  { value: "streak", label: "Serie en cours" },
];

const COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "#3b82f6", label: "Bleu" },
  { value: "#10b981", label: "Vert" },
  { value: "#f59e0b", label: "Orange" },
  { value: "#ef4444", label: "Rouge" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Rose" },
  { value: "#06b6d4", label: "Cyan" },
];

const BREAKDOWN_OPTIONS: { value: string; label: string }[] = [
  { value: "count", label: "Nombre de paris" },
  { value: "pl", label: "P&L" },
  { value: "roi", label: "ROI (%)" },
  { value: "win_rate", label: "Win Rate (%)" },
  { value: "staked", label: "Total mise" },
];

// ---- Registry ----

export const widgetRegistry: Record<WidgetType, WidgetDefinition> = {
  "stat-card": {
    name: "Carte KPI",
    description: "Metrique simple avec tendance",
    icon: <BarChart2 className="h-4 w-4" />,
    category: "kpi",
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    configOptions: [
      { key: "metric", label: "Metrique", type: "select", options: METRIC_OPTIONS, defaultValue: "total_bets" },
      { key: "color", label: "Couleur", type: "select", options: COLOR_OPTIONS, defaultValue: "#3b82f6" },
    ],
    defaultConfig: { metric: "total_bets", color: "#3b82f6" },
  },
  "trend-card": {
    name: "Carte Tendance",
    description: "Metrique avec mini graphique",
    icon: <TrendingUp className="h-4 w-4" />,
    category: "kpi",
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
    configOptions: [
      { key: "metric", label: "Metrique", type: "select", options: METRIC_OPTIONS, defaultValue: "roi" },
      { key: "color", label: "Couleur", type: "select", options: COLOR_OPTIONS, defaultValue: "#3b82f6" },
    ],
    defaultConfig: { metric: "roi", color: "#3b82f6" },
  },
  gauge: {
    name: "Jauge",
    description: "Jauge circulaire pour pourcentages",
    icon: <Gauge className="h-4 w-4" />,
    category: "kpi",
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 3, h: 3 },
    configOptions: [
      { key: "metric", label: "Metrique", type: "select", options: [
        { value: "win_rate", label: "Win Rate (%)" },
        { value: "roi", label: "ROI (%)" },
      ], defaultValue: "win_rate" },
    ],
    defaultConfig: { metric: "win_rate" },
  },
  "line-chart": {
    name: "Graphique Lineaire",
    description: "Courbe d'evolution temporelle",
    icon: <TrendingUp className="h-4 w-4" />,
    category: "charts",
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    configOptions: [
      { key: "series", label: "Series", type: "multi-select", options: [
        { value: "cumulative", label: "P&L Cumule" },
        { value: "pl", label: "P&L Journalier" },
      ], defaultValue: ["cumulative", "pl"] },
    ],
    defaultConfig: { series: ["cumulative", "pl"] },
  },
  "pie-chart": {
    name: "Graphique Circulaire",
    description: "Repartition en parts",
    icon: <PieChart className="h-4 w-4" />,
    category: "charts",
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    configOptions: [
      { key: "dataKey", label: "Donnees", type: "select", options: BREAKDOWN_OPTIONS, defaultValue: "count" },
    ],
    defaultConfig: { dataKey: "count" },
  },
  "bar-chart": {
    name: "Graphique a Barres",
    description: "Comparaison de valeurs",
    icon: <BarChart2 className="h-4 w-4" />,
    category: "charts",
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    configOptions: [
      { key: "dataKey", label: "Donnees", type: "select", options: BREAKDOWN_OPTIONS, defaultValue: "roi" },
    ],
    defaultConfig: { dataKey: "roi" },
  },
  "data-table": {
    name: "Table de Donnees",
    description: "Tableau avec tri, filtre et export",
    icon: <Table className="h-4 w-4" />,
    category: "operational",
    defaultSize: { w: 8, h: 5 },
    minSize: { w: 6, h: 4 },
    configOptions: [
      { key: "dataSource", label: "Source", type: "select", options: [
        { value: "recent_bets", label: "Paris recents" },
        { value: "campaigns", label: "Campagnes" },
      ], defaultValue: "recent_bets" },
      { key: "pageSize", label: "Lignes par page", type: "number", defaultValue: 5 },
    ],
    defaultConfig: { dataSource: "recent_bets", pageSize: 5 },
  },
  "activity-feed": {
    name: "Activite Recente",
    description: "Timeline d'activite",
    icon: <Activity className="h-4 w-4" />,
    category: "operational",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    configOptions: [],
    defaultConfig: {},
  },
  "value-bets": {
    name: "Value Bets",
    description: "Opportunites detectees par le scanner",
    icon: <Zap className="h-4 w-4" />,
    category: "betting",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    configOptions: [],
    defaultConfig: {},
  },
};

export const widgetCategories: Record<WidgetCategory, { label: string; icon: ReactNode }> = {
  kpi: { label: "KPI & Metriques", icon: <BarChart2 className="h-4 w-4" /> },
  charts: { label: "Graphiques", icon: <TrendingUp className="h-4 w-4" /> },
  operational: { label: "Operationnel", icon: <Activity className="h-4 w-4" /> },
  betting: { label: "Paris", icon: <Zap className="h-4 w-4" /> },
};
