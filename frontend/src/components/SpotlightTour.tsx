import { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
}

interface Props {
  steps: TourStep[];
  onComplete: () => void;
}

const MARGIN = 12;
const GAP = 12;

type Placement = "top" | "bottom" | "left" | "right";

function calcPosition(placement: Placement, r: DOMRect, tw: number, th: number) {
  let top = 0;
  let left = 0;

  switch (placement) {
    case "bottom":
      top = r.bottom + GAP;
      left = r.left + r.width / 2 - tw / 2;
      break;
    case "top":
      top = r.top - GAP - th;
      left = r.left + r.width / 2 - tw / 2;
      break;
    case "right":
      top = r.top + r.height / 2 - th / 2;
      left = r.right + GAP;
      break;
    case "left":
      top = r.top + r.height / 2 - th / 2;
      left = r.left - GAP - tw;
      break;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  left = Math.max(MARGIN, Math.min(left, vw - tw - MARGIN));
  top = Math.max(MARGIN, Math.min(top, vh - th - MARGIN));

  return { top, left };
}

function overlaps(pos: { top: number; left: number }, tw: number, th: number, r: DOMRect, pad: number): boolean {
  const tRight = pos.left + tw;
  const tBottom = pos.top + th;
  const rTop = r.top - pad;
  const rLeft = r.left - pad;
  const rRight = r.right + pad;
  const rBottom = r.bottom + pad;
  return !(tRight <= rLeft || pos.left >= rRight || tBottom <= rTop || pos.top >= rBottom);
}

function bestPosition(preferred: Placement, r: DOMRect, pad: number, tw: number, th: number) {
  const order: Placement[] = [preferred, "bottom", "right", "top", "left"];
  for (const p of order) {
    const pos = calcPosition(p, r, tw, th);
    if (!overlaps(pos, tw, th, r, pad)) return pos;
  }
  return calcPosition(preferred, r, tw, th);
}

export default function SpotlightTour({ steps, onComplete }: Props) {
  const [current, setCurrent] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const visibleSteps = useMemo(() => {
    return steps.filter((s) => document.querySelector(s.target) !== null);
  }, [steps]);

  useEffect(() => {
    if (visibleSteps.length === 0) onComplete();
  }, [visibleSteps, onComplete]);

  const step = visibleSteps[current];

  const updateRect = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (el) {
      setRect(el.getBoundingClientRect());
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      setRect(null);
    }
  }, [step]);

  useEffect(() => {
    updateRect();
    const timer = setTimeout(updateRect, 100);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [updateRect]);

  // Measure actual tooltip and compute non-overlapping position
  useLayoutEffect(() => {
    if (!rect || !tooltipRef.current) {
      setTooltipPos(null);
      return;
    }
    const el = tooltipRef.current;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const pos = bestPosition(step?.placement || "bottom", rect, 8, tw, th);
    setTooltipPos(pos);
  }, [rect, step, current]);

  const next = () => {
    if (current < visibleSteps.length - 1) setCurrent(current + 1);
    else onComplete();
  };
  const prev = () => {
    if (current > 0) setCurrent(current - 1);
  };

  if (!step || visibleSteps.length === 0) return null;

  const pad = 8;

  const tooltipStyle: React.CSSProperties = tooltipPos
    ? { position: "fixed", top: tooltipPos.top, left: tooltipPos.left }
    : rect
      ? { position: "fixed", top: rect.bottom + GAP, left: rect.left }
      : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  const overlayStyle = rect
    ? {
        boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.55), 0 0 0 ${pad}px rgba(79, 140, 255, 0.25)`,
        position: "fixed" as const,
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        borderRadius: 8,
        zIndex: 10000,
        pointerEvents: "none" as const,
        transition: "all 0.3s ease",
      }
    : {
        position: "fixed" as const,
        inset: 0,
        background: "var(--overlay)",
        zIndex: 10000,
        pointerEvents: "none" as const,
      };

  return createPortal(
    <>
      <div style={overlayStyle} />

      <div
        style={{ position: "fixed", inset: 0, zIndex: 10001, cursor: "default" }}
        onClick={(e) => e.stopPropagation()}
      />

      <button
        onClick={onComplete}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 10003,
          background: "rgba(255,255,255,0.15)",
          border: "none",
          borderRadius: 8,
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "white",
          backdropFilter: "blur(4px)",
        }}
      >
        <X size={18} />
      </button>

      <div
        ref={tooltipRef}
        style={{
          ...tooltipStyle,
          zIndex: 10002,
          maxWidth: 380,
          minWidth: 280,
        }}
      >
        <div
          style={{
            background: "var(--bg-card)",
            borderRadius: 12,
            padding: "20px 24px 16px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#4f8cff",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            {current + 1} / {visibleSteps.length}
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
            {step.title}
          </div>

          <div style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 16 }}>
            {step.content}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={prev}
              disabled={current === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 12px",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                background: "var(--bg-card)",
                color: current === 0 ? "var(--border-strong)" : "var(--text-muted)",
                fontSize: 13,
                cursor: current === 0 ? "default" : "pointer",
                fontWeight: 500,
              }}
            >
              <ChevronLeft size={14} />
              Précédent
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={next}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 16px",
                border: "none",
                borderRadius: 8,
                background: "#4f8cff",
                color: "white",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {current === visibleSteps.length - 1 ? "Terminer" : "Suivant"}
              {current < visibleSteps.length - 1 && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
