import { useState, useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Table,
} from "lucide-react";
import { BaseWidget } from "./BaseWidget";

interface DataTableWidgetProps {
  title: string;
  subtitle?: string;
  data: Array<Record<string, unknown>>;
  columns?: Array<{ key: string; label: string }>;
  pageSize?: number;
  isLoading?: boolean;
}

export function DataTableWidget({ title, subtitle, data, columns: propColumns, pageSize = 5, isLoading }: DataTableWidgetProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [page, setPage] = useState(1);

  const columns = useMemo(() => {
    if (propColumns) return propColumns;
    if (data.length === 0) return [];
    return Object.keys(data[0]).map((k) => ({
      key: k,
      label: k
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim(),
    }));
  }, [data, propColumns]);

  const filtered = useMemo(() => {
    if (!searchTerm) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(term))
    );
  }, [data, searchTerm]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const dir = sortDir === "asc" ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey("");
      setSortDir(null);
    }
  };

  const handleExport = () => {
    const headers = columns.map((c) => c.label).join(",");
    const rows = sorted
      .map((row) => columns.map((c) => JSON.stringify(row[c.key] ?? "")).join(","))
      .join("\n");
    const blob = new Blob([`${headers}\n${rows}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCell = (v: unknown) => {
    if (v === null || v === undefined) return "-";
    if (typeof v === "number") return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    return String(v);
  };

  return (
    <BaseWidget title={title} subtitle={subtitle} icon={<Table className="h-4 w-4" />} isLoading={isLoading}>
      <div className="h-full flex flex-col -m-3">
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50/50">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-7 pr-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1" />
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 border-b cursor-pointer hover:bg-gray-100 whitespace-nowrap select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>{col.label}</span>
                      {sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3 text-blue-600" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-blue-600" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 text-gray-400" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-6 text-center text-gray-400 text-xs">
                    Aucune donnee
                  </td>
                </tr>
              ) : (
                paginated.map((row, ri) => (
                  <tr key={ri} className={`border-b hover:bg-blue-50/30 ${ri % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-1.5 text-xs text-gray-900 whitespace-nowrap">
                        {formatCell(row[col.key])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-1.5 border-t bg-gray-50/50">
            <span className="text-xs text-gray-500">
              {sorted.length} resultat{sorted.length > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs text-gray-700">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </BaseWidget>
  );
}
