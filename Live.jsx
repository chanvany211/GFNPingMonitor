const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect, useCallback, useRef } from "react";

import { GFN_REGIONS, measurePing, latencyStatus } from "@/lib/gfnRegions";
import ServerCard from "@/components/ServerCard";
import CustomPingTester from "@/components/CustomPingTester";
import { Link } from "react-router-dom";
import { Activity, RefreshCw, Pause, Play, Gauge, Radio, MonitorPlay } from "lucide-react";

const HISTORY_LENGTH = 20;
const INTERVALS = [
  { label: "3s", value: 3 },
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
];

export default function Home() {
  const [results, setResults] = useState({}); // region.code -> { latency_ms, status, checked_at }
  const [histories, setHistories] = useState({}); // region.code -> number[]
  const [pinging, setPinging] = useState({}); // region.code -> bool
  const [running, setRunning] = useState(true);
  const [interval, setIntervalSec] = useState(5);
  const [lastRun, setLastRun] = useState(null);
  const [sessionStart] = useState(() => new Date());
  const timerRef = useRef(null);

  const pingRegion = useCallback(async (region) => {
    setPinging((p) => ({ ...p, [region.code]: true }));
    const ms = await measurePing(region.url);
    const status = latencyStatus(ms);
    const now = new Date().toISOString();

    setResults((prev) => ({ ...prev, [region.code]: { latency_ms: ms, status, checked_at: now } }));
    setHistories((prev) => {
      const cur = prev[region.code] ?? [];
      return { ...prev, [region.code]: [...cur, ms].slice(-HISTORY_LENGTH) };
    });

    // Persist to entity (fire-and-forget, don't block UI)
    try {
      await db.entities.PingResult.create({
        region: region.code,
        region_name: region.name,
        latency_ms: ms ?? -1,
        status,
        checked_at: now,
      });
    } catch (_) { /* ignore persistence errors */ }

    setPinging((p) => ({ ...p, [region.code]: false }));
  }, []);

  const runAll = useCallback(async () => {
    await Promise.all(GFN_REGIONS.map((r) => pingRegion(r)));
    setLastRun(new Date());
  }, [pingRegion]);

  useEffect(() => {
    if (!running) return;
    runAll();
    timerRef.current = setInterval(runAll, interval * 1000);
    return () => clearInterval(timerRef.current);
  }, [running, interval, runAll]);

  const allResults = Object.values(results);
  const onlineCount = allResults.filter((r) => r.status !== "error").length;
  const latencies = allResults.filter((r) => r.latency_ms !== null).map((r) => r.latency_ms);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const bestRegion = allResults
    .filter((r) => r.latency_ms !== null)
    .sort((a, b) => a.latency_ms - b.latency_ms)[0];

  const bestRegionMeta = bestRegion ? GFN_REGIONS.find((r) => r.code === Object.keys(results).find((k) => results[k] === bestRegion)) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 shadow-lg shadow-emerald-500/30">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className={`absolute inline-flex h-full w-full rounded-full ${running ? "bg-emerald-400" : "bg-slate-300"} opacity-75 ${running ? "animate-ping" : ""}`} />
                <span className={`relative inline-flex h-3 w-3 rounded-full ${running ? "bg-emerald-500" : "bg-slate-400"}`} />
              </span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">GFN Ping Monitor</h1>
              <p className="text-xs text-slate-400">GeForce NOW latency dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 sm:flex">
              {INTERVALS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setIntervalSec(opt.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${interval === opt.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRunning((r) => !r)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${running ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
            >
              {running ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}
            </button>
            <button
              onClick={runAll}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <Link
              to="/live"
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:from-violet-700 hover:to-indigo-700"
            >
              <MonitorPlay className="h-3.5 w-3.5" /> Live Mode
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Stats summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard icon={<Radio className="h-4 w-4" />} label="Regions Online" value={`${onlineCount}/${GFN_REGIONS.length}`} accent="text-emerald-600" bg="bg-emerald-50" />
          <StatCard icon={<Gauge className="h-4 w-4" />} label="Avg Latency" value={avgLatency !== null ? `${avgLatency} ms` : "—"} accent="text-slate-700" bg="bg-slate-100" />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Best Region" value={bestRegionMeta ? `${bestRegionMeta.name}` : "—"} sub={bestRegion ? `${bestRegion.latency_ms} ms` : ""} accent="text-blue-600" bg="bg-blue-50" />
          <StatCard icon={<RefreshCw className="h-4 w-4" />} label="Last Update" value={lastRun ? lastRun.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"} accent="text-slate-500" bg="bg-slate-50" />
        </div>

        {/* Server grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {GFN_REGIONS.map((region) => (
            <ServerCard
              key={region.code}
              region={region}
              latest={results[region.code]}
              history={(histories[region.code] ?? []).filter((v) => v !== null)}
              isPinging={pinging[region.code]}
            />
          ))}
        </div>

        {/* Custom ping tester */}
        <div className="mt-8">
          <CustomPingTester />
        </div>

        {/* Footer note */}
        <div className="mt-8 flex flex-col items-center gap-1 text-center">
          <p className="text-xs text-slate-400">
            Latency measured via HTTP round-trip (no-cors). Values are approximate and include TLS overhead.
          </p>
          <p className="text-[10px] text-slate-300">
            Session started {sessionStart.toLocaleTimeString()} · Auto-refresh every {interval}s
          </p>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent, bg }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg} ${accent}`}>{icon}</span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums text-slate-900">{value}</span>
        {sub && <span className={`text-xs font-medium ${accent}`}>{sub}</span>}
      </div>
    </div>
  );
}