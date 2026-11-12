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
