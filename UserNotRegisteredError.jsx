import React, { useState, useEffect, useCallback, useRef } from "react";
import { measurePing, latencyStatus, statusColor, sparklinePath } from "@/lib/gfnRegions";
import { Plus, X, Loader2, Zap, Trash2 } from "lucide-react";

const HISTORY_LENGTH = 20;
const STORAGE_KEY = "gfn_custom_targets";

function normalizeUrl(input) {
  let v = input.trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  return v;
}

function shortLabel(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function CustomPingTester() {
  const [targets, setTargets] = useState([]); // { id, url }
  const [input, setInput] = useState("");
  const [results, setResults] = useState({}); // id -> { latency_ms, status }
  const [histories, setHistories] = useState({}); // id -> number[]
  const [pinging, setPinging] = useState({}); // id -> bool
  const [pingingAll, setPingingAll] = useState(false);
  const ids = useRef(0);

  // Load persisted targets
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved) && saved.length) {
        setTargets(saved);
        ids.current = Math.max(0, ...saved.map((t) => Number(t.id) || 0));
      }
    } catch (_) { /* ignore */ }
  }, []);

  // Persist targets
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(targets)); } catch (_) { /* ignore */ }
  }, [targets]);

  const pingOne = useCallback(async (id, url) => {
    setPinging((p) => ({ ...p, [id]: true }));
    const ms = await measurePing(url);
    const status = latencyStatus(ms);
    setResults((prev) => ({ ...prev, [id]: { latency_ms: ms, status, checked_at: new Date().toISOString() } }));
    setHistories((prev) => {
      const cur = prev[id] ?? [];
      return { ...prev, [id]: [...cur, ms].slice(-HISTORY_LENGTH) };
    });
    setPinging((p) => ({ ...p, [id]: false }));
  }, []);

  const addTarget = () => {
    const url = normalizeUrl(input);
    if (!url) return;
    // avoid duplicates
    if (targets.some((t) => t.url === url)) return;
    const id = String(++ids.current);
    const next = [...targets, { id, url }];
    setTargets(next);
    setInput("");
    // ping immediately
    pingOne(id, url);
  };

  const removeTarget = (id) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
    setResults((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setHistories((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const pingAll = async () => {
    if (!targets.length) return;
    setPingingAll(true);
    await Promise.all(targets.map((t) => pingOne(t.id, t.url)));
    setPingingAll(false);
  };

  const onKeyDown = (e) => { if (e.key === "Enter") addTarget(); };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Custom Ping Tester</h2>
            <p className="text-xs text-slate-400">Test latency to any host or URL</p>
          </div>
        </div>
        {targets.length > 0 && (
          <button
            onClick={pingAll}
            disabled={pingingAll}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {pingingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Ping All
          </button>
        )}
      </div>

      {/* Add target */}
      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="example.com or https://example.com"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
          {input && (
            <button
              onClick={() => setInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={addTarget}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {/* Target list */}
      {targets.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center">
          <p className="text-sm text-slate-400">No custom targets yet.</p>
          <p className="mt-1 text-xs text-slate-400">Add a URL above to start measuring your latency to it.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {targets.map((t) => {
            const r = results[t.id];
            const hist = (histories[t.id] ?? []).filter((v) => v !== null);
            const status = r?.status ?? "error";
            const ms = r?.latency_ms ?? null;
            const colors = statusColor(status);
            const stroke = status === "good" ? "#10b981" : status === "medium" ? "#f59e0b" : status === "bad" ? "#f43f5e" : "#94a3b8";
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/40 p-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.dot} ${pinging[t.id] ? "animate-pulse" : ""}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{shortLabel(t.url)}</p>
                  <p className="truncate font-mono text-[10px] text-slate-400">{t.url}</p>
                </div>

                {/* sparkline */}
                <div className="hidden h-7 w-24 sm:block">
                  {hist.length > 1 ? (
                    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-full w-full">
                      <path d={sparklinePath(hist, 100, 30, 180)} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <div className="flex h-full items-center justify-end text-[10px] text-slate-300">—</div>
                  )}
                </div>

                {/* latency value */}
                <div className="w-16 text-right">
                  {ms !== null ? (
                    <span className={`font-mono text-sm font-bold tabular-nums ${colors.text}`}>{ms}<span className="text-[10px] text-slate-400"> ms</span></span>
                  ) : pinging[t.id] ? (
                    <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-300" />
                  ) : (
                    <span className="text-xs text-slate-400">N/A</span>
                  )}
                </div>

                <button
                  onClick={() => pingOne(t.id, t.url)}
                  disabled={pinging[t.id]}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
                  title="Ping now"
                >
                  <Zap className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => removeTarget(t.id)}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}