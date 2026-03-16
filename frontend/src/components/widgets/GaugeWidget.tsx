interface GaugeWidgetProps {
  title: string;
  value: number;
  label?: string;
  sublabel?: string;
  thresholds?: { low: number; medium: number };
}

export function GaugeWidget({ title, value, label, sublabel, thresholds = { low: 33, medium: 66 } }: GaugeWidgetProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 80;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;
  const angle = -90 + (clamped / 100) * 180;
  const needleLength = radius - 10;
  const needleX = Math.cos((angle * Math.PI) / 180) * needleLength;
  const needleY = Math.sin((angle * Math.PI) / 180) * needleLength;

  const getColor = () => {
    if (clamped <= thresholds.low) return "#ef4444";
    if (clamped <= thresholds.medium) return "#f59e0b";
    return "#10b981";
  };
  const strokeColor = getColor();

  return (
    <div className="h-full w-full rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="flex-1 p-4 flex flex-col items-center justify-center">
        <div className="relative w-48 h-24">
          <svg viewBox="0 0 200 120" className="w-full h-full">
            <path d={`M 10,100 A ${radius},${radius} 0 0,1 190,100`} fill="none" stroke="#e5e7eb" strokeWidth="20" strokeLinecap="round" />
            <path
              d={`M 10,100 A ${radius},${radius} 0 0,1 190,100`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="20"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.5s ease-in-out" }}
            />
            <circle cx="100" cy="100" r="8" fill="#475569" />
            <line
              x1="100"
              y1="100"
              x2={100 + needleX}
              y2={100 + needleY}
              stroke="#1e293b"
              strokeWidth="3"
              strokeLinecap="round"
              style={{ transition: "all 0.5s ease-in-out" }}
            />
          </svg>
        </div>
        <div className="mt-2 text-center">
          <div className="text-4xl font-black text-slate-900">{Math.round(value)}<span className="text-xl text-slate-500">%</span></div>
          {label && <div className="mt-1 text-sm font-medium text-slate-600">{label}</div>}
          {sublabel && <div className="mt-0.5 text-xs text-slate-400">{sublabel}</div>}
        </div>
      </div>
    </div>
  );
}
