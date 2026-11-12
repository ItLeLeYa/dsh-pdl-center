/**
 * PDL 井数据整理加载中台 —— Client 半边（浏览器模块）。
 * 由 tools/build-client.mjs 从 client-src/*.js 拼接；不要直接编辑本文件。
 */
window.__ModuleLoader__.load({
  id: 'dsh-pdl-center',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo, useRef } = React

// ---- 00-base.js ----
// ============================================================================
// PDL 中台 · Client 基础层：API、图标、设计系统、原语组件、数据 hooks
// 该文件由 tools/build-client.mjs 拼接进 client.js（顺序：00 → 10 → 20 → 30 → 99）
// ============================================================================
const API = 'pdl-center/api'

function apiUrl(method) {
  const base = typeof document !== 'undefined' && document.baseURI ? document.baseURI : 'http://dsh.internal/'
  return new URL(`${API}/${method}`, base).toString()
}

async function apiCall(method, payload) {
  const res = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  let body = null
  try { body = await res.json() } catch { /* non JSON */ }
  if (!res.ok || !body || body.ok !== true) {
    const message = body && body.error ? body.error.message : `HTTP ${res.status}`
    const code = body && body.error ? body.error.code : 'http-error'
    const error = new Error(message)
    error.code = code
    throw error
  }
  return body.value
}

const fmtInt = n => (n === null || n === undefined || Number.isNaN(Number(n))) ? '—' : Number(n).toLocaleString('zh-CN')
const fmtBytes = n => {
  if (!n && n !== 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = Number(n), i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
const fmtTime = iso => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmtDuration = (a, b) => {
  if (!a) return '—'
  const end = b ? new Date(b).getTime() : Date.now()
  const sec = Math.max(0, Math.round((end - new Date(a).getTime()) / 1000))
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m ${sec % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// ---------------------------------------------------------------- 图标
const ICONS = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers: 'M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 18l10 5 10-5',
  package: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8',
  book: 'M4 4h6l2 2 2-2h6v16h-6l-2 1-2-1H4V4ZM12 6v15',
  sliders: 'M4 6h16M4 12h16M4 18h16M9 4v4M16 10v4M7 16v4',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v5l4 2',
  play: 'M7 4l13 8-13 8V4Z',
  pause: 'M8 5v14M16 5v14',
  check: 'm4 12 5 5L20 6',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  x: 'M6 6l12 12M18 6 6 18',
  alert: 'm12 3 10 18H2L12 3ZM12 9v5M12 17v.1',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 11v6M12 7v.1',
  folder: 'M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3V7Z',
  file: 'M5 3h9l5 5v13H5V3ZM14 3v6h5M8 13h8M8 17h6',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM16 16l5 5',
  chevronRight: 'm9 5 7 7-7 7',
  chevronDown: 'm6 9 6 6 6-6',
  chevronLeft: 'm15 5-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M3 21v-6h6M21 3v6h-6',
  download: 'M12 3v13M7 11l5 5 5-5M4 21h16',
  upload: 'M12 17V4M7 9l5-5 5 5M4 21h16',
  link: 'M9 15l6-6M8 17l-2 2a4 4 0 0 1-6-6l3-3M16 7l2-2a4 4 0 0 1 6 6l-3 3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v6l4 2',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3ZM8 12l3 3 5-6',
  spark: 'm12 3 2.4 6.2L21 12l-6.6 2.8L12 21l-2.4-6.2L3 12l6.6-2.8L12 3Z',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3ZM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  more: 'M5 12h.1M12 12h.1M19 12h.1',
  external: 'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7',
  copy: 'M9 9h11v11H9V9ZM5 15H4V4h11v1',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  table: 'M3 4h18v16H3V4ZM3 10h18M3 15h18M9 4v16M15 4v16',
  branch: 'M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9c0 4-4 6-8 6',
  broom: 'm3 21 6-6M14 4l6 6M9 9l6-6 6 6-6 6zM5 19l4-4',
  lock: 'M6 11h12v10H6V11ZM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6V11ZM8 11V7a4 4 0 0 1 7.5-2',
  arrowRight: 'M4 12h16M14 6l6 6-6 6',
  arrowUpRight: 'M7 17 17 7M8 7h9v9',
  save: 'M4 4h13l3 3v13H4V4ZM8 4v5h8V4M8 20v-7h8v7',
}

function Icon({ name, size = 16, stroke = 1.7, style, className }) {
  const d = ICONS[name] || ICONS.info
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, className: className || 'pdl-icon', style: { flex: '0 0 auto', display: 'block', ...(style || {}) },
  }, h('path', { d }))
}

// 侧栏入口图标（19×19 线性井层标记）
function SidebarIcon({ size = 20, active = false }) {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    'aria-hidden': true, style: { display: 'block' },
  },
    h('rect', { x: 2.6, y: 2.6, width: 18.8, height: 18.8, rx: 5.4,
      fill: active ? '#5b5bd6' : 'none',
      stroke: 'currentColor', strokeWidth: 1.45, opacity: active ? 1 : 0.9 }),
    h('path', { d: 'M6.2 9.3c1.95-1.25 4-1.9 5.8-1.9s3.85.65 5.8 1.9M6.2 12.95c1.95-1.2 4-1.85 5.8-1.85s3.85.65 5.8 1.85M6.2 16.6c1.95-1.2 4-1.85 5.8-1.85s3.85.65 5.8 1.85',
      stroke: active ? '#ffffff' : 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round' }),
    h('path', { d: 'M12 4.6v14.8', stroke: active ? '#5EEAD4' : 'currentColor', strokeWidth: 1.55, strokeLinecap: 'round' }),
    h('circle', { cx: 12, cy: 12.95, r: 1.45, fill: active ? '#5EEAD4' : 'currentColor' }))
}

// ---------------------------------------------------------------- 设计系统 CSS
const CSS = `
.pdl-app, .pdl-app * { box-sizing: border-box; }
.pdl-app {
  --pdl-primary: #5b5bd6;
  --pdl-primary-strong: #4b4bc4;
  --pdl-primary-soft: color-mix(in srgb, var(--pdl-primary) 14%, transparent);
  --pdl-success: var(--dsw-alias-state-success-primary, #0d9488);
  --pdl-warn: var(--dsw-alias-state-warn-primary, #d97706);
  --pdl-danger: var(--dsw-alias-state-error-primary, #e11d48);
  --pdl-idle: var(--dsw-alias-state-idle-primary, #64748b);
  --pdl-bg: var(--dsw-alias-bg-base, #ffffff);
  --pdl-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --pdl-surface2: var(--dsw-alias-bg-layer-2, #f6f7fb);
  --pdl-border: var(--dsw-alias-border-l1, rgba(15,23,42,.10));
  --pdl-border2: var(--dsw-alias-border-l2, rgba(15,23,42,.18));
  --pdl-text: var(--dsw-alias-label-primary, #0f172a);
  --pdl-muted: var(--dsw-alias-label-secondary, #64748b);
  --pdl-radius: 14px;
  --pdl-radius-sm: 9px;
  --pdl-shadow: 0 1px 2px rgba(15,23,42,.05), 0 8px 24px -18px rgba(15,23,42,.35);
  position: absolute; inset: 0; display: flex; overflow: hidden;
  background: var(--pdl-bg); color: var(--pdl-text);
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 13px; line-height: 1.55; -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums;
}
.pdl-app ::-webkit-scrollbar { width: 9px; height: 9px; }
.pdl-app ::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--pdl-muted) 28%, transparent); border-radius: 99px; border: 2px solid transparent; background-clip: padding-box; }
.pdl-app ::-webkit-scrollbar-track { background: transparent; }

/* ---------- 内侧导航 ---------- */
.pdl-nav { width: 212px; flex: 0 0 212px; display: flex; flex-direction: column; gap: 6px;
  padding: 18px 14px 14px; border-right: 1px solid var(--pdl-border);
  background: color-mix(in srgb, var(--pdl-surface2) 62%, var(--pdl-bg)); }
.pdl-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 16px; }
.pdl-brand-tile { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
  background: linear-gradient(140deg, #4f46e5 0%, #4338ca 58%, #0f766e 100%); color: #fff;
  box-shadow: 0 6px 14px -8px rgba(79,70,229,.9); }
.pdl-brand b { display: block; font-size: 13.5px; letter-spacing: .01em; }
.pdl-brand small { display: block; font-size: 9.5px; letter-spacing: .16em; color: var(--pdl-muted); text-transform: uppercase; }
.pdl-nav-group { padding: 10px 8px 4px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--pdl-muted); }
.pdl-nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 10px;
  color: var(--pdl-text); cursor: pointer; border: 1px solid transparent; background: transparent;
  font-size: 13px; text-align: left; width: 100%; transition: background .14s ease, border-color .14s ease, color .14s ease; }
.pdl-nav-item:hover { background: color-mix(in srgb, var(--pdl-text) 5%, transparent); }
.pdl-nav-item.active { background: var(--pdl-surface); border-color: var(--pdl-border);
  box-shadow: var(--pdl-shadow); color: var(--pdl-primary); font-weight: 600; }
.pdl-nav-item .pdl-nav-count { margin-left: auto; font-size: 10.5px; color: var(--pdl-muted); background: color-mix(in srgb, var(--pdl-text) 6%, transparent);
  border-radius: 99px; padding: 1px 7px; font-weight: 600; }
.pdl-nav-foot { margin-top: auto; border-top: 1px solid var(--pdl-border); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.pdl-engine { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px;
  background: var(--pdl-surface); border: 1px solid var(--pdl-border); font-size: 11.5px; color: var(--pdl-muted); }
.pdl-engine b { color: var(--pdl-text); font-weight: 600; }

/* ---------- 主区 ---------- */
.pdl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--pdl-bg); }
.pdl-topbar { display: flex; align-items: center; gap: 14px; padding: 14px 24px; border-bottom: 1px solid var(--pdl-border);
  background: color-mix(in srgb, var(--pdl-bg) 86%, transparent); backdrop-filter: blur(10px); flex: 0 0 auto; }
.pdl-topbar-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pdl-topbar-title .eyebrow { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--pdl-muted); }
.pdl-topbar-title h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pdl-bindings { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }
.pdl-binding { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px;
  border: 1px solid var(--pdl-border); background: var(--pdl-surface); min-width: 0; }
.pdl-binding small { display: block; font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--pdl-muted); line-height: 1.2; }
.pdl-binding b { display: block; font-size: 12px; font-weight: 600; max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pdl-binding .pdl-icon { color: var(--pdl-muted); }

.pdl-page { flex: 1; min-height: 0; overflow: auto; padding: 20px 24px 28px; display: flex; flex-direction: column; gap: 16px; }

/* ---------- 通用面板 ---------- */
.pdl-card { background: var(--pdl-surface); border: 1px solid var(--pdl-border); border-radius: var(--pdl-radius); box-shadow: var(--pdl-shadow); }
.pdl-card-head { display: flex; align-items: flex-start; gap: 12px; padding: 15px 18px 12px; border-bottom: 1px solid var(--pdl-border); }
.pdl-card-head h2 { margin: 0; font-size: 13.5px; font-weight: 650; letter-spacing: .005em; }
.pdl-card-head p { margin: 3px 0 0; font-size: 11.5px; color: var(--pdl-muted); }
.pdl-card-head .pdl-head-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.pdl-card-body { padding: 16px 18px; }
.pdl-card-body.flush { padding: 0; }

/* ---------- 控件 ---------- */
.pdl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 32px; padding: 0 12px;
  border-radius: var(--pdl-radius-sm); border: 1px solid var(--pdl-border2); background: var(--pdl-surface);
  color: var(--pdl-text); font-size: 12.5px; font-weight: 550; cursor: pointer; white-space: nowrap;
  transition: background .14s ease, border-color .14s ease, transform .08s ease, box-shadow .14s ease; }
.pdl-btn:hover { background: color-mix(in srgb, var(--pdl-text) 5%, var(--pdl-surface)); }
.pdl-btn:active { transform: translateY(1px); }
.pdl-btn[disabled] { opacity: .45; cursor: not-allowed; transform: none; }
.pdl-btn.primary { background: var(--pdl-primary); border-color: transparent; color: #fff; box-shadow: 0 6px 16px -10px var(--pdl-primary); }
.pdl-btn.primary:hover { background: var(--pdl-primary-strong); }
.pdl-btn.success { background: var(--pdl-success); border-color: transparent; color: #fff; }
.pdl-btn.danger { color: var(--pdl-danger); border-color: color-mix(in srgb, var(--pdl-danger) 40%, transparent); background: transparent; }
.pdl-btn.ghost { border-color: transparent; background: transparent; }
.pdl-btn.ghost:hover { background: color-mix(in srgb, var(--pdl-text) 6%, transparent); }
.pdl-btn.lg { height: 38px; padding: 0 18px; font-size: 13px; border-radius: 10px; }
.pdl-btn.sm { height: 26px; padding: 0 9px; font-size: 11.5px; border-radius: 7px; }
.pdl-btn.block { width: 100%; }

.pdl-input, .pdl-select, .pdl-textarea { width: 100%; height: 34px; padding: 0 11px; border-radius: var(--pdl-radius-sm);
  border: 1px solid var(--pdl-border2); background: var(--pdl-bg); color: var(--pdl-text); font-size: 12.5px;
  font-family: inherit; outline: none; transition: border-color .14s ease, box-shadow .14s ease; }
.pdl-textarea { height: auto; min-height: 74px; padding: 9px 11px; resize: vertical; line-height: 1.6; }
.pdl-input:focus, .pdl-select:focus, .pdl-textarea:focus { border-color: var(--pdl-primary); box-shadow: 0 0 0 3px var(--pdl-primary-soft); }
.pdl-input::placeholder { color: color-mix(in srgb, var(--pdl-muted) 72%, transparent); }
.pdl-field { display: flex; flex-direction: column; gap: 6px; }
.pdl-field > label { font-size: 11.5px; font-weight: 600; color: var(--pdl-text); }
.pdl-field > .hint { font-size: 11px; color: var(--pdl-muted); }
.pdl-row { display: flex; gap: 10px; align-items: center; }
.pdl-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pdl-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
.pdl-grid2 > *, .pdl-grid3 > * { min-width: 0; }

.pdl-badge { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 999px;
  font-size: 10.5px; font-weight: 600; letter-spacing: .01em; border: 1px solid transparent; white-space: nowrap; }
.pdl-badge .pdl-icon { width: 11px; height: 11px; }
.pdl-badge.neutral { background: color-mix(in srgb, var(--pdl-text) 7%, transparent); color: var(--pdl-muted); }
.pdl-badge.primary { background: var(--pdl-primary-soft); color: var(--pdl-primary); }
.pdl-badge.success { background: color-mix(in srgb, var(--pdl-success) 14%, transparent); color: var(--pdl-success); }
.pdl-badge.warn { background: color-mix(in srgb, var(--pdl-warn) 15%, transparent); color: var(--pdl-warn); }
.pdl-badge.danger { background: color-mix(in srgb, var(--pdl-danger) 14%, transparent); color: var(--pdl-danger); }
.pdl-badge.outline { border-color: var(--pdl-border2); color: var(--pdl-muted); background: transparent; }

/* ---------- KPI ---------- */
.pdl-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(138px, 1fr)); gap: 10px; }
.pdl-kpi { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--pdl-border); background: var(--pdl-surface); display: flex; gap: 11px; align-items: flex-start; }
.pdl-kpi .pdl-kpi-icon { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto;
  background: var(--pdl-primary-soft); color: var(--pdl-primary); }
.pdl-kpi.success .pdl-kpi-icon { background: color-mix(in srgb, var(--pdl-success) 14%, transparent); color: var(--pdl-success); }
.pdl-kpi.warn .pdl-kpi-icon { background: color-mix(in srgb, var(--pdl-warn) 15%, transparent); color: var(--pdl-warn); }
.pdl-kpi.danger .pdl-kpi-icon { background: color-mix(in srgb, var(--pdl-danger) 14%, transparent); color: var(--pdl-danger); }
.pdl-kpi small { display: block; font-size: 10.5px; letter-spacing: .04em; color: var(--pdl-muted); }
.pdl-kpi strong { display: block; font-size: 21px; font-weight: 650; letter-spacing: -.02em; line-height: 1.25; margin-top: 2px; }
.pdl-kpi strong em { font-style: normal; font-size: 11px; font-weight: 500; color: var(--pdl-muted); margin-left: 3px; }

/* ---------- 表格 ---------- */
.pdl-table-wrap { overflow: auto; border-radius: 0 0 var(--pdl-radius) var(--pdl-radius); }
.pdl-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
.pdl-table th { position: sticky; top: 0; z-index: 2; text-align: left; font-weight: 600; font-size: 10.5px;
  letter-spacing: .05em; text-transform: uppercase; color: var(--pdl-muted); background: var(--pdl-surface2);
  padding: 8px 12px; border-bottom: 1px solid var(--pdl-border); white-space: nowrap; }
.pdl-table td { padding: 8px 12px; border-bottom: 1px solid color-mix(in srgb, var(--pdl-border) 70%, transparent); vertical-align: top; overflow-wrap: anywhere; max-width: 520px; }
.pdl-table tr:last-child td { border-bottom: none; }
.pdl-table tbody tr:hover td { background: color-mix(in srgb, var(--pdl-text) 3.2%, transparent); }
.pdl-table td.num, .pdl-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.pdl-table td.mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace; font-size: 11px; }
.pdl-table .truncate { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pdl-empty { padding: 36px 20px; text-align: center; color: var(--pdl-muted); font-size: 12.5px; }
.pdl-empty .pdl-icon { margin: 0 auto 10px; opacity: .55; }

/* ---------- Tabs ---------- */
.pdl-tabs { display: flex; gap: 2px; padding: 0 14px; border-bottom: 1px solid var(--pdl-border); overflow-x: auto; }
.pdl-tab { height: 36px; padding: 0 11px; border: none; background: transparent; color: var(--pdl-muted);
  font-size: 12.5px; font-weight: 550; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; font-family: inherit; }
.pdl-tab:hover { color: var(--pdl-text); }
.pdl-tab.active { color: var(--pdl-primary); border-bottom-color: var(--pdl-primary); }
.pdl-tab .count { margin-left: 6px; font-size: 10.5px; opacity: .8; }

/* ---------- 状态 ---------- */
.pdl-dot { width: 7px; height: 7px; border-radius: 99px; display: inline-block; flex: 0 0 auto; background: var(--pdl-idle); }
.pdl-dot.success { background: var(--pdl-success); }
.pdl-dot.warn { background: var(--pdl-warn); }
.pdl-dot.danger { background: var(--pdl-danger); }
.pdl-dot.primary { background: var(--pdl-primary); }
.pdl-dot.running { background: var(--pdl-primary); animation: pdl-pulse 1.4s ease-in-out infinite; }
@keyframes pdl-pulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--pdl-primary) 45%, transparent); } 50% { box-shadow: 0 0 0 5px transparent; } }
@keyframes pdl-spin { to { transform: rotate(360deg); } }
@keyframes pdl-fade-up { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.pdl-spin { animation: pdl-spin .9s linear infinite; }
.pdl-fade { animation: pdl-fade-up .18s ease-out both; }
.pdl-progress { height: 6px; border-radius: 99px; background: color-mix(in srgb, var(--pdl-text) 8%, transparent); overflow: hidden; }
.pdl-progress > i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--pdl-primary), color-mix(in srgb, var(--pdl-primary) 55%, var(--pdl-success))); transition: width .4s ease; }

/* ---------- 阶段轨道 ---------- */
.pdl-track { display: flex; align-items: center; gap: 0; padding: 14px 18px; border-radius: var(--pdl-radius);
  border: 1px solid var(--pdl-border); background: var(--pdl-surface); box-shadow: var(--pdl-shadow); flex: 0 0 auto; }
.pdl-track-node { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
.pdl-track-marker { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; flex: 0 0 auto;
  border: 1px solid var(--pdl-border2); color: var(--pdl-muted); background: var(--pdl-surface2); font-weight: 650; font-size: 12px; }
.pdl-track-node.done .pdl-track-marker { background: color-mix(in srgb, var(--pdl-success) 14%, transparent); border-color: transparent; color: var(--pdl-success); }
.pdl-track-node.active .pdl-track-marker { background: var(--pdl-primary); border-color: transparent; color: #fff; box-shadow: 0 0 0 4px var(--pdl-primary-soft); }
.pdl-track-node b { display: block; font-size: 12.5px; font-weight: 600; }
.pdl-track-node small { display: block; font-size: 10.5px; color: var(--pdl-muted); }
.pdl-track-line { flex: 1; height: 2px; margin: 0 14px; border-radius: 99px; background: var(--pdl-border); position: relative; overflow: hidden; }
.pdl-track-line.done { background: color-mix(in srgb, var(--pdl-success) 55%, transparent); }
.pdl-track-line.active::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--pdl-primary), transparent); animation: pdl-flow 1.6s linear infinite; }
@keyframes pdl-flow { from { transform: translateX(-100%); } to { transform: translateX(100%); } }

/* ---------- 步骤条 ---------- */
.pdl-steps { display: flex; gap: 6px; padding: 4px; border-radius: 12px; background: var(--pdl-surface2); border: 1px solid var(--pdl-border); overflow-x: auto; flex: 0 0 auto; }
.pdl-step { flex: 1 0 auto; min-width: 112px; display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 9px;
  border: 1px solid transparent; background: transparent; cursor: pointer; font-family: inherit; text-align: left; color: var(--pdl-muted); }
.pdl-step:hover { background: color-mix(in srgb, var(--pdl-surface) 70%, transparent); }
.pdl-step.active { background: var(--pdl-surface); border-color: var(--pdl-border); box-shadow: var(--pdl-shadow); color: var(--pdl-text); }
.pdl-step.done { color: var(--pdl-text); }
.pdl-step-num { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 10.5px; font-weight: 700;
  background: color-mix(in srgb, var(--pdl-text) 8%, transparent); color: var(--pdl-muted); flex: 0 0 auto; }
.pdl-step.active .pdl-step-num { background: var(--pdl-primary); color: #fff; }
.pdl-step.done .pdl-step-num { background: color-mix(in srgb, var(--pdl-success) 16%, transparent); color: var(--pdl-success); }
.pdl-step span { font-size: 11.5px; font-weight: 550; white-space: nowrap; }

/* ---------- 工作区 ---------- */
.pdl-work { display: grid; grid-template-columns: minmax(0,1fr) 332px; gap: 14px; flex: 1; min-height: 0; }
.pdl-work.solo { grid-template-columns: minmax(0,1fr); }
.pdl-work-main { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.pdl-inspector { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.pdl-inspector-section { padding: 13px 15px; border-bottom: 1px solid var(--pdl-border); }
.pdl-inspector-section:last-child { border-bottom: none; }
.pdl-inspector-section h3 { margin: 0 0 9px; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--pdl-muted); font-weight: 650; }
.pdl-kv { display: flex; flex-direction: column; gap: 7px; }
.pdl-kv-row { display: flex; gap: 10px; align-items: baseline; font-size: 11.8px; min-width: 0; }
.pdl-kv-row > span:first-child { color: var(--pdl-muted); flex: 0 0 auto; }
.pdl-kv-row > span:last-child { margin-left: auto; text-align: right; font-weight: 550; word-break: break-all; min-width: 0; }

/* ---------- 底部操作条 ---------- */
.pdl-footer { flex: 0 0 auto; display: flex; align-items: center; gap: 14px; padding: 12px 24px;
  border-top: 1px solid var(--pdl-border); background: color-mix(in srgb, var(--pdl-surface) 92%, transparent); backdrop-filter: blur(12px); }
.pdl-footer .pdl-footer-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pdl-footer .pdl-footer-info b { font-size: 12px; font-weight: 600; }
.pdl-footer .pdl-footer-info small { font-size: 11px; color: var(--pdl-muted); }
.pdl-footer .pdl-footer-actions { margin-left: auto; display: flex; align-items: center; gap: 9px; }

/* ---------- 弹层 ---------- */
.pdl-modal-mask { position: fixed; inset: 0; background: rgba(15,23,42,.46); backdrop-filter: blur(2px); z-index: 90; display: grid; place-items: center; animation: pdl-fade-up .14s ease-out; }
.pdl-modal { width: min(680px, calc(100vw - 80px)); max-height: calc(100vh - 120px); display: flex; flex-direction: column;
  background: var(--pdl-surface); border: 1px solid var(--pdl-border); border-radius: 16px; box-shadow: 0 30px 70px -30px rgba(2,6,23,.55); overflow: hidden; }
.pdl-modal-head { display: flex; align-items: center; gap: 10px; padding: 15px 18px; border-bottom: 1px solid var(--pdl-border); }
.pdl-modal-head h3 { margin: 0; font-size: 14px; font-weight: 650; }
.pdl-modal-body { padding: 18px; overflow: auto; }
.pdl-modal-foot { padding: 13px 18px; border-top: 1px solid var(--pdl-border); display: flex; justify-content: flex-end; gap: 9px; background: var(--pdl-surface2); }

/* ---------- toast ---------- */
.pdl-toasts { position: fixed; right: 22px; bottom: 22px; display: flex; flex-direction: column; gap: 8px; z-index: 120; }
.pdl-toast { min-width: 240px; max-width: 420px; display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px;
  border-radius: 11px; border: 1px solid var(--pdl-border); background: var(--pdl-surface); box-shadow: 0 16px 40px -20px rgba(2,6,23,.5);
  animation: pdl-fade-up .18s ease-out; font-size: 12.5px; }
.pdl-toast .pdl-icon { margin-top: 1px; }
.pdl-toast.success .pdl-icon { color: var(--pdl-success); }
.pdl-toast.warn .pdl-icon { color: var(--pdl-warn); }
.pdl-toast.error .pdl-icon { color: var(--pdl-danger); }

/* ---------- 空状态 ---------- */
.pdl-hero-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 56px 20px; text-align: center; }
.pdl-hero-empty h3 { margin: 4px 0 0; font-size: 17px; font-weight: 650; }
.pdl-hero-empty p { margin: 0; color: var(--pdl-muted); font-size: 12.5px; max-width: 420px; line-height: 1.7; }
.pdl-hero-tile { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center;
  background: linear-gradient(145deg, var(--pdl-primary-soft), transparent); color: var(--pdl-primary); border: 1px solid var(--pdl-border); }

/* ---------- 运行面板 ---------- */
.pdl-run { display: flex; flex-direction: column; gap: 12px; }
.pdl-run-head { display: flex; align-items: center; gap: 10px; }
.pdl-run-log { max-height: 220px; overflow: auto; border-radius: 10px; border: 1px solid var(--pdl-border);
  background: color-mix(in srgb, var(--pdl-text) 4%, transparent); padding: 10px 12px;
  font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; line-height: 1.75; white-space: pre-wrap; word-break: break-all; }
.pdl-run-log .warn { color: var(--pdl-warn); }
.pdl-run-log .error { color: var(--pdl-danger); }
.pdl-run-log .success { color: var(--pdl-success); }

/* ---------- 分类卡 ---------- */
.pdl-cat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 10px; }
.pdl-cat { border: 1px solid var(--pdl-border); border-radius: 12px; padding: 12px 13px; background: var(--pdl-surface); }
.pdl-cat header { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--pdl-muted); }
.pdl-cat strong { display: block; font-size: 19px; font-weight: 650; margin-top: 6px; }
.pdl-cat .bar { height: 4px; border-radius: 99px; background: color-mix(in srgb, var(--pdl-text) 8%, transparent); margin-top: 8px; overflow: hidden; }
.pdl-cat .bar > i { display: block; height: 100%; background: var(--pdl-primary); border-radius: 99px; }

/* ---------- 时间线 ---------- */
.pdl-timeline { display: flex; flex-direction: column; }
.pdl-tl-item { display: grid; grid-template-columns: 24px 1fr; gap: 10px; position: relative; padding-bottom: 14px; }
.pdl-tl-item:last-child { padding-bottom: 0; }
.pdl-tl-item::before { content: ''; position: absolute; left: 11px; top: 22px; bottom: 0; width: 1px; background: var(--pdl-border); }
.pdl-tl-item:last-child::before { display: none; }
.pdl-tl-dot { width: 22px; height: 22px; border-radius: 8px; display: grid; place-items: center; background: var(--pdl-surface2); border: 1px solid var(--pdl-border); color: var(--pdl-muted); z-index: 1; }
.pdl-tl-item.done .pdl-tl-dot { background: color-mix(in srgb, var(--pdl-success) 14%, transparent); color: var(--pdl-success); border-color: transparent; }
.pdl-tl-item.running .pdl-tl-dot { background: var(--pdl-primary-soft); color: var(--pdl-primary); border-color: transparent; }
.pdl-tl-body b { display: block; font-size: 12px; font-weight: 600; }
.pdl-tl-body small { display: block; font-size: 10.5px; color: var(--pdl-muted); }

/* ---------- 右侧会话面板 ---------- */
.pdl-side { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--pdl-bg); color: var(--pdl-text);
  font-family: "Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif; font-size: 12.5px; }
.pdl-side-head { padding: 14px 16px 12px; border-bottom: 1px solid var(--pdl-border); }
.pdl-side-head .eyebrow { font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--pdl-muted); }
.pdl-side-head h2 { margin: 4px 0 0; font-size: 15px; font-weight: 650; }
.pdl-side-body { flex: 1; overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.pdl-side-foot { padding: 12px 16px; border-top: 1px solid var(--pdl-border); display: flex; gap: 8px; }

/* ---------- 响应式 ---------- */
@media (max-width: 1180px) {
  .pdl-work { grid-template-columns: minmax(0,1fr); }
  .pdl-inspector { display: none; }
  .pdl-nav { width: 68px; flex-basis: 68px; padding: 16px 10px; }
  .pdl-brand b, .pdl-brand small, .pdl-nav-item span, .pdl-nav-group, .pdl-engine span, .pdl-nav-count { display: none; }
  .pdl-nav-item { justify-content: center; padding: 10px; }
}
@media (max-width: 860px) {
  .pdl-grid2, .pdl-grid3 { grid-template-columns: 1fr; }
  .pdl-bindings { display: none; }
}
`

function Styles() { return h('style', { 'data-pdl-center': 'design-system' }, CSS) }

// ---------------------------------------------------------------- 原语
function Button({ variant, size, icon, iconRight, children, onClick, disabled, loading, title, block, type }) {
  const cls = ['pdl-btn', variant || '', size || '', block ? 'block' : ''].filter(Boolean).join(' ')
  return h('button', {
    type: type || 'button', className: cls, onClick, disabled: disabled || loading, title,
    'aria-label': title || (typeof children === 'string' ? children : undefined),
    'aria-busy': loading ? 'true' : undefined,
  }, loading ? h(Icon, { name: 'refresh', size: 14, className: 'pdl-spin' }) : (icon ? h(Icon, { name: icon, size: size === 'sm' ? 12 : 14 }) : null),
    children ? h('span', {}, children) : null,
    iconRight ? h(Icon, { name: iconRight, size: size === 'sm' ? 12 : 14 }) : null)
}

function Badge({ tone = 'neutral', icon, children }) {
  return h('span', { className: 'pdl-badge ' + tone }, icon ? h(Icon, { name: icon, size: 11 }) : null, children)
}

function Card({ title, subtitle, actions, children, className, flush, style }) {
  return h('section', { className: ['pdl-card', className || ''].filter(Boolean).join(' '), style },
    (title || actions) ? h('header', { className: 'pdl-card-head' },
      h('div', { style: { minWidth: 0 } }, title ? h('h2', {}, title) : null, subtitle ? h('p', {}, subtitle) : null),
      actions ? h('div', { className: 'pdl-head-actions' }, actions) : null) : null,
    h('div', { className: 'pdl-card-body' + (flush ? ' flush' : '') }, children))
}

function Field({ label, hint, children, style }) {
  return h('div', { className: 'pdl-field', style }, label ? h('label', {}, label) : null, children, hint ? h('div', { className: 'hint' }, hint) : null)
}

function TextInput({ value, onChange, placeholder, mono, ...rest }) {
  return h('input', { className: 'pdl-input', value: value ?? '', placeholder, onChange: e => onChange && onChange(e.target.value), style: mono ? { fontFamily: 'ui-monospace, monospace', fontSize: 11.5 } : undefined, ...rest })
}

function Select({ value, onChange, options, placeholder }) {
  return h('select', { className: 'pdl-select', value: value ?? '', onChange: e => onChange && onChange(e.target.value) },
    placeholder ? h('option', { value: '' }, placeholder) : null,
    (options || []).map(o => h('option', { key: o.value, value: o.value }, o.label)))
}

function Textarea({ value, onChange, placeholder, rows }) {
  return h('textarea', { className: 'pdl-textarea', value: value ?? '', rows: rows || 4, placeholder, onChange: e => onChange && onChange(e.target.value) })
}

function Tabs({ items, value, onChange }) {
  return h('div', { className: 'pdl-tabs', role: 'tablist' },
    items.map(it => h('button', {
      key: it.id, role: 'tab', 'aria-selected': value === it.id,
      className: 'pdl-tab' + (value === it.id ? ' active' : ''), onClick: () => onChange(it.id),
    }, it.label, it.count !== undefined ? h('span', { className: 'count' }, fmtInt(it.count)) : null)))
}

function Kpi({ label, value, unit, icon, tone, hint }) {
  return h('div', { className: 'pdl-kpi ' + (tone || '') },
    icon ? h('div', { className: 'pdl-kpi-icon' }, h(Icon, { name: icon, size: 15 })) : null,
    h('div', { style: { minWidth: 0 } },
      h('small', {}, label),
      h('strong', {}, value, unit ? h('em', {}, unit) : null),
      hint ? h('div', { style: { fontSize: 10.5, color: 'var(--pdl-muted)', marginTop: 2 } }, hint) : null))
}

function Empty({ icon = 'inbox', title, desc, action }) {
  return h('div', { className: 'pdl-empty' },
    h(Icon, { name: icon === 'inbox' ? 'folder' : icon, size: 26 }),
    title ? h('div', { style: { fontWeight: 600, color: 'var(--pdl-text)', marginBottom: 3 } }, title) : null,
    desc ? h('div', {}, desc) : null,
    action ? h('div', { style: { marginTop: 12 } }, action) : null)
}

function Table({ columns, rows, rowKey, empty, maxHeight, onRowClick }) {
  const cols = columns || []
  if (!rows || rows.length === 0) return empty !== undefined ? empty : h('div', { className: 'pdl-empty' }, '暂无数据')
  return h('div', { className: 'pdl-table-wrap', style: maxHeight ? { maxHeight } : undefined },
    h('table', { className: 'pdl-table' },
      h('thead', {}, h('tr', {}, cols.map(c => h('th', { key: c.key, className: c.align === 'right' ? 'num' : '', style: c.width ? { width: c.width } : undefined }, c.label)))),
      h('tbody', {}, rows.map((row, i) => h('tr', {
        key: rowKey ? rowKey(row, i) : i,
        onClick: onRowClick ? () => onRowClick(row, i) : undefined,
        style: onRowClick ? { cursor: 'pointer' } : undefined,
      },
        cols.map(c => {
          const v = c.render ? c.render(row, i) : row[c.key]
          return h('td', { key: c.key, className: [c.align === 'right' ? 'num' : '', c.mono ? 'mono' : '', c.truncate ? 'truncate' : ''].filter(Boolean).join(' '), title: typeof v === 'string' ? v : undefined },
            v === undefined || v === null || v === '' ? h('span', { style: { opacity: .35 } }, '—') : v)
        }))))))
}

function Progress({ value }) {
  return h('div', { className: 'pdl-progress' }, h('i', { style: { width: `${clamp(Number(value) || 0, 0, 100)}%` } }))
}

function StatusDot({ status }) {
  const map = { running: 'running', queued: 'primary', done: 'success', ok: 'success', failed: 'danger', blocked: 'danger', partial: 'warn', interrupted: 'warn', cancelling: 'warn', idle: '' }
  return h('span', { className: 'pdl-dot ' + (map[status] || '') })
}

// ---------------------------------------------------------------- Toast
const toastBus = { listeners: new Set(), seq: 0 }
function toast(text, tone = 'success') {
  const item = { id: ++toastBus.seq, text, tone }
  toastBus.listeners.forEach(fn => fn(item))
}
function ToastHost() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const fn = item => {
      setItems(prev => [...prev, item])
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== item.id)), 4200)
    }
    toastBus.listeners.add(fn)
    return () => { toastBus.listeners.delete(fn) }
  }, [])
  return h('div', { className: 'pdl-toasts' }, items.map(it => h('div', { key: it.id, className: 'pdl-toast ' + it.tone },
    h(Icon, { name: it.tone === 'error' ? 'alert' : it.tone === 'warn' ? 'alert' : 'checkCircle', size: 15 }),
    h('div', {}, it.text))))
}

// ---------------------------------------------------------------- Modal
function Modal({ open, title, children, onClose, footer, width }) {
  useEffect(() => {
    if (!open) return
    const fn = e => { if (e.key === 'Escape') onClose && onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open, onClose])
  if (!open) return null
  return h('div', { className: 'pdl-modal-mask', onMouseDown: e => { if (e.target === e.currentTarget) onClose && onClose() } },
    h('div', { className: 'pdl-modal', style: width ? { width } : undefined, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { className: 'pdl-modal-head' }, h('h3', {}, title), h('div', { style: { marginLeft: 'auto' } }, h(Button, { variant: 'ghost', size: 'sm', icon: 'x', onClick: onClose }))),
      h('div', { className: 'pdl-modal-body' }, children),
      footer ? h('footer', { className: 'pdl-modal-foot' }, footer) : null))
}

// ---------------------------------------------------------------- 数据 hooks
function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const reload = useCallback(() => {
    let alive = true
    setState(s => ({ ...s, loading: true, error: null }))
    Promise.resolve().then(fn).then(data => { if (alive) setState({ loading: false, data, error: null }) })
      .catch(err => { if (alive) setState({ loading: false, data: null, error: err.message || String(err) }) })
    return () => { alive = false }
  }, deps || [])
  useEffect(reload, [reload])
  return { ...state, reload, setData: d => setState({ loading: false, data: d, error: null }) }
}

function usePolling(fn, ms, active, onValue, deps) {
  const ref = useRef(onValue)
  ref.current = onValue
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    if (!active) return
    let alive = true
    let timer = null
    const tick = async () => {
      try { const v = await fnRef.current(); if (alive && ref.current) ref.current(v) } catch { /* ignore */ }
      if (alive) timer = setTimeout(tick, ms)
    }
    tick()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [active, ms, ...(deps || [])])
}

// ---- 10-workbench.js ----
// ============================================================================
// PDL 中台 · 批次工作台（首页 + 六步向导 + 检查器）
// ============================================================================

const STEPS = [
  { n: 1, key: 'batch', title: '建批与路径', short: '建批', stage: null },
  { n: 2, key: 'precheck', title: '规则与参考库预检', short: '预检', stage: null },
  { n: 3, key: 'scan', title: '扫描归井', short: '扫描', stage: 'scan' },
  { n: 4, key: 'merge', title: '汇总核对', short: '汇总', stage: 'merge' },
  { n: 5, key: 'preflight', title: '转码预检', short: '预检', stage: 'export' },
  { n: 6, key: 'deliver', title: '导出交付', short: '交付', stage: 'export' },
]

const STAGES = [
  { key: 'scan', label: '扫描归井', sub: 'pdl-scan', icon: 'search' },
  { key: 'merge', label: '汇总核对', sub: 'pdl-merge', icon: 'table' },
  { key: 'export', label: '导出交付', sub: 'pdl-export', icon: 'package' },
]

function runTone(run) {
  if (!run) return 'neutral'
  if (run.status === 'running' || run.status === 'queued' || run.status === 'cancelling') return 'primary'
  if (run.outcome === 'ok') return 'success'
  if (run.outcome === 'partial') return 'warn'
  if (run.outcome === 'blocked' || run.outcome === 'failed') return 'danger'
  if (run.status === 'interrupted') return 'warn'
  return 'neutral'
}
function runLabel(run) {
  if (!run) return '未运行'
  if (run.status === 'running') return '执行中'
  if (run.status === 'queued') return '排队中'
  if (run.status === 'cancelling') return '取消中'
  if (run.status === 'interrupted') return '中断待检查'
  const map = { ok: '完成', partial: '部分完成', blocked: '阻断', failed: '失败', cancelled: '已取消' }
  return map[run.outcome] || '已结束'
}

// ---------------------------------------------------------------- 首页
function HomeBoard({ boot, onOpenBatch, onNew, onRefresh }) {
  const batches = [...(boot.batches || [])].filter(b => !boot.activeProjectId || b.projectId === boot.activeProjectId).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  const last = batches[0] || null
  const lastRun = last ? [...(boot.runs || [])].reverse().find(r => r.batchId === last.id) : null
  const pending = boot.counters?.pending || 0
  return h('div', { className: 'pdl-page pdl-fade' },
    h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' } },
      h('div', { style: { minWidth: 0 } },
        h('div', { style: { fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--pdl-muted)' } }, 'PROJECT DATA LOAD ／ GEOEAST'),
        h('h1', { style: { margin: '4px 0 0', fontSize: 24, fontWeight: 680, letterSpacing: '-.02em' } }, '井数据整理加载中台'),
        h('p', { style: { margin: '6px 0 0', color: 'var(--pdl-muted)', fontSize: 12.5 } }, '从资料包到 GeoEast 待导入文件，扫描 · 汇总 · 导出三段闭合，全程可追溯。')),
      h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } },
        h(Button, { icon: 'refresh', onClick: onRefresh }, '刷新'),
        h(Button, { variant: 'primary', icon: 'plus', onClick: onNew }, '新建批次'))),
    h('div', { className: 'pdl-kpis', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' } },
      h(Kpi, { label: '工程', value: boot.projects.length, unit: '个', icon: 'grid', hint: boot.projects.find(p => p.id === boot.activeProjectId)?.name }),
      h(Kpi, { label: '资料包', value: boot.counters?.packages || 0, unit: '个', icon: 'package' }),
      h(Kpi, { label: '批次', value: boot.counters?.batches || 0, unit: '个', icon: 'layers' }),
      h(Kpi, { label: '运行中', value: boot.counters?.running || 0, unit: '个', icon: 'play', tone: boot.counters?.running ? 'warn' : '' }),
      h(Kpi, { label: '待确认问题', value: pending, unit: '条', icon: 'alert', tone: pending ? 'warn' : 'success' })),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 14 } },
      h(Card, {
        title: '继续上次处理', subtitle: last ? `${last.name} · 步骤 ${last.step}/6` : '还没有批次',
        actions: last ? h(Button, { size: 'sm', variant: 'ghost', iconRight: 'arrowRight', onClick: () => onOpenBatch(last.id) }, '打开') : null,
      }, last ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h(StatusDot, { status: lastRun?.status === 'running' ? 'running' : (lastRun?.outcome || 'idle') }),
          h('b', { style: { fontSize: 15 } }, last.name),
          h(Badge, { tone: runTone(lastRun) }, runLabel(lastRun))),
        h('div', { className: 'pdl-kv' },
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '批次 ID'), h('span', { className: 'pdl-mono' }, last.id)),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '当前步骤'), h('span', {}, `${STEPS[Math.max(0, Math.min(5, (last.step || 1) - 1))].title}`)),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '最近更新'), h('span', {}, fmtTime(last.updatedAt)))),
        h(MiniSteps, { step: last.step || 1 })) :
        h(Empty, { icon: 'layers', title: '从一个资料包开始', desc: '新建批次，选择资料包与输出目录，进入六步向导。', action: h(Button, { variant: 'primary', icon: 'plus', onClick: onNew }, '新建批次') })),
      h(Card, { title: '待核对问题', subtitle: pending ? '来自最近运行的发现' : '暂无阻断项' },
        pending ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          (boot.pendingProblems || []).slice(0, 4).map((p, i) => h('div', { key: i, style: { display: 'flex', gap: 9, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid var(--pdl-border)', borderRadius: 9 } },
            h(Icon, { name: 'alert', size: 14, style: { color: 'var(--pdl-danger)', marginTop: 1 } }),
            h('div', { style: { minWidth: 0 } },
              h('div', { style: { fontSize: 12, fontWeight: 550 } }, p.message || p.code),
              h('div', { style: { fontSize: 10.5, color: 'var(--pdl-muted)' } }, `${p.code || ''} · ${p.wellId || '全批次'}`))))) :
          h(Empty, { icon: 'checkCircle', title: '没有阻断项', desc: '运行扫描或汇总后，问题会汇总到这里。' }))),
    h(Card, { title: '最近批次', subtitle: `${batches.length} 个批次`, flush: true },
      h(Table, {
        columns: [
          { key: 'name', label: '批次', render: r => h('div', {}, h('div', { style: { fontWeight: 600 } }, r.name), h('div', { className: 'pdl-mono', style: { fontSize: 10.5, color: 'var(--pdl-muted)' } }, r.id)) },
          { key: 'step', label: '进度', width: 90, render: r => h(Badge, { tone: r.step >= 6 ? 'success' : 'primary' }, `步骤 ${r.step}/6`) },
          { key: 'updatedAt', label: '更新时间', width: 150, render: r => fmtTime(r.updatedAt) },
          { key: 'act', label: '', width: 70, render: r => h(Button, { size: 'sm', variant: 'ghost', iconRight: 'chevronRight', onClick: () => onOpenBatch(r.id) }, '打开') },
        ],
        rows: batches.slice(0, 8),
        empty: h(Empty, { icon: 'layers', title: '暂无批次' }),
      })))
}

// ---------------------------------------------------------------- 步骤条 / 轨道
function StepBar({ step, onJump, compact }) {
  return h('div', { className: 'pdl-steps', style: compact ? { background: 'transparent', border: 'none', padding: 0 } : undefined },
    STEPS.map(s => h('button', {
      key: s.n, className: 'pdl-step' + (s.n === step ? ' active' : s.n < step ? ' done' : ''), onClick: () => onJump && onJump(s.n),
    }, h('span', { className: 'pdl-step-num' }, s.n < step ? h(Icon, { name: 'check', size: 11 }) : s.n), h('span', {}, s.title))))
}

function MiniSteps({ step }) {
  return h('div', { style: { display: 'flex', gap: 5, flexWrap: 'wrap' } },
    STEPS.map(s => h('span', {
      key: s.n,
      style: {
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999,
        fontSize: 10.5, fontWeight: 550, border: '1px solid var(--pdl-border)',
        color: s.n < step ? 'var(--pdl-success)' : s.n === step ? 'var(--pdl-primary)' : 'var(--pdl-muted)',
        background: s.n === step ? 'var(--pdl-primary-soft)' : s.n < step ? 'color-mix(in srgb, var(--pdl-success) 10%, transparent)' : 'transparent',
      },
    }, s.n < step ? h(Icon, { name: 'check', size: 10 }) : h('span', {}, s.n), s.short)))
}

function StageTrack({ stageState }) {
  return h('div', { className: 'pdl-track' },
    STAGES.map((s, i) => {
      const st = stageState(s.key)
      return h(React.Fragment, { key: s.key },
        h('div', { className: 'pdl-track-node ' + st },
          h('div', { className: 'pdl-track-marker' }, st === 'done' ? h(Icon, { name: 'check', size: 14 }) : h(Icon, { name: s.icon, size: 14 })),
          h('div', {}, h('b', {}, s.label), h('small', {}, s.sub))),
        i < STAGES.length - 1 ? h('div', { className: 'pdl-track-line ' + (stageState(STAGES[i + 1].key) !== 'idle' ? 'done' : stageState(s.key) === 'active' ? 'active' : '') }) : null)
    }))
}

function BindingBar({ project, pkg, batch, onOpenNav }) {
  return h('div', { className: 'pdl-bindings' },
    h('div', { className: 'pdl-binding' }, h(Icon, { name: 'grid', size: 14 }),
      h('div', { style: { minWidth: 0 } }, h('small', {}, '工程'), h('b', {}, project?.name || '—'))),
    h('div', { className: 'pdl-binding' }, h(Icon, { name: 'package', size: 14 }),
      h('div', { style: { minWidth: 0 } }, h('small', {}, '资料包'), h('b', {}, pkg ? `${pkg.name} · v${pkg.version}` : '—'))),
    h('div', { className: 'pdl-binding' }, h(Icon, { name: 'layers', size: 14 }),
      h('div', { style: { minWidth: 0 } }, h('small', {}, '批次'), h('b', { className: 'pdl-mono' }, batch?.id || '未建批'))))
}

// ---------------------------------------------------------------- 运行面板
function RunPanel({ run, onCancel, title }) {
  if (!run) return null
  const running = run.status === 'running' || run.status === 'queued' || run.status === 'cancelling'
  const pct = run.progress && run.progress.total ? Math.round(run.progress.processed / run.progress.total * 100) : null
  return h('div', { className: 'pdl-run pdl-fade' },
    h('div', { className: 'pdl-run-head' },
      h(StatusDot, { status: running ? 'running' : (run.outcome || 'idle') }),
      h('b', {}, running ? `${title || '执行'}中…` : `${title || '执行'}${runLabel(run)}`),
      h('span', { style: { color: 'var(--pdl-muted)', fontSize: 11.5 } }, fmtDuration(run.startedAt, run.finishedAt)),
      h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } },
        run.result ? h(Badge, { tone: runTone(run) }, `${run.findings?.length || 0} 条发现`) : null,
        running ? h(Button, { size: 'sm', variant: 'danger', icon: 'x', onClick: onCancel }, '取消') : null)),
    pct !== null ? h('div', {}, h(Progress, { value: pct }), h('div', { style: { fontSize: 10.5, color: 'var(--pdl-muted)', marginTop: 4 } }, `${run.progress.processed} / ${run.progress.total} ${run.progress.unit || ''}`)) : null,
    h('div', { className: 'pdl-run-log' }, (run.events || []).slice(-120).map(e => h('div', { key: e.seq, className: e.level === 'error' ? 'error' : e.level === 'warn' ? 'warn' : e.level === 'success' ? 'success' : '' }, e.text))))
}

// ---------------------------------------------------------------- 分批表格
function CsvPreview({ path, maxHeight = 380, limit = 120 }) {
  const { data, loading, error } = useAsync(() => apiCall('artifact.preview', { path, limit }), [path])
  if (loading) return h('div', { className: 'pdl-empty' }, h(Icon, { name: 'refresh', size: 18, className: 'pdl-spin' }), h('div', { style: { marginTop: 6 } }, '读取中…'))
  if (error) return h('div', { className: 'pdl-empty' }, error)
  if (!data || data.kind !== 'table') return h('div', { className: 'pdl-empty' }, data?.text || '无法预览')
  const cols = (data.columns || []).slice(0, 9).map((c, i) => ({ key: 'c' + i, label: c, truncate: true, render: r => r['c' + i] }))
  const rows = (data.rows || []).map((r, idx) => {
    const o = { _i: idx }
    ;(r || []).forEach((v, i) => { o['c' + i] = v })
    return o
  })
  return h('div', {},
    h(Table, { columns: cols, rows, maxHeight, rowKey: r => r._i }),
    h('div', { style: { padding: '7px 12px', fontSize: 10.5, color: 'var(--pdl-muted)', borderTop: '1px solid var(--pdl-border)' } },
      `显示 ${rows.length} 行${data.total ? ` / 共 ${fmtInt(data.total)} 行` : ''}${data.sheetNames ? ` · Sheet: ${(data.sheetNames || []).join(' / ')}` : ''}`))
}

function FindingsList({ findings, onPick }) {
  if (!findings || findings.length === 0) return h(Empty, { icon: 'checkCircle', title: '没有发现问题' })
  return h('div', { style: { display: 'flex', flexDirection: 'column' } },
    findings.slice(0, 60).map((f, i) => h('div', {
      key: i, onClick: () => onPick && onPick(f),
      style: { display: 'flex', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--pdl-border)', cursor: onPick ? 'pointer' : 'default' },
    },
      h('span', { style: { width: 46, flex: '0 0 auto' } }, h(Badge, { tone: f.level === 'block' ? 'danger' : f.level === 'warn' ? 'warn' : 'neutral' }, f.code || f.level)),
      h('div', { style: { minWidth: 0, flex: 1 } },
        h('div', { style: { fontSize: 12 } }, f.message),
        h('div', { style: { fontSize: 10.5, color: 'var(--pdl-muted)', marginTop: 2 } }, [f.wellId, f.location].filter(Boolean).join(' · ') || f.module)))))
}

// ---------------------------------------------------------------- 步骤 1
function StepBatch({ boot, onCreated, onRefresh }) {
  const packages = (boot.packages || []).filter(p => !boot.activeProjectId || p.projectId === boot.activeProjectId)
  const [packageId, setPackageId] = useState(packages[0]?.id || '')
  const [name, setName] = useState('')
  const [subdir, setSubdir] = useState('')
  const [creating, setCreating] = useState(false)
  const [showPkg, setShowPkg] = useState(false)
  const [pkgForm, setPkgForm] = useState({ name: '', kind: 'primary', sourceRoots: '', note: '' })
  const pkg = packages.find(p => p.id === packageId)
  const project = boot.projects.find(p => p.id === boot.activeProjectId) || boot.projects[0]
  const [stat, setStat] = useState(null)
  useEffect(() => {
    if (!pkg) return
    let alive = true
    Promise.all((pkg.sourceRoots || []).map(path => apiCall('files.stat', { path }).catch(e => ({ path, error: e.message }))))
      .then(list => { if (alive) setStat(list) })
    return () => { alive = false }
  }, [pkg?.id])

  const create = async () => {
    if (!packageId) { toast('请先选择或新建资料包', 'warn'); return }
    setCreating(true)
    try {
      const { batch } = await apiCall('batch.create', { projectId: project.id, packageId, name: name || undefined, outputSubdir: subdir })
      toast('批次已创建：' + batch.id)
      await onRefresh()
      onCreated(batch)
    } catch (e) { toast(e.message, 'error') } finally { setCreating(false) }
  }

  const createPkg = async () => {
    try {
      const roots = pkgForm.sourceRoots.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean)
      const { package: created } = await apiCall('package.create', {
        projectId: project.id, name: pkgForm.name || '新资料包', kind: pkgForm.kind, sourceRoots: roots, note: pkgForm.note,
      })
      toast('资料包已创建')
      setShowPkg(false)
      await onRefresh()
      setPackageId(created.id)
    } catch (e) { toast(e.message, 'error') }
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(Card, { title: '资料包与输出', subtitle: '一个批次只处理一个资料包版本；原始目录只读，不搬动、不改名。',
      actions: h(Button, { size: 'sm', icon: 'plus', onClick: () => setShowPkg(true) }, '新建资料包') },
      h('div', { className: 'pdl-grid2' },
        h(Field, { label: '资料包' },
          h(Select, { value: packageId, onChange: setPackageId, placeholder: '选择资料包', options: packages.map(p => ({ value: p.id, label: `${p.name} · v${p.version}${p.kind === 'supplement' ? '（补交）' : ''}` })) }),
          pkg ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 } },
            h(Badge, { tone: pkg.kind === 'supplement' ? 'warn' : 'primary', icon: 'package' }, pkg.kind === 'supplement' ? '补交包' : '主资料包'),
            h(Badge, { tone: 'outline' }, `v${pkg.version}`),
            pkg.combinedFrom ? h(Badge, { tone: 'primary', icon: 'branch' }, '组合版本') : null) : null),
        h(Field, { label: '批次名称（可选）' }, h(TextInput, { value: name, onChange: setName, placeholder: '例如：2025 新钻井 第 3 批' })),
        h(Field, { label: '输出子目录（可选）', hint: '留空则使用 out/<批次 ID>/' }, h(TextInput, { value: subdir, onChange: setSubdir, placeholder: 'out/B-…/ 下的子目录', mono: true })),
        h(Field, { label: '批次 ID', hint: '创建时固定，贯穿 scan → merge → export' }, h(TextInput, { value: '自动生成（B-YYYYMMDD-HHMMSS-xxxx）', onChange: () => {}, disabled: true, mono: true }))),
      pkg ? h('div', { style: { marginTop: 14 } },
        h('div', { style: { fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--pdl-muted)', marginBottom: 8 } }, '来源目录'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          (stat || (pkg.sourceRoots || []).map(p => ({ path: p }))).map((s, i) => h('div', {
            key: i, style: { display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', border: '1px solid var(--pdl-border)', borderRadius: 9, background: 'var(--pdl-surface2)' },
          },
            h(Icon, { name: 'folder', size: 14, style: { color: 'var(--pdl-muted)' } }),
            h('span', { className: 'pdl-mono', style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, s.path),
            s.error ? h(Badge, { tone: 'danger' }, '不可访问') : s.exists === false ? h(Badge, { tone: 'danger' }, '不存在') :
              h(Badge, { tone: 'success' }, `${fmtInt(s.count)} 个文件 · ${fmtBytes(s.bytes)}`))))) : null),
    !packages.length ? h(Card, null, h(Empty, { icon: 'package', title: '还没有资料包', desc: '新建资料包并登记来源目录。', action: h(Button, { variant: 'primary', icon: 'plus', onClick: () => setShowPkg(true) }, '新建资料包') })) : null,
    h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
      h(Button, { variant: 'primary', size: 'lg', icon: 'arrowRight', loading: creating, onClick: create }, '创建批次并继续')),
    h(Modal, { open: showPkg, title: '新建资料包', onClose: () => setShowPkg(false),
      footer: [h(Button, { key: 'c', onClick: () => setShowPkg(false) }, '取消'), h(Button, { key: 's', variant: 'primary', onClick: createPkg }, '创建')] },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h(Field, { label: '名称' }, h(TextInput, { value: pkgForm.name, onChange: v => setPkgForm({ ...pkgForm, name: v }), placeholder: '例如：2025 年 10 月到件' })),
        h(Field, { label: '类型' }, h(Select, { value: pkgForm.kind, onChange: v => setPkgForm({ ...pkgForm, kind: v }), options: [{ value: 'primary', label: '主资料包' }, { value: 'supplement', label: '补交资料包' }] })),
        h(Field, { label: '来源目录（每行一个）', hint: '只读；支持绝对路径或相对工程目录的路径' }, h(Textarea, { value: pkgForm.sourceRoots, onChange: v => setPkgForm({ ...pkgForm, sourceRoots: v }), placeholder: 'D:\\data\\incoming\n..\\raw-data' })),
        h(Field, { label: '到件说明' }, h(Textarea, { rows: 3, value: pkgForm.note, onChange: v => setPkgForm({ ...pkgForm, note: v }) })))))
}

// ---------------------------------------------------------------- 步骤 2
function StepPrecheck({ boot, detail, onSaved, onJump }) {
  const [templateId, setTemplateId] = useState(detail.batch.templateId || '')
  const rules = useAsync(() => apiCall('rules.resolve', { batchId: detail.batch.id }), [detail.batch.id])
  const libs = useAsync(() => apiCall('library.list'), [])
  const templates = boot.templates || []
  const save = async () => {
    try {
      await apiCall('batch.update', { batchId: detail.batch.id, templateId: templateId || null })
      toast('预检配置已保存到本批')
      onSaved && onSaved()
    } catch (e) { toast(e.message, 'error') }
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h('div', { className: 'pdl-grid2' },
      h(Card, { title: '规则来源', subtitle: '工程默认 → 所选模板 → 资料包覆盖 → 本次运行调整' },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          h(Field, { label: '规则模板' },
            h(Select, { value: templateId, onChange: setTemplateId, placeholder: '不套用模板（继承工程默认）', options: templates.map(t => ({ value: t.id, label: `${t.name} · ${t.stage}` })) })),
          h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            h(Badge, { tone: 'neutral' }, `工程默认 ${(rules.data?.fields || []).filter(f => f.source === '工程默认' || f.source === '继承工程').length}`),
            h(Badge, { tone: 'primary' }, `模板 ${(rules.data?.fields || []).filter(f => f.source === '来自模板').length}`),
            h(Badge, { tone: 'warn' }, `本包覆盖 ${(rules.data?.fields || []).filter(f => f.source === '本包覆盖').length}`)),
          h('div', { style: { fontSize: 11.5, color: 'var(--pdl-muted)', lineHeight: 1.7 } },
            '处理一个资料包时不会隐式修改工程默认规则；保存动作区分「仅本次」「保存到资料包」「另存为模板」「修改工程默认」。'))),
      h(Card, { title: '参考库绑定', subtitle: '俄中转译库与中文代码库按同一版本原子发布',
        actions: h(Button, { size: 'sm', variant: 'ghost', iconRight: 'chevronRight', onClick: () => onJump && onJump('library') }, '管理') },
        h('div', { className: 'pdl-kv' },
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '当前绑定'), h('span', {}, libs.data?.binding ? `${libs.data.binding.name} · ${libs.data.binding.version}` : '工程当前参考库')),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '俄中条目'), h('span', {}, fmtInt(libs.data?.libraries?.[0]?.stats?.ruCount))),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '中文代码'), h('span', {}, fmtInt(libs.data?.libraries?.[0]?.stats?.codeCount))),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '缺码'), h('span', {}, libs.data?.libraries?.[0]?.stats?.missingCode ? h(Badge, { tone: 'warn' }, String(libs.data.libraries[0].stats.missingCode)) : h(Badge, { tone: 'success' }, '0')))),
        h('div', { style: { fontSize: 11, color: 'var(--pdl-muted)', marginTop: 10 } }, '运行开始时冻结实际文件与内容摘要；共享基库更新不会改变历史运行。'))),
    h(Card, { title: '最终生效值', subtitle: '每个字段展示来源；可恢复继承值', flush: true },
      h(Table, {
        columns: [
          { key: 'label', label: '配置项', render: f => h('div', {}, h('div', { style: { fontWeight: 550 } }, f.label), h('div', { className: 'pdl-mono', style: { fontSize: 10, color: 'var(--pdl-muted)' } }, f.path)) },
          { key: 'value', label: '生效值', render: f => {
            const text = typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value)
            const short = text.length > 90 ? text.slice(0, 90) + '…' : text
            return h('span', { className: 'pdl-mono', title: text, style: { wordBreak: 'break-all' } }, short)
          } },
          { key: 'stage', label: '阶段', width: 90, render: f => h(Badge, { tone: 'outline' }, f.stage) },
          { key: 'source', label: '来源', width: 110, render: f => h(Badge, { tone: f.source === '本包覆盖' ? 'warn' : f.source === '来自模板' ? 'primary' : 'neutral' }, f.source) },
        ],
        rows: rules.data?.fields || [],
        empty: rules.loading ? h('div', { className: 'pdl-empty' }, '读取配置…') : h(Empty, { icon: 'sliders', title: '暂无配置' }),
      })),
    h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
      h(Button, { icon: 'save', onClick: save }, '保存到本批'),
      h(Button, { variant: 'primary', icon: 'arrowRight', onClick: () => { save().then(() => onJump && onJump('step', 3)) } }, '保存并进入扫描')))
}

// ---------------------------------------------------------------- 步骤 3
function StepScan({ detail, onRunChange, onStep }) {
  const batch = detail.batch
  const lastRun = detail.latestRunByStage?.scan || null
  const [plan, setPlan] = useState(null)
  const [planError, setPlanError] = useState('')
  const [run, setRun] = useState(lastRun)
  const [events, setEvents] = useState([])
  const [starting, setStarting] = useState(false)
  const [tab, setTab] = useState('files')
  const [arts, setArts] = useState([])

  useEffect(() => {
    let alive = true
    apiCall('stage.plan', { batchId: batch.id, stage: 'scan' }).then(p => { if (alive) setPlan(p.plan) }).catch(e => { if (alive) setPlanError(e.message) })
    apiCall('artifact.list', { batchId: batch.id, stage: 'scan' }).then(v => { if (alive) setArts(v.artifacts || []) }).catch(() => {})
    return () => { alive = false }
  }, [batch.id, run?.finishedAt])

  const running = run && ['running', 'queued', 'cancelling'].includes(run.status)
  usePolling(() => apiCall('run.poll', { runId: run.id, afterSeq: events.at(-1)?.seq || 0 }), 900, Boolean(running), v => {
    setRun(v.run)
    if (v.events && v.events.length) setEvents(prev => [...prev, ...v.events])
    if (v.run.status === 'done') { onRunChange && onRunChange(); toast(v.run.outcome === 'ok' ? '扫描完成' : `扫描结束：${runLabel(v.run)}`, v.run.outcome === 'ok' ? 'success' : 'warn') }
  }, [run?.id])

  const start = async (dryRun) => {
    setStarting(true); setEvents([])
    try {
      const { run: created } = await apiCall('run.start', { batchId: batch.id, stage: 'scan', dryRun })
      setRun(created); setEvents([])
      onRunChange && onRunChange()
    } catch (e) { toast(e.message, 'error') } finally { setStarting(false) }
  }

  const counts = run?.result?.counts || {}
  const cats = counts.categories || {}
  const findArt = kw => (arts.find(a => a.name && a.name.includes(kw)) || {}).path || ''
  const filesCsv = findArt('文件清单')
  const unknownCsv = findArt('未识别')
  const unassignedCsv = findArt('未归井')

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    !run ? h(Card, { title: '扫描计划', subtitle: '执行前确认输入、规则来源和写入范围' },
      planError ? h(Empty, { icon: 'alert', title: '计划不可用', desc: planError }) :
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          h('div', { className: 'pdl-kpis', style: { gridTemplateColumns: 'repeat(4, minmax(0,1fr))' } },
            h(Kpi, { label: '待扫描文件', value: fmtInt(plan?.estimates?.files), unit: '个', icon: 'file', tone: 'primary' }),
            h(Kpi, { label: '源数据量', value: fmtBytes(plan?.estimates?.bytes), icon: 'database' }),
            h(Kpi, { label: '井号目录', value: fmtInt(plan?.estimates?.wells), unit: '口', icon: 'layers' }),
            h(Kpi, { label: '复制模式', value: plan?.estimates?.copyMode || 'copy', icon: 'copy' })),
          h('div', { className: 'pdl-grid2' },
            h('div', {}, h('div', { style: { fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--pdl-muted)', marginBottom: 7 } }, '输入'),
              (plan?.inputs || []).map((i, k) => h(PathRow, { key: k, item: i }))),
            h('div', {}, h('div', { style: { fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--pdl-muted)', marginBottom: 7 } }, '输出'),
              (plan?.outputs || []).map((i, k) => h(PathRow, { key: k, item: i })))),
          (plan?.warnings || []).length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            plan.warnings.map((w, i) => h('div', { key: i, style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--pdl-warn)' } }, h(Icon, { name: 'alert', size: 13 }), w.text))) : null,
          h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            h(Button, { icon: 'eye', onClick: () => start(true), loading: starting }, '试运行（不写盘）'),
            h(Button, { variant: 'primary', icon: 'play', onClick: () => start(false), loading: starting }, '开始扫描')))) :
      h(Card, { title: '扫描执行', subtitle: `${run.id} · 第 ${run.attempt} 次`, actions: h(Button, { size: 'sm', variant: 'ghost', icon: 'refresh', onClick: onRunChange }, '刷新') },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          h(RunPanel, { run: { ...run, events }, title: '扫描', onCancel: async () => { await apiCall('run.cancel', { runId: run.id }) } }),
          run.result && !running ? h('div', { style: { borderTop: '1px solid var(--pdl-border)', paddingTop: 14 } },
            h('div', { className: 'pdl-kpis', style: { marginBottom: 14 } },
              h(Kpi, { label: '扫描文件', value: fmtInt(counts.files_seen), unit: '个', icon: 'file' }),
              h(Kpi, { label: '成功入账', value: fmtInt(counts.files_indexed), unit: '个', icon: 'checkCircle', tone: 'success' }),
              h(Kpi, { label: '归井', value: fmtInt(counts.wells), unit: '口', icon: 'layers' }),
              h(Kpi, { label: '未识别', value: fmtInt(counts.unidentified), unit: '个', icon: 'alert', tone: counts.unidentified ? 'warn' : '' }),
              h(Kpi, { label: '未归井', value: fmtInt(counts.unassigned_well), unit: '个', icon: 'alert', tone: counts.unassigned_well ? 'warn' : '' }),
              h(Kpi, { label: '待人工校验', value: fmtInt(counts.review_needed), unit: '个', icon: 'eye', tone: counts.review_needed ? 'warn' : '' })),
            h('div', { className: 'pdl-cat-grid', style: { marginBottom: 14 } },
              Object.entries(cats).map(([k, v]) => h('div', { key: k, className: 'pdl-cat' },
                h('header', {}, h(Icon, { name: 'file', size: 13 }), CATEGORY_LABELS[k] || k),
                h('strong', {}, fmtInt(v)),
                h('div', { className: 'bar' }, h('i', { style: { width: `${Math.min(100, (v / Math.max(1, counts.files_indexed)) * 100)}%` } }))))),
            h('div', { className: 'pdl-card', style: { borderRadius: 12 } },
              h(Tabs, { value: tab, onChange: setTab, items: [
                { id: 'files', label: '文件清单', count: counts.files_indexed },
                { id: 'unknown', label: '未识别', count: counts.unidentified },
                { id: 'unassigned', label: '未归井', count: counts.unassigned_well },
                { id: 'findings', label: '发现', count: run.findings?.length },
              ] }),
              tab === 'findings' ? h(FindingsList, { findings: run.findings }) :
                h(CsvPreview, { path: tab === 'unknown' ? unknownCsv : tab === 'unassigned' ? unassignedCsv : filesCsv, maxHeight: 340 }))) : null,
          run.result && !running ? h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
            h(Button, { variant: 'primary', icon: 'arrowRight', onClick: () => onStep(4) }, '进入汇总核对')) : null))
  )
}

function PathRow({ item }) {
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--pdl-border)', borderRadius: 9, marginBottom: 6, background: 'var(--pdl-surface2)' } },
    h(Icon, { name: item.exists === false ? 'alert' : 'folder', size: 13, style: { color: item.exists === false ? 'var(--pdl-danger)' : 'var(--pdl-muted)' } }),
    h('div', { style: { minWidth: 0, flex: 1 } },
      h('div', { style: { fontSize: 10, color: 'var(--pdl-muted)' } }, item.label),
      h('div', { className: 'pdl-mono', style: { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: item.path }, item.path)),
    item.exists === false ? h(Badge, { tone: 'danger' }, '缺失') : null)
}

const CATEGORY_LABELS = {
  wellhead: '井位', deviation: '井斜', curves: '测井曲线', layers: '分层', interp: '解释结论',
  batch_roster: '井位总表', attachments: '井目录附件', unclassified: '未识别', unknown: '未识别',
}

// ---------------------------------------------------------------- 步骤 4
function StepMerge({ detail, onRunChange, onStep }) {
  const batch = detail.batch
  const lastRun = detail.latestRunByStage?.merge || null
  const [run, setRun] = useState(lastRun)
  const [events, setEvents] = useState([])
  const [starting, setStarting] = useState(false)
  const [review, setReview] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const running = run && ['running', 'queued'].includes(run.status)
  usePolling(() => apiCall('run.poll', { runId: run.id, afterSeq: events.at(-1)?.seq || 0 }), 900, Boolean(running), v => {
    setRun(v.run)
    if (v.events && v.events.length) setEvents(prev => [...prev, ...v.events])
    if (v.run.status === 'done') { onRunChange && onRunChange(); toast('汇总完成', v.run.outcome === 'ok' ? 'success' : 'warn') }
  }, [run?.id])

  const start = async () => {
    setStarting(true); setEvents([])
    try { const { run: r } = await apiCall('run.start', { batchId: batch.id, stage: 'merge' }); setRun(r); onRunChange && onRunChange() }
    catch (e) { toast(e.message, 'error') } finally { setStarting(false) }
  }
  const detect = async () => {
    setReviewing(true)
    try { const r = await apiCall('review.detect', { batchId: batch.id }); setReview(r); toast(r.changed?.length ? `检测到 ${r.changed.length} 个文件被外部修改` : '未检测到外部修改', r.changed?.length ? 'warn' : 'success') }
    catch (e) { toast(e.message, 'error') } finally { setReviewing(false) }
  }
  const counts = run?.result?.counts || {}
  const tables = [
    { key: 'layers', label: '分层', file: '01分层.xlsx' },
    { key: 'interp', label: '解释结论', file: '02解释结论.xlsx' },
    { key: 'deviation', label: '井斜', file: '04井斜汇总.xlsx' },
  ]
  const statOf = k => {
    const direct = counts[k]
    if (direct && typeof direct === 'object') return direct
    const nested = counts.tables && counts.tables[k]
    if (nested) return nested
    const prefix = k + '_'
    const o = {}
    for (const [key, v] of Object.entries(counts)) if (key.startsWith(prefix)) o[key.slice(prefix.length)] = v
    return o
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(Card, { title: '生成三张汇总表', subtitle: '读 02-整理，写 03-汇总；合并完全重复记录、保留冲突和来源',
      actions: h(Button, { variant: 'primary', size: 'sm', icon: 'play', onClick: start, loading: starting }, run ? '重新生成' : '生成汇总表') },
      !run ? h(Empty, { icon: 'table', title: '尚未生成汇总表', desc: '扫描完成后执行 pdl-merge，生成 01分层 / 02解释结论 / 04井斜汇总 三张主表。' }) :
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          h(RunPanel, { run: { ...run, events }, title: '汇总', onCancel: async () => apiCall('run.cancel', { runId: run.id }) }),
          !running ? h('div', { className: 'pdl-grid3' },
            tables.map(t => {
              const s = statOf(t.key)
              return h('div', { key: t.key, className: 'pdl-cat', style: { padding: 14 } },
                h('header', {}, h(Icon, { name: 'table', size: 13 }), t.label, h('span', { style: { marginLeft: 'auto' } }, h(Badge, { tone: s.output ? 'success' : 'neutral' }, s.output ? `${s.output} 行` : '无数据'))),
                h('div', { className: 'pdl-kv', style: { marginTop: 10 } },
                  h('div', { className: 'pdl-kv-row' }, h('span', {}, '输入文件'), h('span', {}, fmtInt(s.input_files))),
                  h('div', { className: 'pdl-kv-row' }, h('span', {}, '提取'), h('span', {}, fmtInt(s.extracted))),
                  h('div', { className: 'pdl-kv-row' }, h('span', {}, '重复合并'), h('span', {}, fmtInt(s.duplicates))),
                  h('div', { className: 'pdl-kv-row' }, h('span', {}, '冲突'), h('span', {}, s.conflicts ? h(Badge, { tone: 'warn' }, String(s.conflicts)) : '0')),
                  h('div', { className: 'pdl-kv-row' }, h('span', {}, '不完整'), h('span', {}, fmtInt(s.incomplete)))),
                h('div', { style: { fontSize: 10.5, color: 'var(--pdl-muted)', marginTop: 8 } }, t.file))
            })) : null,
          !running ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--pdl-border)', background: 'var(--pdl-surface2)' } },
            h(Icon, { name: 'shield', size: 15, style: { color: 'var(--pdl-success)' } }),
            h('div', { style: { minWidth: 0, flex: 1 } },
              h('b', { style: { fontSize: 12 } }, 'Excel 复核保护'),
              h('div', { style: { fontSize: 11, color: 'var(--pdl-muted)' } }, review?.changed?.length ? `检测到 ${review.changed.length} 个文件被外部修改，重跑前将先保存旧表快照。` : '在 Excel 中修改后点击重新检测；重跑前会展示覆盖影响并保存快照。')),
            h(Button, { size: 'sm', icon: 'refresh', loading: reviewing, onClick: detect }, '重新检测 Excel 修改'),
            h(Button, { size: 'sm', variant: 'ghost', iconRight: 'arrowRight', onClick: () => onStep(5) }, '转码预检')) : null,
          review?.changed?.length ? h('div', { style: { border: '1px solid color-mix(in srgb, var(--pdl-warn) 40%, transparent)', borderRadius: 10, padding: 12, background: 'color-mix(in srgb, var(--pdl-warn) 8%, transparent)' } },
            h('b', { style: { fontSize: 12, color: 'var(--pdl-warn)' } }, '外部已修改'),
            h('div', { style: { marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 } },
              review.changed.map((c, i) => h('div', { key: i, className: 'pdl-mono', style: { fontSize: 11 } }, `${c.rel} · ${c.recordedSha} → ${c.currentSha}`)))) : null))) 
}

// ---------------------------------------------------------------- 步骤 5
function StepPreflight({ detail, onStep }) {
  const batch = detail.batch
  const lastRun = detail.latestRunByStage?.export || null
  const [run, setRun] = useState(lastRun && lastRun.request?.dryRun ? lastRun : null)
  const [events, setEvents] = useState([])
  const [starting, setStarting] = useState(false)
  const running = run && ['running', 'queued'].includes(run.status)
  usePolling(() => apiCall('run.poll', { runId: run.id, afterSeq: events.at(-1)?.seq || 0 }), 900, Boolean(running), v => {
    setRun(v.run)
    if (v.events && v.events.length) setEvents(prev => [...prev, ...v.events])
    if (v.run.status === 'done') toast('导出预检完成', 'success')
  }, [run?.id])
  const start = async () => {
    setStarting(true); setEvents([])
    try { const { run: r } = await apiCall('run.start', { batchId: batch.id, stage: 'export', dryRun: true }); setRun(r) }
    catch (e) { toast(e.message, 'error') } finally { setStarting(false) }
  }
  const cats = run?.result?.counts?.categories || {}
  const rows = ['layers', 'interp', 'deviation'].map(k => ({ key: k, label: CATEGORY_LABELS[k] || k, ...(cats[k] || {}) }))
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(Card, { title: '转码预检', subtitle: '对选定类别执行 pdl-export --dry-run；不猜代码、不回写主表',
      actions: h(Button, { variant: 'primary', size: 'sm', icon: 'shield', onClick: start, loading: starting }, '执行导出预检') },
      !run ? h(Empty, { icon: 'shield', title: '尚未预检', desc: '预检会检查输入、可导出数、待确认数与原因，不会生成 PRN。' }) :
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          h(RunPanel, { run: { ...run, events }, title: '导出预检' }),
          !running ? h('div', { className: 'pdl-grid3' }, rows.map(r => h('div', { key: r.key, className: 'pdl-cat', style: { padding: 14 } },
            h('header', {}, h(Icon, { name: 'package', size: 13 }), r.label),
            h('strong', {}, fmtInt(r.output_rows ?? r.input_rows ?? 0), h('em', { style: { fontSize: 11, color: 'var(--pdl-muted)', marginLeft: 4 } }, '可导出')),
            h('div', { className: 'pdl-kv', style: { marginTop: 8 } },
              h('div', { className: 'pdl-kv-row' }, h('span', {}, '输入'), h('span', {}, fmtInt(r.input_rows))),
              h('div', { className: 'pdl-kv-row' }, h('span', {}, '待确认'), h('span', {}, r.pending ? h(Badge, { tone: 'warn' }, String(r.pending)) : '0')),
              h('div', { className: 'pdl-kv-row' }, h('span', {}, '错误'), h('span', {}, r.errors ? h(Badge, { tone: 'danger' }, String(r.errors)) : '0')))))) : null,
          !running ? h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
            h(Button, { variant: 'primary', iconRight: 'arrowRight', onClick: () => onStep(6) }, '进入导出交付')) : null)))
}

// ---------------------------------------------------------------- 步骤 6
function StepDeliver({ detail, onRunChange, onJump }) {
  const batch = detail.batch
  const runs = (detail.runs || []).filter(r => r.stage === 'export' && !r.request?.dryRun)
  const lastRun = runs.at(-1) || null
  const [run, setRun] = useState(lastRun)
  const [events, setEvents] = useState([])
  const [starting, setStarting] = useState(false)
  const [artifacts, setArtifacts] = useState([])
  const [kind, setKind] = useState('partial')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const running = run && ['running', 'queued'].includes(run.status)
  usePolling(() => apiCall('run.poll', { runId: run.id, afterSeq: events.at(-1)?.seq || 0 }), 900, Boolean(running), v => {
    setRun(v.run)
    if (v.events && v.events.length) setEvents(prev => [...prev, ...v.events])
    if (v.run.status === 'done') { onRunChange && onRunChange(); toast('导出完成', v.run.outcome === 'ok' ? 'success' : 'warn') }
  }, [run?.id])
  useEffect(() => {
    apiCall('artifact.list', { batchId: batch.id, stage: 'export' }).then(v => setArtifacts(v.artifacts || [])).catch(() => {})
  }, [batch.id, run?.finishedAt])
  const start = async () => {
    setStarting(true); setEvents([])
    try { const { run: r } = await apiCall('run.start', { batchId: batch.id, stage: 'export' }); setRun(r); onRunChange && onRunChange() }
    catch (e) { toast(e.message, 'error') } finally { setStarting(false) }
  }
  const cats = run?.result?.counts?.categories || {}
  const interp = cats.interp || {}
  const pendingCount = Number(interp.pending) || 0
  useEffect(() => {
    if (run?.result) setKind(pendingCount > 0 ? 'partial' : 'full')
  }, [run?.id, run?.finishedAt, pendingCount])
  const confirm = async () => {
    if (!run) return
    setConfirming(true)
    try {
      await apiCall('delivery.confirm', { batchId: batch.id, runId: run.id, kind, note })
      toast(kind === 'partial' ? '已确认部分交付' : '已确认完整交付')
      onRunChange && onRunChange()
    } catch (e) { toast(e.message, 'error') } finally { setConfirming(false) }
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(Card, { title: '导出交付', subtitle: '生成 PRN、报告与清单；完整或部分交付都保留明确状态',
      actions: h(Button, { variant: 'primary', size: 'sm', icon: 'play', onClick: start, loading: starting }, run ? '重新导出' : '生成待导入文件') },
      !run ? h(Empty, { icon: 'package', title: '尚未导出', desc: '将 03-汇总 转成 GeoEast 可导入 PRN；解释结论使用两份参考库确定性转码。' }) :
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          h(RunPanel, { run: { ...run, events }, title: '导出' }),
          !running ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            h('div', { className: 'pdl-kpis' },
              h(Kpi, { label: '分层', value: fmtInt(cats.layers?.output_rows), unit: '行', icon: 'layers', tone: 'success' }),
              h(Kpi, { label: '解释结论', value: fmtInt(cats.interp?.output_rows), unit: '行', icon: 'book', tone: 'success' }),
              h(Kpi, { label: '井斜', value: fmtInt(cats.deviation?.output_rows), unit: '行', icon: 'table', tone: 'success' }),
              h(Kpi, { label: '待确认', value: pendingCount, unit: '条', icon: 'alert', tone: pendingCount ? 'warn' : '' }),
              h(Kpi, { label: '状态', value: runLabel(run), icon: 'shield', tone: run.outcome === 'ok' ? 'success' : 'warn' })),
            h('div', { className: 'pdl-card', style: { borderRadius: 12 } },
              h('div', { style: { padding: '12px 14px', borderBottom: '1px solid var(--pdl-border)', fontWeight: 600, fontSize: 12.5 } }, '产物清单'),
              h(Table, {
                columns: [
                  { key: 'name', label: '文件', render: a => h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, h(Icon, { name: a.kind === 'xlsx' ? 'table' : a.kind === 'prn' ? 'package' : a.kind === 'html' ? 'eye' : 'file', size: 13 }), h('span', {}, a.name)) },
                  { key: 'size', label: '大小', width: 100, align: 'right', render: a => fmtBytes(a.size) },
                  { key: 'sha1', label: '摘要', width: 120, mono: true },
                  { key: 'mtime', label: '更新时间', width: 150, render: a => fmtTime(new Date(a.mtime).toISOString()) },
                ],
                rows: artifacts.filter(a => a.stage === 'export'),
                empty: h(Empty, { icon: 'package', title: '暂无产物' }),
              })),
            h('div', { style: { display: 'flex', gap: 8 } },
              h('div', { style: { flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--pdl-border)', background: 'var(--pdl-surface2)', fontSize: 12 } },
                h('b', {}, '校验关系：'),
                h('span', { className: 'pdl-mono' }, `输入 ${fmtInt(interp.input_rows)} = 已导出 ${fmtInt(interp.output_rows)} + 待确认 ${fmtInt(interp.pending)}`))),
            h('div', { style: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--pdl-border)' } },
              h('div', { style: { flex: 1 } },
                h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '交付确认'),
                h('div', { style: { display: 'flex', gap: 16, marginBottom: 8 } },
                  [['full', '完整交付', pendingCount > 0 ? '存在待确认，不能完整交付' : '全部输入已导出', pendingCount > 0], ['partial', '部分交付', pendingCount ? `保留 ${pendingCount} 条待确认` : '需显式确认', false]].map(([v, l, d, disabled]) =>
                    h('label', { key: v, style: { display: 'flex', gap: 7, alignItems: 'flex-start', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, padding: '7px 10px', border: '1px solid var(--pdl-border)', borderRadius: 9, background: kind === v ? 'var(--pdl-primary-soft)' : 'transparent' } },
                      h('input', { type: 'radio', name: 'dlv', value: v, checked: kind === v, disabled, onChange: () => setKind(v) }),
                      h('div', {}, h('div', { style: { fontSize: 12, fontWeight: 600 } }, l), h('div', { style: { fontSize: 10.5, color: 'var(--pdl-muted)' } }, d))))),
                h(TextInput, { value: note, onChange: setNote, placeholder: '交付备注（可选）' })),
              h(Button, { variant: kind === 'partial' ? 'danger' : 'success', size: 'lg', icon: 'checkCircle', loading: confirming, disabled: Boolean(detail.delivery && detail.deliveryValid), onClick: confirm }, detail.delivery && detail.deliveryValid ? '已确认交付' : kind === 'partial' ? '确认部分交付' : '确认完整交付')),
            detail.delivery ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--pdl-border)', background: 'var(--pdl-surface2)' } },
              h(Icon, { name: detail.deliveryValid ? 'checkCircle' : 'alert', size: 14, style: { color: detail.deliveryValid ? 'var(--pdl-success)' : 'var(--pdl-warn)' } }),
              h('div', { style: { fontSize: 11.5 } },
                h('b', {}, detail.deliveryValid ? `已确认${detail.delivery.kind === 'partial' ? '部分' : '完整'}交付` : '旧交付确认已失效（产物已变化）'),
                h('span', { style: { color: 'var(--pdl-muted)', marginLeft: 8 } }, fmtTime(detail.delivery.confirmedAt)))) : null,
            h('div', { style: { fontSize: 11, color: 'var(--pdl-muted)' } }, '文件生成与 GeoEast 实机导入验收分别记录；产物变化后确认自动失效。')) : null)))
}

// ---------------------------------------------------------------- 检查器
function Inspector({ detail, step, onJump, findings }) {
  const batch = detail.batch
  const rules = useAsync(() => apiCall('rules.resolve', { batchId: batch.id }), [batch.id])
  const libs = useAsync(() => apiCall('library.list'), [])
  const lastRun = Object.values(detail.latestRunByStage || {}).filter(Boolean).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0]
  const overrides = (rules.data?.fields || []).filter(f => f.source !== '工程默认' && f.source !== '继承工程')
  return h('aside', { className: 'pdl-inspector' },
    h('div', { className: 'pdl-card' },
      h('div', { className: 'pdl-inspector-section' },
        h('h3', {}, '本批配置'),
        h('div', { className: 'pdl-kv' },
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '批次'), h('span', { className: 'pdl-mono' }, batch.id)),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '资料包'), h('span', {}, `v${batch.packageVersion}`)),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '覆盖字段'), h('span', {}, overrides.length ? h(Badge, { tone: 'warn' }, String(overrides.length)) : h(Badge, { tone: 'neutral' }, '无'))),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '参考库'), h('span', { style: { maxWidth: 180 } }, libs.data?.binding ? `${libs.data.binding.version}` : '工程当前')))),
      h('div', { className: 'pdl-inspector-section' },
        h('h3', {}, '阶段状态'),
        h('div', { className: 'pdl-timeline' },
          STAGES.map(s => {
            const r = detail.latestRunByStage?.[s.key]
            const st = !r ? 'idle' : ['running', 'queued'].includes(r.status) ? 'running' : r.outcome === 'ok' || r.outcome === 'partial' ? 'done' : 'idle'
            return h('div', { key: s.key, className: 'pdl-tl-item ' + st },
              h('div', { className: 'pdl-tl-dot' }, h(Icon, { name: st === 'done' ? 'check' : s.icon, size: 11 })),
              h('div', { className: 'pdl-tl-body' }, h('b', {}, s.label), h('small', {}, r ? `${runLabel(r)} · ${fmtTime(r.finishedAt || r.startedAt)}` : '未运行')))
          }))),
      h('div', { className: 'pdl-inspector-section' },
        h('h3', {}, '产物定位'),
        h('div', { className: 'pdl-kv' },
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '整理'), h('span', { className: 'pdl-mono', style: { fontSize: 10.5 } }, `out/${batch.id}/02-整理`)),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '汇总'), h('span', { className: 'pdl-mono', style: { fontSize: 10.5 } }, `out/${batch.id}/03-汇总`)),
          h('div', { className: 'pdl-kv-row' }, h('span', {}, '待导入'), h('span', { className: 'pdl-mono', style: { fontSize: 10.5 } }, `out/${batch.id}/04-待导入`)))),
      latestFindingsBlock(findings || lastRun?.findings)))
}

function latestFindingsBlock(findings) {
  if (!findings || !findings.length) return null
  return h('div', { className: 'pdl-inspector-section' },
    h('h3', {}, '最近发现'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      findings.slice(0, 3).map((f, i) => h('div', { key: i, style: { fontSize: 11.3, display: 'flex', gap: 7 } },
        h(Icon, { name: f.level === 'block' ? 'alert' : 'info', size: 12, style: { marginTop: 2, color: f.level === 'block' ? 'var(--pdl-danger)' : f.level === 'warn' ? 'var(--pdl-warn)' : 'var(--pdl-muted)' } }),
        h('span', { style: { minWidth: 0 } }, f.message)))))
}

// ---------------------------------------------------------------- 工作台容器
function Workbench({ boot, detail, activeBatchId, draft, onOpenBatch, onCloseBatch, onRefresh, onNav }) {
  const [step, setStep] = useState(detail?.batch?.step || 1)
  useEffect(() => { if (detail?.batch?.step) setStep(detail.batch.step) }, [detail?.batch?.id])
  if (!detail && draft) {
    return h('div', { className: 'pdl-page pdl-fade' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        h('div', null,
          h('div', { style: { fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--pdl-muted)' } }, 'NEW BATCH ／ 步骤 01'),
          h('h1', { style: { margin: '3px 0 0', fontSize: 20, fontWeight: 680 } }, '建批与路径')),
        h('div', { style: { marginLeft: 'auto' } }, h(Button, { size: 'sm', icon: 'chevronLeft', onClick: onCloseBatch }, '返回概览'))),
      h(StepBar, { step: 1, onJump: () => {} }),
      h(StepBatch, { boot, onCreated: b => { onRefresh(); onOpenBatch(b.id) }, onRefresh }))
  }
  if (!detail) return h(HomeBoard, { boot, onOpenBatch, onNew: () => onNav('new'), onRefresh })

  const batch = detail.batch
  const stageState = key => {
    const r = detail.latestRunByStage?.[key]
    if (!r) return 'idle'
    if (['running', 'queued'].includes(r.status)) return 'active'
    if (r.outcome === 'ok' || r.outcome === 'partial') return 'done'
    if (r.outcome === 'blocked' || r.outcome === 'failed') return 'active'
    return 'idle'
  }
  const go = n => { setStep(n); apiCall('batch.update', { batchId: batch.id, step: Math.max(batch.step || 1, n) }).then(onRefresh).catch(() => {}) }
  const props = { boot, detail, onRunChange: onRefresh, onJump: onNav }

  return h('div', { className: 'pdl-page pdl-fade' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
      h('div', { style: { minWidth: 0 } },
        h('div', { style: { fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--pdl-muted)' } }, `BATCH WORKBENCH ／ ${batch.id}`),
        h('h1', { style: { margin: '3px 0 0', fontSize: 20, fontWeight: 680, letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 8 } },
          batch.name,
          h(Badge, { tone: batch.step >= 6 ? 'success' : 'primary' }, `步骤 ${batch.step}/6`))),
      h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } },
        h(Button, { size: 'sm', icon: 'chevronLeft', onClick: onCloseBatch }, '返回概览'),
        h(Button, { size: 'sm', variant: 'ghost', icon: 'refresh', onClick: onRefresh }, '刷新'))),
    h(StageTrack, { stageState }),
    h(StepBar, { step, onJump: go }),
    h('div', { className: 'pdl-work' },
      h('div', { className: 'pdl-work-main' },
        step === 1 ? h(StepBatch, { boot, onCreated: b => { onRefresh(); onOpenBatch(b.id) }, onRefresh }) :
          step === 2 ? h(StepPrecheck, { boot, detail, onSaved: onRefresh, onJump: (what, n) => what === 'step' ? go(n) : onNav(what) }) :
            step === 3 ? h(StepScan, { ...props, onStep: go }) :
              step === 4 ? h(StepMerge, { ...props, onStep: go }) :
                step === 5 ? h(StepPreflight, { ...props, onStep: go }) :
                  h(StepDeliver, props)),
      h(Inspector, { detail, step, onJump: go })))
}


// ---- 20-pages.js ----
// ============================================================================
// PDL 中台 · 管理页面：资料包 / 参考库 / 规则模板 / 运行记录
// ============================================================================

function PageHeader({ eyebrow, title, desc, actions }) {
  return h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' } },
    h('div', { style: { minWidth: 0 } },
      h('div', { style: { fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--pdl-muted)' } }, eyebrow),
      h('h1', { style: { margin: '4px 0 0', fontSize: 21, fontWeight: 680, letterSpacing: '-.015em' } }, title),
      desc ? h('p', { style: { margin: '6px 0 0', fontSize: 12.5, color: 'var(--pdl-muted)' } }, desc) : null),
    actions ? h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } }, actions) : null)
}

// ---------------------------------------------------------------- 资料包
function PackagesPage({ boot, onRefresh, onOpenBatch }) {
  const packages = (boot.packages || []).filter(p => !boot.activeProjectId || p.projectId === boot.activeProjectId)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', kind: 'primary', sourceRoots: '', note: '' })
  const [sel, setSel] = useState(packages[0]?.id || null)
  const [busy, setBusy] = useState(false)
  const project = boot.projects.find(p => p.id === boot.activeProjectId)
  const current = packages.find(p => p.id === sel) || null
  const batchesOf = id => (boot.batches || []).filter(b => b.packageId === id)

  const create = async () => {
    setBusy(true)
    try {
      const roots = form.sourceRoots.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean)
      const { package: p } = await apiCall('package.create', { projectId: project.id, name: form.name || '新资料包', kind: form.kind, sourceRoots: roots, note: form.note })
      toast('资料包已创建')
      setOpen(false); setForm({ name: '', kind: 'primary', sourceRoots: '', note: '' })
      await onRefresh(); setSel(p.id)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const combine = async () => {
    if (!current) return
    const supplements = packages.filter(p => p.kind === 'supplement')
    if (!supplements.length) { toast('还没有补交资料包', 'warn'); return }
    setBusy(true)
    try {
      const { package: p } = await apiCall('package.combine', { baseId: current.id, supplementId: supplements[0].id })
      toast('已生成组合版本')
      await onRefresh(); setSel(p.id)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return h('div', { className: 'pdl-page pdl-fade' },
    h(PageHeader, { eyebrow: 'PACKAGES ／ 来源集合', title: '资料包', desc: '一次到件的来源集合；组合版本保留原包、补交包与文件来源链。',
      actions: [h(Button, { key: 'c', icon: 'plus', onClick: () => setOpen(true) }, '新建资料包')] }),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 14 } },
      h(Card, { title: '资料包列表', subtitle: `${packages.length} 个`, flush: true },
        h(Table, {
          columns: [
            { key: 'name', label: '资料包', render: p => h('div', {}, h('div', { style: { fontWeight: 600 } }, p.name), h('div', { style: { fontSize: 10.5, color: 'var(--pdl-muted)' } }, p.kind === 'supplement' ? '补交资料包' : '主资料包')) },
            { key: 'version', label: '版本', width: 70, render: p => h(Badge, { tone: 'outline' }, `v${p.version}`) },
            { key: 'sources', label: '来源', width: 80, align: 'right', render: p => `${p.sourceRoots?.length || 0} 个` },
            { key: 'batches', label: '批次', width: 70, align: 'right', render: p => batchesOf(p.id).length },
            { key: 'updatedAt', label: '更新时间', width: 140, render: p => fmtTime(p.updatedAt) },
          ],
          rows: packages, rowKey: p => p.id,
          empty: h(Empty, { icon: 'package', title: '还没有资料包', desc: '新建资料包并登记只读来源目录。' }),
        })),
      current ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h(Card, { title: current.name, subtitle: `v${current.version} · ${current.kind === 'supplement' ? '补交包' : '主资料包'}`, actions: h(Badge, { tone: current.kind === 'supplement' ? 'warn' : 'primary' }, current.kind === 'supplement' ? '补交' : '主包') },
          h('div', { className: 'pdl-kv' },
            h('div', { className: 'pdl-kv-row' }, h('span', {}, 'ID'), h('span', { className: 'pdl-mono' }, current.id)),
            h('div', { className: 'pdl-kv-row' }, h('span', {}, '创建'), h('span', {}, fmtTime(current.createdAt))),
            current.combinedFrom ? h('div', { className: 'pdl-kv-row' }, h('span', {}, '组合自'), h('span', {}, '原包 + 补交包')) : null,
            current.note ? h('div', { className: 'pdl-kv-row' }, h('span', {}, '说明'), h('span', { style: { maxWidth: 200 } }, current.note)) : null),
          h('div', { style: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 } },
            (current.sourceRoots || []).map((s, i) => h('div', { key: i, className: 'pdl-mono', style: { fontSize: 10.5, padding: '6px 8px', borderRadius: 7, background: 'var(--pdl-surface2)', border: '1px solid var(--pdl-border)' } }, s))),
          h('div', { style: { marginTop: 12, display: 'flex', gap: 8 } },
            h(Button, { size: 'sm', icon: 'branch', onClick: combine, loading: busy }, '并入补交包'),
            h(Button, { size: 'sm', variant: 'ghost', icon: 'layers', onClick: () => { const b = batchesOf(current.id)[0]; b ? onOpenBatch(b.id) : toast('该资料包还没有批次', 'warn') } }, '打开批次'))),
        h(Card, { title: '版本历史', subtitle: '原包旧版本与组合版本都保留', flush: true },
          h(Table, {
            columns: [
              { key: 'version', label: '版本', width: 70, render: p => h(Badge, { tone: p.id === current.id ? 'primary' : 'outline' }, `v${p.version}`) },
              { key: 'name', label: '名称' },
              { key: 'createdAt', label: '创建', width: 130, render: p => fmtTime(p.createdAt) },
            ],
            rows: packages.filter(p => p.id === current.id || p.parentPackageId === current.id || p.id === current.parentPackageId),
            rowKey: p => p.id,
          }))) : h(Card, null, h(Empty, { icon: 'package', title: '选择资料包查看详情' }))),
    h(Modal, { open, title: '新建资料包', onClose: () => setOpen(false),
      footer: [h(Button, { key: 'c', onClick: () => setOpen(false) }, '取消'), h(Button, { key: 's', variant: 'primary', loading: busy, onClick: create }, '创建')] },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h(Field, { label: '名称' }, h(TextInput, { value: form.name, onChange: v => setForm({ ...form, name: v }) })),
        h(Field, { label: '类型' }, h(Select, { value: form.kind, onChange: v => setForm({ ...form, kind: v }), options: [{ value: 'primary', label: '主资料包' }, { value: 'supplement', label: '补交资料包' }] })),
        h(Field, { label: '来源目录（每行一个）', hint: '只读；不会搬动或改名原始目录' }, h(Textarea, { value: form.sourceRoots, onChange: v => setForm({ ...form, sourceRoots: v }) })),
        h(Field, { label: '到件说明' }, h(Textarea, { rows: 3, value: form.note, onChange: v => setForm({ ...form, note: v }) })))))
}

// ---------------------------------------------------------------- 参考库
function LibraryPage({ boot, onRefresh }) {
  const list = useAsync(() => apiCall('library.list'), [])
  const libraries = list.data?.libraries || []
  const [sel, setSel] = useState('LIB-CURRENT')
  const detail = useAsync(() => apiCall('library.get', { libraryId: sel }), [sel])
  const [tab, setTab] = useState('ruZh')
  const [busy, setBusy] = useState(false)
  const lib = libraries.find(x => x.id === sel)
  const stats = detail.data?.stats || {}
  const rows = (detail.data?.entries?.[tab] || [])
  const cols = detail.data?.columns?.[tab] || Object.keys(rows[0] || {})
  const doPublish = async () => {
    setBusy(true)
    try { await apiCall('library.publish', { libraryId: sel }); toast('候选版本已发布'); list.reload(); detail.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const doApply = async () => {
    setBusy(true)
    try { await apiCall('library.apply', { libraryId: sel }); toast('已应用到工程（原文件已备份）'); list.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const doDraft = async () => {
    setBusy(true)
    try { const { library } = await apiCall('library.draft', { name: `候选版本 ${libraries.length}` }); toast('已创建候选版本'); list.reload(); setSel(library.id) }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return h('div', { className: 'pdl-page pdl-fade' },
    h(PageHeader, { eyebrow: 'REFERENCE LIBRARY ／ 共享基库', title: '解释结论参考库', desc: '俄中转译库与中文 GeoEast 代码库原子发布、同版本绑定；运行开始时冻结文件摘要。',
      actions: [h(Button, { key: 'd', icon: 'plus', onClick: doDraft, loading: busy }, '创建候选版本')] }),
    h('div', { style: { display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 14, alignItems: 'start' } },
      h(Card, { title: '版本', subtitle: `${libraries.length} 个`, flush: true },
        h('div', { style: { display: 'flex', flexDirection: 'column' } },
          libraries.map(l => h('button', {
            key: l.id, onClick: () => setSel(l.id),
            style: { textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--pdl-border)', background: sel === l.id ? 'var(--pdl-primary-soft)' : 'transparent', cursor: 'pointer', color: 'inherit', font: 'inherit' },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
              h('b', { style: { fontSize: 12.5 } }, l.name),
              h(Badge, { tone: l.status === 'draft' ? 'warn' : l.status === 'active' ? 'success' : 'primary' }, l.status === 'draft' ? '草稿' : l.status === 'active' ? '当前' : '已发布')),
            h('div', { style: { fontSize: 10.5, color: 'var(--pdl-muted)', marginTop: 3 } }, `v${l.version} · ${fmtInt(l.stats?.ruCount)} 俄中 / ${fmtInt(l.stats?.codeCount)} 代码`))))),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h('div', { className: 'pdl-kpis' },
          h(Kpi, { label: '俄中条目', value: fmtInt(stats.ruCount), icon: 'book', tone: 'primary' }),
          h(Kpi, { label: '中文代码', value: fmtInt(stats.codeCount), icon: 'database' }),
          h(Kpi, { label: '覆盖', value: stats.coverage ?? '—', unit: '%', icon: 'shield', tone: 'success' }),
          h(Kpi, { label: '缺码', value: fmtInt(stats.missingCode), icon: 'alert', tone: stats.missingCode ? 'warn' : '' })),
        h(Card, { title: lib?.name || '参考库', subtitle: lib?.id === 'LIB-CURRENT' ? '来自 config/references，工程当前生效' : '版本副本（不可变）',
          actions: h('div', { style: { display: 'flex', gap: 8 } },
            lib?.status === 'draft' ? h(Button, { size: 'sm', variant: 'primary', onClick: doPublish, loading: busy }, '发布版本') : null,
            lib && lib.id !== 'LIB-CURRENT' && lib.status === 'published' ? h(Button, { size: 'sm', icon: 'shield', onClick: doApply, loading: busy }, '应用到工程') : null) },
          h(Tabs, { value: tab, onChange: setTab, items: [{ id: 'ruZh', label: '俄中结论对照', count: stats.ruCount }, { id: 'zhCode', label: '中文代码', count: stats.zhCount }] }),
          h(Table, {
            columns: cols.slice(0, 6).map((c, i) => ({ key: 'c' + i, label: c, truncate: true, render: r => String(Object.values(r)[i] ?? '') })),
            rows: rows.slice(0, 200).map((r, i) => ({ ...r, _i: i, _vals: Object.values(r) })),
            maxHeight: 420, rowKey: r => r._i,
            empty: h(Empty, { icon: 'book', title: '暂无条目' }),
          })))))
}

// ---------------------------------------------------------------- 规则模板
function RulesPage({ boot, onRefresh }) {
  const templates = boot.templates || []
  const [sel, setSel] = useState(templates[0]?.id || null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', stage: 'all', values: '{}' })
  const current = templates.find(t => t.id === sel) || null
  const eff = useAsync(() => apiCall('rules.resolve', {}), [])
  const save = async () => {
    let values = {}
    try { values = JSON.parse(form.values || '{}') } catch { toast('覆盖值必须是合法 JSON', 'error'); return }
    try {
      if (!form.name) { toast('请填写模板名称', 'warn'); return }
      await apiCall('rules.save', { templateId: current?.id, name: form.name, stage: form.stage, values })
      toast('模板已保存'); setOpen(false); await onRefresh()
    } catch (e) { toast(e.message, 'error') }
  }
  const del = async id => {
    try { await apiCall('rules.delete', { templateId: id }); toast('模板已删除'); await onRefresh() }
    catch (e) { toast(e.message, 'error') }
  }
  return h('div', { className: 'pdl-page pdl-fade' },
    h(PageHeader, { eyebrow: 'RULE TEMPLATES ／ 覆盖顺序', title: '规则模板', desc: '工程默认 → 所选模板 → 资料包覆盖 → 本次运行调整；每个字段都标注来源。',
      actions: [h(Button, { key: 'n', icon: 'plus', onClick: () => { setForm({ name: '', stage: 'all', values: '{}' }); setOpen(true) } }, '新建模板')] }),
    h('div', { style: { display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', gap: 14, alignItems: 'start' } },
      h(Card, { title: '模板', subtitle: `${templates.length} 个`, flush: true },
        templates.length ? h('div', null, templates.map(t => h('div', { key: t.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--pdl-border)', background: sel === t.id ? 'var(--pdl-primary-soft)' : 'transparent' } },
          h('button', { onClick: () => setSel(t.id), style: { flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer' } },
            h('b', { style: { fontSize: 12.5 } }, t.name), h('div', { style: { fontSize: 10.5, color: 'var(--pdl-muted)' } }, `${t.stage} · ${Object.keys(t.values || {}).length} 项覆盖`)),
          h(Button, { size: 'sm', variant: 'ghost', icon: 'x', onClick: () => del(t.id) })))) :
          h(Empty, { icon: 'sliders', title: '还没有模板', desc: '把常用参数组合保存为模板。' })),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        current ? h(Card, { title: current.name, subtitle: `适用阶段：${current.stage}`, actions: h(Button, { size: 'sm', icon: 'save', onClick: () => { setForm({ name: current.name, stage: current.stage, values: JSON.stringify(current.values || {}, null, 2) }); setOpen(true) } }, '编辑') },
          h('div', { className: 'pdl-kv' }, Object.entries(current.values || {}).map(([k, v]) => h('div', { key: k, className: 'pdl-kv-row' }, h('span', { className: 'pdl-mono', style: { fontSize: 10.5 } }, k), h('span', { className: 'pdl-mono' }, JSON.stringify(v)))))) : null,
        h(Card, { title: '工程默认（最终生效值）', subtitle: '只读展示；修改工程默认会影响所有批次', flush: true },
          h(Table, {
            columns: [
              { key: 'label', label: '配置项' },
              { key: 'value', label: '值', render: f => h('span', { className: 'pdl-mono' }, typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value)) },
              { key: 'stage', label: '阶段', width: 90, render: f => h(Badge, { tone: 'outline' }, f.stage) },
            ],
            rows: eff.data?.fields || [], rowKey: f => f.path,
          })))),
    h(Modal, { open, title: current ? '编辑模板' : '新建模板', onClose: () => setOpen(false),
      footer: [h(Button, { key: 'c', onClick: () => setOpen(false) }, '取消'), h(Button, { key: 's', variant: 'primary', onClick: save }, '保存')] },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h(Field, { label: '模板名称' }, h(TextInput, { value: form.name, onChange: v => setForm({ ...form, name: v }) })),
        h(Field, { label: '适用阶段' }, h(Select, { value: form.stage, onChange: v => setForm({ ...form, stage: v }), options: [{ value: 'all', label: '全部阶段' }, { value: 'scan', label: '扫描' }, { value: 'merge', label: '汇总' }, { value: 'export', label: '导出' }] })),
        h(Field, { label: '覆盖值（JSON）', hint: '仅白名单字段生效，例如 {"options.well_id_upper": true}' }, h(Textarea, { rows: 8, value: form.values, onChange: v => setForm({ ...form, values: v }), style: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5 } })))))
}

// ---------------------------------------------------------------- 运行记录
function RunsPage({ boot, onOpenBatch }) {
  const [stage, setStage] = useState('all')
  const [sel, setSel] = useState(null)
  const runs = [...(boot.runs || [])].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
  const filtered = stage === 'all' ? runs : runs.filter(r => r.stage === stage)
  const batchOf = id => (boot.batches || []).find(b => b.id === id)
  return h('div', { className: 'pdl-page pdl-fade' },
    h(PageHeader, { eyebrow: 'RUN RECORDS ／ 配置快照', title: '运行记录', desc: '每次执行都记录输入、配置、结果与产物摘要；历史运行引用当时的参考库版本。',
      actions: [h(Select, { key: 's', value: stage, onChange: setStage, options: [{ value: 'all', label: '全部阶段' }, { value: 'scan', label: '扫描' }, { value: 'merge', label: '汇总' }, { value: 'export', label: '导出' }] })] }),
    h('div', { style: { display: 'grid', gridTemplateColumns: sel ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', gap: 14, alignItems: 'start' } },
      h(Card, { title: '执行流水', subtitle: `${filtered.length} 条`, flush: true },
        h(Table, {
          columns: [
            { key: 'stage', label: '阶段', width: 80, render: r => h(Badge, { tone: r.stage === 'scan' ? 'primary' : r.stage === 'merge' ? 'success' : 'warn' }, r.stage === 'scan' ? '扫描' : r.stage === 'merge' ? '汇总' : '导出') },
            { key: 'batch', label: '批次', render: r => h('div', { style: { cursor: 'pointer' }, onClick: () => onOpenBatch(r.batchId) }, h('div', { style: { fontWeight: 550 } }, batchOf(r.batchId)?.name || r.batchId), h('div', { className: 'pdl-mono', style: { fontSize: 10, color: 'var(--pdl-muted)' } }, r.id)) },
            { key: 'status', label: '状态', width: 110, render: r => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(StatusDot, { status: r.status === 'running' ? 'running' : (r.outcome || r.status) }), runLabel(r)) },
            { key: 'findings', label: '发现', width: 70, align: 'right', render: r => fmtInt(r.findings?.length) },
            { key: 'startedAt', label: '开始', width: 140, render: r => fmtTime(r.startedAt) },
            { key: 'dur', label: '耗时', width: 80, align: 'right', render: r => fmtDuration(r.startedAt, r.finishedAt) },
          ],
          rows: filtered, rowKey: r => r.id, maxHeight: 620, onRowClick: r => setSel(r),
          empty: h(Empty, { icon: 'history', title: '还没有运行记录' }),
        })),
      sel ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h(Card, { title: sel.id, subtitle: `${sel.stage} · 第 ${sel.attempt} 次`, actions: h(Button, { size: 'sm', variant: 'ghost', icon: 'x', onClick: () => setSel(null) }) },
          h('div', { className: 'pdl-kv' },
            h('div', { className: 'pdl-kv-row' }, h('span', {}, '状态'), h('span', {}, runLabel(sel))),
            h('div', { className: 'pdl-kv-row' }, h('span', {}, '退出码'), h('span', { className: 'pdl-mono' }, String(sel.exitCode ?? '—'))),
            h('div', { className: 'pdl-kv-row' }, h('span', {}, '耗时'), h('span', {}, fmtDuration(sel.startedAt, sel.finishedAt))),
            h('div', { className: 'pdl-kv-row' }, h('span', {}, '产物'), h('span', {}, `${sel.artifacts?.length || 0} 件`)))),
        h(Card, { title: '发现', subtitle: `${sel.findings?.length || 0} 条`, flush: true, style: { maxHeight: 420, overflow: 'auto' } },
          h(FindingsList, { findings: sel.findings })),
        h(Card, { title: '产物', flush: true },
          h(Table, { columns: [{ key: 'name', label: '文件' }, { key: 'size', label: '大小', width: 90, align: 'right', render: a => fmtBytes(a.size) }], rows: sel.artifacts || [], rowKey: a => a.path, empty: h(Empty, { icon: 'package', title: '无产物' }) }))) : null))
}

// 让运行记录页面可点选：RunsPage 内部自管 sel

// ---- 30-panel.js ----
// ============================================================================
// PDL 中台 · 会话右侧面板（轻量摘要，复杂表格仍回中央工作台）
// ============================================================================
function SidePanel({ onOpenCenter }) {
  const { data, loading, error, reload } = useAsync(() => apiCall('bootstrap'), [])
  const [batch, setBatch] = useState(null)
  useEffect(() => {
    if (data?.lastBatch) {
      apiCall('batch.get', { batchId: data.lastBatch.id }).then(v => setBatch(v)).catch(() => {})
    }
  }, [data?.lastBatch?.id])
  const latest = batch ? Object.values(batch.latestRunByStage || {}).filter(Boolean).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0] : null
  const pending = batch ? (batch.runs || []).flatMap(r => r.findings || []).filter(f => f.level === 'block' || f.level === 'warn').length : 0
  const step = batch?.batch?.step || 1
  return h('div', { className: 'pdl-side' },
    h('style', { 'data-pdl-center': 'side' }, CSS),
    h('header', { className: 'pdl-side-head' },
      h('div', { className: 'eyebrow' }, 'PDL 数据中台'),
      h('h2', {}, batch?.batch?.name || '批次工作台'),
      h('div', { style: { display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' } },
        h(Badge, { tone: latest ? runTone(latest) : 'neutral', icon: latest ? 'play' : 'clock' }, latest ? runLabel(latest) : '空闲'),
        h(Badge, { tone: 'outline' }, `步骤 ${step}/6`))),
    h('div', { className: 'pdl-side-body' },
      error ? h(Empty, { icon: 'alert', title: '连接失败', desc: error }) :
        loading ? h(Empty, { icon: 'refresh', title: '读取中…' }) :
          !batch ? h(Empty, { icon: 'layers', title: '还没有批次', desc: '在中央工作台新建批次后，这里会显示当前阶段与待处理问题。', action: h(Button, { variant: 'primary', size: 'sm', onClick: onOpenCenter }, '打开中台') }) :
            h(React.Fragment, null,
              h('div', { className: 'pdl-card', style: { boxShadow: 'none' } },
                h('div', { className: 'pdl-inspector-section' },
                  h('h3', {}, '当前阶段'),
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 9 } },
                    h(StatusDot, { status: latest?.status === 'running' ? 'running' : (latest?.outcome || 'idle') }),
                    h('b', { style: { fontSize: 13 } }, STEPS[Math.max(0, Math.min(5, step - 1))].title),
                    h('span', { style: { marginLeft: 'auto', fontSize: 11, color: 'var(--pdl-muted)' } }, latest ? fmtTime(latest.finishedAt || latest.startedAt) : '未运行')),
                  h('div', { style: { marginTop: 9 } }, h(Progress, { value: Math.round(step / 6 * 100) })))),
              h('div', { className: 'pdl-card', style: { boxShadow: 'none' } },
                h('div', { className: 'pdl-inspector-section' },
                  h('h3', {}, '待处理问题'),
                  pending ? h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                    h('strong', { style: { fontSize: 24, fontWeight: 650, color: 'var(--pdl-warn)' } }, pending),
                    h('span', { style: { fontSize: 11.5, color: 'var(--pdl-muted)' } }, '条需要核对'),
                    h('div', { style: { marginLeft: 'auto' } }, h(Button, { size: 'sm', variant: 'ghost', icon: 'eye', onClick: onOpenCenter }, '查看'))) :
                    h('div', { style: { fontSize: 12, color: 'var(--pdl-muted)' } }, '暂无待确认问题'))),
              h('div', { className: 'pdl-card', style: { boxShadow: 'none' } },
                h('div', { className: 'pdl-inspector-section' },
                  h('h3', {}, '最近产物'),
                  (batch.runs || []).slice(-3).reverse().map((r, i) => h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11.5 } },
                    h(Icon, { name: r.stage === 'scan' ? 'search' : r.stage === 'merge' ? 'table' : 'package', size: 12, style: { color: 'var(--pdl-muted)' } }),
                    h('span', { style: { flex: 1 } }, `${r.stage === 'scan' ? '扫描' : r.stage === 'merge' ? '汇总' : '导出'} · ${runLabel(r)}`),
                    h('span', { style: { color: 'var(--pdl-muted)', fontSize: 10.5 } }, `${r.artifacts?.length || 0} 件`))))))),
    h('footer', { className: 'pdl-side-foot' },
      h(Button, { variant: 'primary', block: true, icon: 'grid', onClick: onOpenCenter }, '打开中台'),
      h(Button, { block: true, icon: 'refresh', onClick: reload }, '刷新')))
}

// ---- 99-tail.js ----
// ============================================================================
// PDL 中台 · 应用外壳与 Slot 注册
// ============================================================================

const NAV = [
  { id: 'workbench', label: '批次工作台', icon: 'grid', group: '处理' },
  { id: 'packages', label: '资料包', icon: 'package', group: '处理' },
  { id: 'library', label: '参考库', icon: 'book', group: '复用' },
  { id: 'rules', label: '规则模板', icon: 'sliders', group: '复用' },
  { id: 'runs', label: '运行记录', icon: 'history', group: '追溯' },
]

const PAGE_META = {
  workbench: { eyebrow: 'BATCH WORKBENCH', title: '批次工作台' },
  packages: { eyebrow: 'PACKAGES', title: '资料包' },
  library: { eyebrow: 'REFERENCE LIBRARY', title: '参考库' },
  rules: { eyebrow: 'RULE TEMPLATES', title: '规则模板' },
  runs: { eyebrow: 'RUN RECORDS', title: '运行记录' },
}

function PdlApp() {
  const boot = useAsync(() => apiCall('bootstrap'), [])
  const [nav, setNav] = useState('workbench')
  const [activeBatchId, setActiveBatchId] = useState(null)
  const [draft, setDraft] = useState(false)
  const [addProject, setAddProject] = useState(false)
  const [projectRoot, setProjectRoot] = useState('')
  const [addingProject, setAddingProject] = useState(false)
  const detail = useAsync(() => activeBatchId ? apiCall('batch.get', { batchId: activeBatchId }) : Promise.resolve(null), [activeBatchId])

  const data = boot.data
  const project = data?.projects?.find(p => p.id === data.activeProjectId) || data?.projects?.[0] || null
  const pkg = detail.data?.package || null
  const batch = detail.data?.batch || null

  const openBatch = id => { setDraft(false); setActiveBatchId(id); setNav('workbench') }
  const goNav = id => { setNav(id); if (id !== 'workbench') { setActiveBatchId(null); setDraft(false) } }
  const newBatch = () => { setNav('workbench'); setActiveBatchId(null); setDraft(true) }
  const refresh = async () => { await boot.reload(); if (activeBatchId) await detail.reload() }

  if (boot.loading && !data) {
    return h('div', { className: 'pdl-app' }, h(Styles), h('div', { style: { margin: 'auto', textAlign: 'center', color: 'var(--pdl-muted)' } },
      h(Icon, { name: 'refresh', size: 22, className: 'pdl-spin' }), h('div', { style: { marginTop: 8, fontSize: 12 } }, '正在连接 PDL 引擎…')))
  }
  if (boot.error) {
    return h('div', { className: 'pdl-app' }, h(Styles), h('div', { style: { margin: 'auto', maxWidth: 480, textAlign: 'center' } },
      h(Icon, { name: 'alert', size: 26, style: { margin: '0 auto 10px', color: 'var(--pdl-danger)' } }),
      h('h2', { style: { margin: 0, fontSize: 16 } }, '无法连接 Host'),
      h('p', { style: { color: 'var(--pdl-muted)', fontSize: 12.5 } }, boot.error),
      h(Button, { variant: 'primary', icon: 'refresh', onClick: boot.reload }, '重试')))
  }

  const counts = {
    packages: data.counters?.packages, library: null, rules: data.templates?.length,
    runs: data.runs?.length, workbench: data.counters?.batches,
  }
  const groups = ['处理', '复用', '追溯']

  return h('div', { className: 'pdl-app' },
    h(Styles),
    h('nav', { className: 'pdl-nav' },
      h('div', { className: 'pdl-brand' },
        h('div', { className: 'pdl-brand-tile' }, h(Icon, { name: 'layers', size: 18, stroke: 1.9 })),
        h('div', {}, h('b', {}, 'PDL 数据中台'), h('small', {}, 'GEOEAST'))),
      groups.map(g => h(React.Fragment, { key: g },
        h('div', { className: 'pdl-nav-group' }, g),
        NAV.filter(n => n.group === g).map(n => h('button', {
          key: n.id, className: 'pdl-nav-item' + (nav === n.id ? ' active' : ''), onClick: () => goNav(n.id), title: n.label,
        }, h(Icon, { name: n.icon, size: 16 }), h('span', {}, n.label),
          counts[n.id] !== undefined && counts[n.id] !== null ? h('span', { className: 'pdl-nav-count' }, fmtInt(counts[n.id])) : null)))),
      h('div', { className: 'pdl-nav-foot' },
        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
          h('div', { style: { flex: 1, minWidth: 0 } },
            h(Select, {
              value: data.activeProjectId,
              onChange: async id => { try { await apiCall('project.select', { projectId: id }); await boot.reload() } catch (e) { toast(e.message, 'error') } },
              options: (data.projects || []).map(p => ({ value: p.id, label: p.name })),
            })),
          h(Button, { size: 'sm', icon: 'plus', title: '登记其它工程', onClick: () => setAddProject(true) })),
        h('div', { className: 'pdl-engine' }, h('span', { className: 'pdl-dot ' + (data.engine?.error ? 'danger' : 'success') }),
          h('span', {}, h('b', {}, data.engine?.error ? '引擎离线' : '引擎就绪'), h('div', { style: { fontSize: 10 } }, `Python ${data.engine?.adapter?.python || '—'} · ${data.engine?.commands?.length || 0} 命令`))))),
    h('main', { className: 'pdl-main' },
      h('header', { className: 'pdl-topbar' },
        h('div', { className: 'pdl-topbar-title' },
          h('div', { className: 'eyebrow' }, PAGE_META[nav]?.eyebrow || 'PDL'),
          h('h1', {}, batch && nav === 'workbench' ? batch.name : (PAGE_META[nav]?.title || 'PDL 中台'))),
        h(BindingBar, { project, pkg, batch })),
      nav === 'workbench'
        ? h(Workbench, { boot: data, detail: detail.data, activeBatchId, draft, onOpenBatch: openBatch, onCloseBatch: () => { setActiveBatchId(null); setDraft(false); refresh() }, onRefresh: refresh, onNav: id => id === 'new' ? newBatch() : goNav(id), onCreated: () => { setDraft(false) } })
        : nav === 'packages'
          ? h(PackagesPage, { boot: data, onRefresh: refresh, onOpenBatch: openBatch })
          : nav === 'library'
            ? h(LibraryPage, { boot: data, onRefresh: refresh })
            : nav === 'rules'
              ? h(RulesPage, { boot: data, onRefresh: refresh })
              : h(RunsPage, { boot: data, onOpenBatch: openBatch })),
    h(Modal, { open: addProject, title: '登记工程', onClose: () => setAddProject(false),
      footer: [
        h(Button, { key: 'c', onClick: () => setAddProject(false) }, '取消'),
        h(Button, { key: 's', variant: 'primary', loading: addingProject, onClick: async () => {
          setAddingProject(true)
          try { await apiCall('project.add', { root: projectRoot }); toast('工程已登记'); setAddProject(false); await boot.reload() }
          catch (e) { toast(e.message, 'error') } finally { setAddingProject(false) }
        } }, '登记'),
      ] },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h(Field, { label: '工程目录', hint: '需包含 config/project.yaml；登记后只读探测来源目录' },
          h(TextInput, { value: projectRoot, onChange: setProjectRoot, placeholder: 'D:\\path\\to\\project', mono: true })),
        h('div', { style: { fontSize: 11.5, color: 'var(--pdl-muted)', lineHeight: 1.7 } },
          '本插件只维护索引与界面偏好，业务真源仍在工程目录内。')))
    , h(ToastHost))
}

// better-sidebar 的标签组件 props：{ scope, tab, ... }
function SideTabHost(props) {
  const openCenter = () => {
    try { window.dispatchEvent(new CustomEvent('pdl-center:open')) } catch { /* ignore */ }
  }
  return h(SidePanel, { onOpenCenter: openCenter })
}

return {
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: 'pdl-center', order: 30,
      label: () => 'PDL 数据中台',
    }, SidebarIcon))

    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: 'pdl-center',
    }, PdlApp))

    // 原生右侧 tab 槽位（如果宿主有对应的 tab type）
    try {
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: 'pdl-center',
      }, SideTabHost))
    } catch (e) { /* 槽位不存在时忽略 */ }

    // better-sidebar：注册一个「PDL 数据中台」标签（可选依赖）
    try {
      const better = typeof ctx.get === 'function' ? ctx.get('betterSidebar') : (ctx.betterSidebar || null)
      if (better && typeof better.registerTab === 'function') {
        ctx.effect(() => better.registerTab({
          id: 'pdl-center',
          title: 'PDL 数据中台',
          description: '当前批次的阶段、待处理问题与最近产物',
          icon: h(SidebarIcon, { size: 18, active: false }),
          order: 40,
          single: true,
          component: SideTabHost,
        }), 'pdl-center: betterSidebar tab')
      }
    } catch (e) { /* 未安装 better-sidebar 时降级 */ }

    // 中央页面内「打开中台」的动作：监听来自右侧面板的事件
    try {
      const onOpen = () => {
        try { ctx.layout && ctx.layout.selectPanel && ctx.layout.selectPanel('pdl-center') } catch { /* ignore */ }
      }
      window.addEventListener('pdl-center:open', onOpen)
      ctx.effect(() => () => window.removeEventListener('pdl-center:open', onOpen), 'pdl-center: open listener')
    } catch (e) { /* ignore */ }
  },
}

  },
})
