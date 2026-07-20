const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect, useRef, useCallback } from "react";

import { GFN_REGIONS, measurePing, latencyStatus, statusColor } from "@/lib/gfnRegions";
import { computeJitter, computePacketLoss, routingQuality, QUALITY_LEVELS, isUnstable, alertMessage } from "@/lib/gfnStats";
import { Link } from "react-router-dom";
import { ArrowLeft, Maximize, Minimize, Play, Pause, Wifi, Bell, BellOff, History as HistoryIcon, Cloud, Lock, AlertTriangle } from "lucide-react";

const HISTORY_LENGTH = 40;
const LOCAL_LOG_KEY = "gfn_live_log";
const PRO_KEY = "gfn_pro_sync";
const MAX_LOCAL_LOG = 600;

export default function Live() {
  const [regionCode, setRegionCode] = useState(() => localStorage.getItem("gfn_live_region") || GFN_REGIONS[0].code);
  const [running, setRunning] = useState(true);
  const [ms, setMs] = useState(null);
  const [history, setHistory] = useState([]); // last N samples (number | null)
  const [pinging, setPinging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [proSync, setProSync] = useState(() => localStorage.getItem(PRO_KEY) === "1");
  const [alert, setAlert] = useState(null); // { msg } when unstable, null when stable
  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const unstableRef = useRef(false);
  const region = GFN_REGIONS.find((r) => r.code === regionCode) || GFN_REGIONS[0];

  // Derived stats over the window
  const valid = history.filter((v) => v !== null);
  const jitter = computeJitter(history);
  const loss = computePacketLoss(history);
  const quality = routingQuality({ ms, jitter, loss });
  const qLevel = QUALITY_LEVELS[quality];
  const minMs = valid.length ? Math.min(...valid) : null;
  const maxMs = valid.length ? Math.max(...valid) : null;
  const avgMs = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;

  const persistSample = useCallback(async (sample) => {
    // Local log (always)
    try {
      const arr = JSON.parse(localStorage.getItem(LOCAL_LOG_KEY) || "[]");
      arr.push({ ...sample, region: region.code, region_name: region.name, checked_at: new Date().toISOString() });
      localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(arr.slice(-MAX_LOCAL_LOG)));
    } catch (_) { /* ignore */ }

    // Cloud sync (Pro) — persisted to the PingResult entity
    if (localStorage.getItem(PRO_KEY) === "1") {
      try {
        await db.entities.PingResult.create({
          region: region.code,
          region_name: region.name,
          latency_ms: sample.latency_ms ?? -1,
          jitter_ms: sample.jitter_ms ?? -1,
          packet_loss_pct: sample.packet_loss_pct ?? 0,
          quality: sample.quality,
          status: sample.status,
          source: "live",
          checked_at: sample.checked_at,
        });
      } catch (_) { /* ignore */ }
    }
  }, [region]);

  const ping = useCallback(async () => {
    setPinging(true);
    const value = await measurePing(region.url, 4000);
    setPinging(false);
    const status = latencyStatus(value);
    setHistory((prev) => [...prev, value].slice(-HISTORY_LENGTH));
    setMs(value);
    // Log with the stats known at this tick (computed from the updated window via effect below)
  }, [region]);

  // Recompute + log + alert whenever history changes (once per tick)
  useEffect(() => {
    if (!history.length) return;
    const j = computeJitter(history);
    const l = computePacketLoss(history);
    const q = routingQuality({ ms, jitter: j, loss: l });
    const sample = { latency_ms: ms, jitter_ms: j, packet_loss_pct: l, quality: q, status: latencyStatus(ms), checked_at: new Date().toISOString() };
    persistSample(sample);

    const unstable = isUnstable({ ms, jitter: j, loss: l });
    if (unstable && !unstableRef.current) {
      const msg = alertMessage({ ms, jitter: j, loss: l });
      setAlert({ msg });
      if (alertsOn && Notification?.permission === "granted") {
        new Notification("GFN Connection Alert", { body: msg });
      }
    } else if (!unstable && unstableRef.current) {
      setAlert(null);
    }
    unstableRef.current = unstable;
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-run loop
  useEffect(() => {
    if (!running) return;
    ping();
    timerRef.current = setInterval(ping, 1000);
    return () => clearInterval(timerRef.current);
  }, [running, ping]);

  // Reset on region change
  useEffect(() => {
    localStorage.setItem("gfn_live_region", regionCode);
    setMs(null);
    setHistory([]);
    setAlert(null);
    unstableRef.current = false;
    if (running) ping();
  }, [regionCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFullscreen = async () => {
    if (!fullscreen) {
      await containerRef.current?.requestFullscreen?.();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    }
  };
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleAlerts = async () => {
    if (!alertsOn && Notification) {
      const perm = await Notification.requestPermission();
      if (perm === "granted") setAlertsOn(true);
    } else {
      setAlertsOn(false);
    }
  };

  const togglePro = () => {
    const next = !proSync;
    setProSync(next);
    localStorage.setItem(PRO_KEY, next ? "1" : "0");
  };

  const stroke = qLevel.color;
  // sparkline
  const w = 320, h = 90, sparkMax = 200;
  let path = "";
  if (valid.length > 1) {
    const step = w / (valid.length - 1);
    path = valid.map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - (Math.min(v, sparkMax) / sparkMax) * h).toFixed(1)}`).join(" ");
  }

  return (
    <div ref={containerRef} className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <Link to="/history" className="flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
            <HistoryIcon className="h-4 w-4" /> History
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={regionCode}
            onChange={(e) => setRegionCode(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            {GFN_REGIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.name} — {r.location}</option>
            ))}
          </select>
          <button
            onClick={toggleAlerts}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${alertsOn ? "bg-rose-500/20 text-rose-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            title={alertsOn ? "Alerts on" : "Enable alerts"}
          >
            {alertsOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </button>
          <button
            onClick={togglePro}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
            style={proSync ? { background: "rgba(139,92,246,0.2)", color: "#c4b5fd" } : { background: "#1e293b", color: "#94a3b8" }}
            title="Pro cloud sync"
          >
            {proSync ? <Cloud className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setRunning((r) => !r)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${running ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
          >
            {running ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Start</>}
          </button>
          <button
            onClick={toggleFullscreen}
            className="rounded-lg bg-slate-800 p-2 text-slate-300 transition-colors hover:bg-slate-700"
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Instability alert banner */}
      {alert && (
        <div className="mx-5 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2.5 text-sm text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
          <span className="font-medium">{alert.msg}</span>
        </div>
      )}

      {/* Main live display */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-10">
        <div className="flex items-center gap-2 text-slate-400">
          <Wifi className={`h-4 w-4 ${pinging ? "animate-pulse" : ""}`} />
          <span className="text-sm font-medium uppercase tracking-widest">
            {region.name} · {region.location}
          </span>
        </div>

        {/* Routing quality badge */}
        <div className={`mt-4 flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${qLevel.bg} ${qLevel.text}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${qLevel.dot} ${pinging ? "animate-pulse" : ""}`} />
          Routing: {qLevel.label}
        </div>

        {/* Big latency + jitter */}
        <div className="mt-6 flex items-baseline gap-3">
          {ms !== null ? (
            <>
              <span className="font-mono text-[clamp(5rem,18vw,13rem)] font-black leading-none tabular-nums transition-colors duration-300" style={{ color: stroke }}>{ms}</span>
              <span className="text-3xl font-semibold text-slate-500 sm:text-5xl">ms</span>
            </>
          ) : (
            <span className="font-mono text-[clamp(5rem,18vw,13rem)] font-black leading-none text-slate-700">—</span>
          )}
        </div>

        {/* Jitter + Packet loss (the real problems) */}
        <div className="mt-6 grid w-full max-w-xl grid-cols-2 gap-3">
          <BigStat label="Jitter" value={jitter} unit="ms" color={jitter !== null && jitter >= 25 ? "#f43f5e" : "#fb923c"} warn={jitter !== null && jitter >= 25} />
          <BigStat label="Packet Loss" value={loss} unit="%" color={loss !== null && loss >= 2 ? "#f43f5e" : "#fb923c"} warn={loss !== null && loss >= 2} />
        </div>

        {/* Sparkline */}
        <div className="mt-8 w-full max-w-xl">
          {path ? (
            <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-20 w-full">
              <defs>
                <linearGradient id="liveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="url(#liveGrad)" />
              <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <div className="flex h-20 items-center justify-center text-sm text-slate-600">Collecting samples…</div>
          )}
        </div>

        {/* Secondary stats */}
        <div className="mt-6 grid w-full max-w-xl grid-cols-3 gap-3">
          <MiniStat label="Min" value={minMs} unit="ms" />
          <MiniStat label="Avg" value={avgMs} unit="ms" />
          <MiniStat label="Max" value={maxMs} unit="ms" />
        </div>

        {proSync && (
          <p className="mt-6 flex items-center gap-1.5 text-xs text-violet-300/80">
            <Cloud className="h-3.5 w-3.5" /> Pro cloud sync active — stats are uploading to your dashboard.
          </p>
        )}
      </div>
    </div>
  );
}

function BigStat({ label, value, unit, color, warn }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-rose-500/40 bg-rose-500/10" : "border-slate-800 bg-slate-900/50"}`}>
      <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-3xl font-bold tabular-nums" style={{ color: value !== null ? color : "#64748b" }}>
        {value !== null ? value : "—"}<span className="ml-1 text-base font-normal text-slate-500">{value !== null ? unit : ""}</span>
      </p>
    </div>
  );
}

function MiniStat({ label, value, unit }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center">
      <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-200">
        {value !== null ? value : "—"}<span className="ml-0.5 text-xs font-normal text-slate-500">{value !== null ? unit : ""}</span>
      </p>
    </div>
  );
}