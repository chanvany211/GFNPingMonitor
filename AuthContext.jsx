import React from "react";
import { statusColor, sparklinePath } from "@/lib/gfnRegions";
import { Loader2 } from "lucide-react";

export default function ServerCard({ region, latest, history, isPinging }) {
  const status = latest?.status ?? "error";
  const ms = latest?.latency_ms ?? null;
  const colors = statusColor(status);
  const sparkMax = 180;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 ring-1 ${colors.ring} transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/60`}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: status === "good" ? "linear-gradient(90deg,#34d399,#10b981)" : status === "medium" ? "linear-gradient(90deg,#fbbf24,#f59e0b)" : status === "bad" ? "linear-gradient(90deg,#fb7185,#f43f5e)" : "linear-gradient(90deg,#cbd5e1,#94a3b8)" }} />
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${colors.dot} ${isPinging ? "animate-pulse" : ""}`} />
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">{region.name}</h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{region.location}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-300">{region.code}</p>
        </div>
        <div className="text-right">
          {ms !== null ? (
            <div className="flex items-baseline gap-0.5 justify-end">
              <span className={`font-mono text-2xl font-bold tabular-nums ${colors.text}`}>{ms}</span>
              <span className="text-xs text-slate-400">ms</span>
            </div>
          ) : isPinging ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          ) : (
            <span className="text-xs font-medium text-slate-400">N/A</span>
          )}
          <p className={`mt-0.5 text-[10px] font-medium uppercase tracking-wider ${colors.text}`}>{colors.label}</p>
        </div>
      </div>

      <div className="mt-4 h-8 w-full">
        {history.length > 1 ? (
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id={`grad-${region.code}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={status === "good" ? "#10b981" : status === "medium" ? "#f59e0b" : status === "bad" ? "#f43f5e" : "#94a3b8"} stopOpacity="0.25" />
                <stop offset="100%" stopColor={status === "good" ? "#10b981" : status === "medium" ? "#f59e0b" : status === "bad" ? "#f43f5e" : "#94a3b8"} stopOpacity="0" />
              </linearGradient>
            </defs>
            {(() => {
              const path = sparklinePath(history, 100, 30, sparkMax);
              if (!path) return null;
              const fillPath = path + ` L 100 30 L 0 30 Z`;
              return (
                <>
                  <path d={fillPath} fill={`url(#grad-${region.code})`} />
                  <path d={path} fill="none" stroke={status === "good" ? "#10b981" : status === "medium" ? "#f59e0b" : status === "bad" ? "#f43f5e" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </>
              );
            })()}
          </svg>
        ) : (
          <div className="flex h-full items-center text-[10px] text-slate-300">Waiting for samples…</div>
        )}
      </div>
    </div>
  );
}