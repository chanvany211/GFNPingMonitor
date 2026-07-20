const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useMemo, useState } from "react";

import { QUALITY_LEVELS } from "@/lib/gfnStats";
import { Link } from "react-router-dom";
import { ArrowLeft, History as HistoryIcon, Trash2, Cloud, HardDrive } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart, ReferenceLine,
} from "recharts";

const LOCAL_LOG_KEY = "gfn_live_log";

export default function History() {
  const [cloudRecords, setCloudRecords] = useState([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [localRecords, setLocalRecords] = useState([]);

  useEffect(() => {
    try {
      const arr = JSON.parse(localStorage.getItem(LOCAL_LOG_KEY) || "[]");
      setLocalRecords(arr);
    } catch (_) { /* ignore */ }
    loadCloud();
  }, []);

  const loadCloud = async () => {
    setLoadingCloud(true);
    try {
      const list = await db.entities.PingResult.list("-checked_at", 500);
      setCloudRecords(list || []);
    } catch (e) {
      setCloudRecords([]);
    } finally {
      setLoadingCloud(false);
    }
  };

  const clearLocal = () => {
    localStorage.removeItem(LOCAL_LOG_KEY);
    setLocalRecords([]);
  };

  // Build chart data from local log (this session's samples)
  const chartData = useMemo(() => {
    return localRecords
      .filter((r) => r.latency_ms !== null && r.latency_ms !== -1)
      .map((r, i) => ({
        i,
        latency: r.latency_ms,
        jitter: r.jitter_ms ?? null,
        time: new Date(r.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      }));
  }, [localRecords]);

  // Aggregated patterns by region (cloud)
  const byRegion = useMemo(() => {
    const map = {};
    cloudRecords.forEach((r) => {
      if (!r.region) return;
      if (!map[r.region]) map[r.region] = { region: r.region, name: r.region_name || r.region, samples: [], lost: 0, jitterSum: 0, jitterN: 0 };
      map[r.region].samples.push(r);
      if (r.latency_ms === -1 || r.latency_ms === null) map[r.region].lost += 1;
      if (r.jitter_ms != null && r.jitter_ms >= 0) { map[r.region].jitterSum += r.jitter_ms; map[r.region].jitterN += 1; }
    });
    return Object.values(map).map((g) => {
      const valid = g.samples.filter((s) => s.latency_ms !== -1 && s.latency_ms !== null);
      const avg = valid.length ? Math.round(valid.reduce((a, b) => a + b.latency_ms, 0) / valid.length) : null;
      const loss = g.samples.length ? Math.round((g.lost / g.samples.length) * 1000) / 10 : 0;
      const avgJitter = g.jitterN ? Math.round(g.jitterSum / g.jitterN) : null;
      return { ...g, avg, loss, avgJitter, count: g.samples.length };
    }).filter((g) => g.count > 0);
  }, [cloudRecords]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/live" className="flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Live
            </Link>
            <Link to="/" className="flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
              Dashboard
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadCloud} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">Refresh</button>
            <button onClick={clearLocal} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-rose-300 hover:bg-slate-700">
              <Trash2 className="h-3.5 w-3.5" /> Clear local
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <HistoryIcon className="h-5 w-5 text-violet-400" />
          <h1 className="text-xl font-bold tracking-tight">Connection Patterns</h1>
        </div>

        {/* Local session chart */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
            <HardDrive className="h-4 w-4 text-slate-400" />
            <span className="font-semibold">This device's recent samples</span>
            <span className="text-slate-500">· {chartData.length} points</span>
          </div>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#94a3b8" }} />
                <ReferenceLine y={60} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.4} />
                <ReferenceLine y={150} stroke="#f43f5e" strokeDasharray="3 3" strokeOpacity={0.4} />
                <Area type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} fill="url(#latGrad)" name="Latency (ms)" />
                <Line type="monotone" dataKey="jitter" stroke="#fb923c" strokeWidth={1.5} dot={false} name="Jitter (ms)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Not enough local samples yet. Run the Live monitor to collect data.</p>
          )}
        </section>

        {/* Cloud patterns by region */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-300">
            <Cloud className="h-4 w-4 text-violet-400" />
            <span className="font-semibold">Cloud-synced patterns by region</span>
            <span className="text-slate-500">· {loadingCloud ? "loading…" : `${cloudRecords.length} samples`}</span>
          </div>
          {byRegion.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {byRegion.map((g) => {
                const q = QUALITY_LEVELS[
                  g.loss >= 5 || (g.avg !== null && g.avg >= 200) ? "poor"
                  : g.loss >= 1 || (g.avgJitter !== null && g.avgJitter >= 30) || (g.avg !== null && g.avg >= 150) ? "degraded"
                  : (g.avg !== null && g.avg < 60 && (g.avgJitter === null || g.avgJitter < 15) && g.loss < 0.5) ? "optimal"
                  : "good"
                ];
                return (
                  <div key={g.region} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-200">{g.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${q.bg} ${q.text}`}>{q.label}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <Cell label="Avg" value={g.avg} unit="ms" />
                      <Cell label="Jitter" value={g.avgJitter} unit="ms" />
                      <Cell label="Loss" value={g.loss} unit="%" />
                    </div>
                    <p className="mt-2 text-[10px] text-slate-500">{g.count} samples</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">No cloud-synced data yet.</p>
              <p className="mt-1 text-xs text-slate-600">Enable <span className="text-violet-400">Pro cloud sync</span> in the Live monitor to upload stats here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Cell({ label, value, unit }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-200">
        {value !== null && value !== undefined ? value : "—"}<span className="ml-0.5 text-[10px] text-slate-500">{value !== null && value !== undefined ? unit : ""}</span>
      </p>
    </div>
  );
}