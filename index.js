/**
 * PDL 井数据整理加载中台 —— Host 半边（Cordis 插件）。
 *
 * 职责：
 *  - 工程 / 资料包 / 批次 / 运行 / 参考库 / 规则模板的宿主持久化索引；
 *  - 受控执行器：只以白名单 argv 调用 Python 薄适配层，采集结构化结果与日志；
 *  - 产物校验、Excel 复核检测、交付确认的权威判定；
 *  - 通过 ctx.webServer 暴露同源 JSON API（POST /pdl-center/api/<method>）。
 *
 * 业务真源仍然在工程目录内：config/ 是规则唯一来源，work/<批次>/ 与 out/<批次>/
 * 是产物目录。本插件只维护索引、绑定与界面偏好。
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync, copyFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_PREFIX = '/pdl-center/api'
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const ADAPTER = join(PLUGIN_DIR, 'python', 'pdl_center_adapter.py')
const STATE_VERSION = 1

export const inject = ['webServer', 'connection']

// ------------------------------------------------------------------ 通用工具
const nowIso = () => new Date().toISOString()
const shortId = () => Math.random().toString(36).slice(2, 8)
const batchId = () => {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `B-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${shortId().slice(0, 4)}`
}
const runIdOf = stage => `RUN-${stage.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${shortId().slice(0, 4).toUpperCase()}`

function ensureDir(p) { mkdirSync(p, { recursive: true }); return p }

function readJsonFile(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fallback }
}

function writeJsonFile(p, value) {
  ensureDir(dirname(p))
  const tmp = `${p}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, p)
}

function sha1File(p, len = 16) {
  try {
    const h = createHash('sha1')
    h.update(readFileSync(p))
    return h.digest('hex').slice(0, len)
  } catch { return '' }
}

function safeStat(p) {
  try { const s = statSync(p); return { exists: true, isDir: s.isDirectory(), size: s.size, mtime: s.mtimeMs } } catch { return { exists: false, isDir: false, size: 0, mtime: 0 } }
}

function kindOf(name) {
  const e = extname(name).toLowerCase()
  if (e === '.csv') return 'csv'
  if (e === '.xlsx' || e === '.xls') return 'xlsx'
  if (e === '.html' || e === '.htm') return 'html'
  if (e === '.prn' || e === '.txt' || e === '.las') return 'prn'
  if (e === '.json') return 'json'
  if (e === '.log') return 'log'
  return 'other'
}

/** 递归列出目录下的文件（跳过 pdl-center 自身快照与临时文件）。 */
function walkFiles(root, { maxFiles = 5000 } = {}) {
  const out = []
  const stack = [root]
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop()
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const ent of entries) {
      const p = join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === 'pdl-center' || ent.name === '__pycache__' || ent.name === '.git') continue
        stack.push(p)
      } else if (ent.isFile()) {
        if (ent.name.endsWith('.tmp')) continue
        const st = safeStat(p)
        out.push({ path: p, rel: relative(root, p).split(sep).join('/'), name: ent.name, size: st.size, mtime: st.mtime, kind: kindOf(ent.name), sha1: '' })
        if (out.length >= maxFiles) break
      }
    }
  }
  return out
}

/** 只保留工程目录内的路径，防止 API 变成任意文件读取器。 */
function assertInside(root, target) {
  const r = resolve(root)
  const t = resolve(target)
  if (t !== r && !t.startsWith(r + sep)) throw new ApiError('forbidden', '路径不在工程目录内')
  return t
}

class ApiError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status }
}

function normaliseRoot(root) {
  if (typeof root !== 'string' || root.trim() === '') throw new ApiError('bad-request', '缺少工程目录')
  const p = resolve(root)
  if (!existsSync(p)) throw new ApiError('not-found', `工程目录不存在：${p}`)
  return p
}

// ------------------------------------------------------------------ 插件主体
export function apply(ctx, config) {
  const cfg = {
    python: config?.python || 'python',
    projectRoot: config?.projectRoot || process.cwd(),
  }

  const defaultRoot = normaliseRoot(cfg.projectRoot)
  const stateDir = join(defaultRoot, '.pdl-center')
  const stateFile = join(stateDir, 'state.json')

  // ---------- 持久化 ----------
  const blankState = () => ({
    version: STATE_VERSION,
    activeProjectId: '',
    projects: [],
    packages: [],
    batches: [],
    runs: [],
    deliveries: [],
    libraries: [],
    templates: [],
    prefs: {},
  })

  let state = readJsonFile(stateFile, null)
  if (!state || state.version !== STATE_VERSION) state = blankState()
  for (const key of ['projects', 'packages', 'batches', 'runs', 'deliveries', 'libraries', 'templates']) {
    if (!Array.isArray(state[key])) state[key] = []
  }
  if (!state.prefs || typeof state.prefs !== 'object') state.prefs = {}

  let saveTimer = null
  const save = () => {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      persist()
    }, 900)
  }
  const persist = () => {
    try {
      // 只持久化索引与最近日志：结果体可能很大，重放时按需重读 run.json
      const slim = {
        ...state,
        runs: state.runs.slice(-60).map(r => ({
          ...r,
          result: r.result ? {
            module: r.result.module,
            status: r.result.status,
            batch: r.result.batch,
            counts: r.result.counts || {},
            notes: (r.result.notes || []).slice(0, 20),
            outputs: [],
          } : null,
          findings: (r.findings || []).slice(0, 500),
          artifacts: (r.artifacts || []).slice(0, 400),
          events: (r.events || []).slice(-120),
          log: typeof r.log === 'string' ? r.log.slice(-40000) : '',
        })),
      }
      writeJsonFile(stateFile, slim)
    } catch (err) { console.error('[pdl-center] state save failed:', err && err.message) }
  }
  const saveNow = () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    persist()
  }

  const ensureDefaultProject = () => {
    if (state.projects.length > 0) return state.projects[0]
    const project = {
      id: 'P-' + shortId(),
      name: '当前工程',
      root: defaultRoot,
      sourceRoots: [],
      outputRoot: join(defaultRoot, 'out'),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    state.projects.push(project)
    state.activeProjectId = project.id
    saveNow()
    return project
  }
  ensureDefaultProject()
  if (!state.projects.some(p => p.id === state.activeProjectId)) state.activeProjectId = state.projects[0].id
  const activeProject = () => state.projects.find(p => p.id === state.activeProjectId) || state.projects[0]

  // 重启后：未完成的运行标记为「中断待检查」
  for (const run of state.runs) {
    if (['queued', 'running', 'cancelling', 'waiting'].includes(run.status)) {
      run.status = 'interrupted'
      run.outcome = run.outcome || ''
      run.finishedAt = run.finishedAt || nowIso()
      run.events = (run.events || []).concat([{ seq: (run.events?.at(-1)?.seq ?? 0) + 1, at: nowIso(), level: 'warn', text: '宿主重启，运行中断；请检查产物后重跑。' }])
    }
  }
  saveNow()

  // ---------- Python 适配层调用 ----------
  const probeCache = { at: 0, value: null, key: '' }

  function spawnAdapter(command, payload, { onStderr, onChild, signal } = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
      const projectRoot = payload.projectRoot || activeProject().root
      const env = {
        ...process.env,
        PYTHONPATH: [join(projectRoot, 'src'), process.env.PYTHONPATH].filter(Boolean).join(';'),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      }
      let child
      try {
        child = spawn(cfg.python, [ADAPTER, command], { cwd: projectRoot, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (err) {
        rejectPromise(new ApiError('python-spawn', `无法启动 Python：${err.message}`, 500))
        return
      }
      if (onChild) onChild(child)
      const out = []
      const errOut = []
      let settled = false
      const finish = (fn, arg) => { if (!settled) { settled = true; fn(arg) } }
      if (child.stdout) child.stdout.on('data', b => out.push(Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf8')))
      if (child.stderr) child.stderr.on('data', b => {
        const buf = Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf8')
        errOut.push(buf)
        if (onStderr) { try { onStderr(buf.toString('utf8')) } catch { /* 日志回调绝不允许影响主流程 */ } }
      })
      child.on('error', err => finish(rejectPromise, new ApiError('python-spawn', `Python 启动失败：${err.message}`, 500)))
      child.on('close', code => {
        try {
          const raw = Buffer.concat(out).toString('utf8').trim()
          const stderrText = Buffer.concat(errOut).toString('utf8')
          if (!raw) {
            finish(rejectPromise, new ApiError('adapter-empty', `适配层无输出（exit=${code}）${stderrText ? '：' + stderrText.slice(-800) : ''}`, 500))
            return
          }
          let envelope
          try { envelope = JSON.parse(raw) } catch (err) {
            finish(rejectPromise, new ApiError('adapter-json', `适配层输出不是 JSON：${raw.slice(0, 500)}`, 500))
            return
          }
          if (!envelope || envelope.ok !== true) {
            const e = envelope && envelope.error ? envelope.error : { code: 'adapter-error', message: 'adapter failed' }
            finish(rejectPromise, new ApiError(e.code || 'adapter-error', e.message || 'adapter failed', 500))
            return
          }
          finish(resolvePromise, envelope.data)
        } catch (err) {
          finish(rejectPromise, new ApiError('adapter-crash', `适配层结果处理失败：${err && err.message}`, 500))
        }
      })
      if (signal) {
        signal.addEventListener('abort', () => { try { child.kill() } catch { /* ignore */ } }, { once: true })
      }
      try {
        child.stdin.write(Buffer.from(JSON.stringify(payload), 'utf8'))
        child.stdin.end()
      } catch { /* child may have exited */ }
    })
  }

  const probe = async (projectRoot, { force = false } = {}) => {
    const key = resolve(projectRoot)
    if (!force && probeCache.value && probeCache.key === key && Date.now() - probeCache.at < 30000) return probeCache.value
    const value = await spawnAdapter('probe', { projectRoot: key })
    probeCache.at = Date.now(); probeCache.key = key; probeCache.value = value
    return value
  }

  // ---------- 运行管理 ----------
  const live = new Map() // runId -> { child, cancelRequested }
  const locks = new Map() // batchId -> runId

  const runView = run => ({
    id: run.id,
    batchId: run.batchId,
    stage: run.stage,
    attempt: run.attempt,
    status: run.status,
    outcome: run.outcome || '',
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
    exitCode: run.exitCode ?? null,
    progress: run.progress || null,
    result: run.result ? {
      module: run.result.module,
      status: run.result.status,
      batch: run.result.batch,
      counts: run.result.counts || {},
      notes: (run.result.notes || []).slice(0, 50),
      outputs: (run.result.outputs || []).slice(0, 200),
    } : null,
    findings: (run.findings || []).slice(0, 400),
    artifacts: (run.artifacts || []).slice(0, 600),
    log: typeof run.log === 'string' ? run.log.slice(-40000) : '',
    request: run.request || null,
    seq: run.events?.at(-1)?.seq ?? 0,
    configSnapshot: run.configSnapshot || null,
  })

  /** 列表/轮询用的轻量运行摘要（不携带 findings/artifacts 明细）。 */
  const runBrief = run => ({
    id: run.id,
    batchId: run.batchId,
    stage: run.stage,
    attempt: run.attempt,
    status: run.status,
    outcome: run.outcome || '',
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
    exitCode: run.exitCode ?? null,
    progress: run.progress || null,
    seq: run.events?.at(-1)?.seq ?? 0,
    findingsCount: (run.findings || []).length,
    artifactsCount: (run.artifacts || []).length,
    request: run.request || null,
    result: run.result ? { status: run.result.status, counts: run.result.counts || {} } : null,
  })

  const pushEvent = (run, text, level = 'info') => {
    if (!Array.isArray(run.events)) run.events = []
    const seq = (run.events.at(-1)?.seq ?? 0) + 1
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue
      run.events.push({ seq: (run.events.at(-1)?.seq ?? seq - 1) + 1, at: nowIso(), level, text: line.slice(0, 2000) })
    }
    if (run.events.length > 800) run.events.splice(0, run.events.length - 800)
    save()
  }

  function computeOutcome(result) {
    if (!result) return 'failed'
    const status = result.status || 'failed'
    if (status === 'ok') return 'ok'
    if (status === 'partial') return 'partial'
    if (status === 'blocked') return 'blocked'
    return 'failed'
  }

  /** 扫描阶段结构化结果里区分「部分可用」 */
  function deriveOutcome(stage, result, exitCode) {
    const base = computeOutcome(result)
    if (stage === 'export' && result && result.counts?.categories) {
      const pending = Object.values(result.counts.categories).reduce((n, c) => n + (Number(c?.pending) || 0), 0)
      if (pending > 0) return 'partial'
    }
    if (base === 'failed' && exitCode === 0) return 'ok'
    return base
  }

  async function startRun(batch, stage, options = {}, { dryRun = false } = {}) {
    if (locks.has(batch.id) && !dryRun) throw new ApiError('batch-locked', '该批次已有运行中的任务，请等待完成或取消', 409)
    const attempt = state.runs.filter(r => r.batchId === batch.id && r.stage === stage).length + 1
    const run = {
      id: runIdOf(stage),
      batchId: batch.id,
      stage,
      attempt,
      status: 'queued',
      outcome: '',
      startedAt: nowIso(),
      finishedAt: null,
      exitCode: null,
      progress: null,
      result: null,
      findings: [],
      artifacts: [],
      log: '',
      request: { stage, options, dryRun },
      events: [{ seq: 1, at: nowIso(), level: 'info', text: `已排队：${stage}${dryRun ? '（预检）' : ''}` }],
    }
    state.runs.push(run)
    saveNow()

    const project = activeProject()
    const payload = {
      projectRoot: project.root,
      batch: batch.id,
      stage,
      runId: run.id,
      options: { ...options, dryRun },
    }
    if (!dryRun) { locks.set(batch.id, run.id); run.status = 'running' }
    else run.status = 'running'
    saveNow()

    // 异步执行，不阻塞 HTTP 响应
    ;(async () => {
      try {
        pushEvent(run, `执行 pdl-${stage}${dryRun ? ' --dry-run' : ''} …`)
        const data = await spawnAdapter('stage.run', payload, {
          onStderr: text => pushEvent(run, text, 'stderr'),
          onChild: child => live.set(run.id, { child, cancelRequested: false }),
        })
        run.result = data.result || null
        run.artifacts = data.artifacts || []
        run.findings = (data.result?.findings || []).slice(0, 4000).map(f => ({
          code: f.code || '', level: f.level || 'info', module: f.module || stage,
          wellId: f.well_id || '', location: f.location || '', message: f.message || '', suggestion: f.suggestion || '',
        }))
        run.log = (data.log || '').slice(-200000)
        run.exitCode = data.exitCode ?? null
        run.finishedAt = data.finishedAt || nowIso()
        run.status = 'done'
        run.outcome = deriveOutcome(stage, data.result, run.exitCode)
        run.configSnapshot = data.configSnapshot || null
        if (Array.isArray(data.events)) for (const e of data.events) pushEvent(run, e.text || e, e.level || 'info')
        pushEvent(run, `完成：${run.outcome}（${run.findings.length} 条发现）`, run.outcome === 'ok' ? 'success' : 'warn')
        if (!dryRun) {
          const b = state.batches.find(x => x.id === batch.id)
          if (b) {
            b.updatedAt = nowIso()
            if (stage === 'scan' && b.step < 3) b.step = 3
            if (stage === 'merge' && b.step < 4) b.step = 4
            if (stage === 'export' && b.step < 6) b.step = 6
          }
        }
      } catch (err) {
        run.status = 'done'
        run.outcome = 'failed'
        run.finishedAt = nowIso()
        run.error = err.message
        pushEvent(run, `失败：${err.message}`, 'error')
      } finally {
        if (!dryRun) locks.delete(batch.id)
        live.delete(run.id)
        saveNow()
      }
    })()

    return runView(run)
  }

  // ---------- 参考库读取 ----------
  function parseCsv(text) {
    const rows = []
    let row = [], cell = '', quoted = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (quoted) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += ch
      } else if (ch === '"') quoted = true
      else if (ch === ',') { row.push(cell); cell = '' }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
      else if (ch !== '\r') cell += ch
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
    return rows.filter(r => r.some(c => c !== ''))
  }

  function readReferenceFiles(projectRoot) {
    const refDir = join(projectRoot, 'config', 'references')
    const read = name => {
      const p = join(refDir, name)
      const st = safeStat(p)
      if (!st.exists) return { name, path: p, exists: false, columns: [], rows: [], sha1: '' }
      const text = readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
      const table = parseCsv(text)
      const header = table[0] || []
      return {
        name, path: p, exists: true, columns: header,
        rows: table.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))),
        sha1: sha1File(p), bytes: st.size, mtime: st.mtime,
      }
    }
    return { ruZh: read('解释结论_俄中.csv'), zhCode: read('解释结论_中文GeoEast.csv') }
  }

  function libraryStats(ruZh, zhCode) {
    const ruRows = ruZh.rows || []
    const zhRows = zhCode.rows || []
    const ruCols = Object.keys(ruRows[0] || {})
    const zhCols = Object.keys(zhRows[0] || {})
    const ruKey = ruCols[0] || 'ru'
    const zhKey = ruCols[1] || ruCols[0] || 'zh'
    const codeNameKey = zhCols[0] || 'zh'
    const codeKey = zhCols[1] || zhCols[0] || 'code'
    const zhSet = new Set(zhRows.map(r => String(r[codeNameKey] || '').trim()).filter(Boolean))
    let missing = 0
    for (const r of ruRows) {
      const zh = String(r[zhKey] || '').trim()
      if (zh && !zhSet.has(zh)) missing++
    }
    const codes = new Set(zhRows.map(r => String(r[codeKey] || '').trim()).filter(Boolean))
    const total = ruRows.length + zhRows.length
    const coverage = total ? Math.round(((total - missing) / total) * 1000) / 10 : 0
    return {
      ruCount: ruRows.length, zhCount: zhRows.length, codeCount: codes.size,
      missingCode: missing, ambiguous: 0, coverage,
      columns: { ruZh: ruCols, zhCode: zhCols },
    }
  }

  // ---------- 规则解析 ----------
  const RULE_FIELDS = [
    { path: 'options.well_id_upper', label: '井号统一大写', stage: 'scan', value: true },
    { path: 'options.scan_organize', label: '整理布局', stage: 'scan', value: '按类别平铺，curves 保留一级子目录' },
    { path: 'options.scan_attachment_exts', label: '井目录附件类型', stage: 'scan', value: 'jpg/png/pdf/doc/docx/txt…' },
    { path: 'options.merge.well_id_conflict_policy', label: '井号冲突取值策略', stage: 'merge', value: 'file（按文件名）' },
    { path: 'options.td_tolerance_m', label: '井深容差（m）', stage: 'merge', value: 5.0 },
    { path: 'options.las_td_tolerance_m', label: 'LAS 井深容差（m）', stage: 'scan', value: 30 },
    { path: 'options.trajectory_algorithm', label: '井斜轨迹算法', stage: 'merge', value: 'minimum_curvature' },
    { path: 'export.encoding', label: 'PRN 编码', stage: 'export', value: 'utf-8' },
    { path: 'export.line_ending', label: '换行符', stage: 'export', value: 'CRLF' },
    { path: 'export.references.ru_zh', label: '俄中参考库', stage: 'export', value: 'references/解释结论_俄中.csv' },
    { path: 'export.references.zh_code', label: '中文代码库', stage: 'export', value: 'references/解释结论_中文GeoEast.csv' },
  ]

  const rulesCache = new Map()
  async function loadBaseRules(projectRoot) {
    const key = resolve(projectRoot)
    const hit = rulesCache.get(key)
    if (hit && Date.now() - hit.at < 60000) return hit.fields
    const data = await spawnAdapter('rules.resolve', { projectRoot: key })
    const fields = (data.fields || []).map(f => ({ path: f.path, label: f.label || f.path, value: f.value, source: f.source || '工程默认', stage: f.stage || 'all' }))
    rulesCache.set(key, { at: Date.now(), fields })
    return fields
  }

  async function resolveRules(batch) {
    const project = activeProject()
    let fields
    try { fields = await loadBaseRules(project.root) } catch (err) { fields = RULE_FIELDS.map(f => ({ ...f })) }
    fields = fields.map(f => ({ ...f }))
    if (batch) {
      const tpl = state.templates.find(t => t.id === batch.templateId)
      if (tpl && tpl.values) {
        for (const f of fields) {
          if (Object.prototype.hasOwnProperty.call(tpl.values, f.path)) { f.value = tpl.values[f.path]; f.source = '来自模板' }
          else if (f.source === '工程默认') f.source = '继承工程'
        }
      }
      if (batch.overrides) for (const f of fields) if (Object.prototype.hasOwnProperty.call(batch.overrides, f.path)) { f.value = batch.overrides[f.path]; f.source = '本包覆盖' }
    }
    return fields
  }

  // ---------- 业务方法 ----------
  const methods = {}
  const reg = (name, fn) => { methods[name] = fn }

  reg('ping', async () => ({
    plugin: 'dsh-pdl-center', version: '1.0.0',
    projectRoot: activeProject().root, python: cfg.python, time: nowIso(),
  }))

  reg('bootstrap', async () => {
    const project = activeProject()
    let engine = project.engine || null
    try {
      if (!engine || !(project.sourceRoots || []).length) {
        engine = await probe(project.root)
        project.engine = engine
      }
    } catch (err) { engine = engine || { error: err.message } }
    if (engine && Array.isArray(engine.sourceRoots)) {
      project.sourceRoots = engine.sourceRoots
      project.name = engine.project?.name || project.name
      project.outputRoot = engine.project?.outputRoot || project.outputRoot
      project.updatedAt = nowIso()
      save()
    }
    const projectId = project.id
    const projBatches = state.batches.filter(b => b.projectId === projectId)
    const projRuns = state.runs.filter(r => projBatches.some(b => b.id === r.batchId))
    const running = projRuns.filter(r => r.status === 'running' || r.status === 'queued').length
    const allFindings = projRuns.flatMap(r => (r.findings || []).map(f => ({ ...f, batchId: r.batchId, runId: r.id })))
    const pendingFindings = allFindings.filter(f => f.level === 'warn' || f.level === 'block')
    const lastBatch = [...projBatches].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null
    return {
      projects: state.projects,
      activeProjectId: state.activeProjectId,
      packages: state.packages,
      batches: state.batches,
      runs: state.runs.slice(-80).map(runView),
      templates: state.templates,
      prefs: state.prefs,
      engine,
      counters: {
        projects: state.projects.length,
        packages: state.packages.filter(p => p.projectId === projectId).length,
        batches: projBatches.length, running, pending: pendingFindings.length,
      },
      lastBatch,
      pendingProblems: pendingFindings.slice(-20).reverse(),
    }
  })

  reg('project.list', async () => ({ projects: state.projects, activeProjectId: state.activeProjectId }))
  reg('project.add', async p => {
    const root = normaliseRoot(p.root)
    const info = await probe(root, { force: true })
    let project = state.projects.find(x => resolve(x.root).toLowerCase() === root.toLowerCase())
    if (!project) {
      project = { id: 'P-' + shortId(), name: p.name || info.project?.name || '新建工程', root, sourceRoots: info.sourceRoots || [], outputRoot: info.project?.outputRoot || join(root, 'out'), engine: info, createdAt: nowIso(), updatedAt: nowIso() }
      state.projects.push(project)
    }
    state.activeProjectId = project.id
    saveNow()
    return { project }
  })
  reg('project.select', async p => {
    const project = state.projects.find(x => x.id === p.projectId)
    if (!project) throw new ApiError('not-found', '工程不存在', 404)
    state.activeProjectId = project.id
    saveNow()
    return { project }
  })

  reg('package.list', async p => ({ packages: state.packages.filter(x => !p.projectId || x.projectId === p.projectId) }))
  reg('package.create', async p => {
    const project = (p.projectId && state.projects.find(x => x.id === p.projectId)) || activeProject()
    const sources = (p.sourceRoots || []).map(s => resolve(s))
    if (!sources.length) throw new ApiError('bad-request', '资料包至少需要一个来源目录')
    for (const s of sources) if (!existsSync(s)) throw new ApiError('not-found', `来源目录不存在：${s}`)
    const pkg = {
      id: 'PKG-' + shortId(), projectId: project.id, name: p.name || '新资料包',
      kind: p.kind === 'supplement' ? 'supplement' : 'primary',
      note: p.note || '', version: 1, sourceRoots: sources,
      parentPackageId: p.parentPackageId || null,
      createdAt: nowIso(), updatedAt: nowIso(),
    }
    state.packages.push(pkg)
    saveNow()
    return { package: pkg }
  })
  reg('package.combine', async p => {
    const base = state.packages.find(x => x.id === p.baseId)
    const supplement = state.packages.find(x => x.id === p.supplementId)
    if (!base || !supplement) throw new ApiError('not-found', '原资料包或补交包不存在', 404)
    const pkg = {
      id: 'PKG-' + shortId(), projectId: base.projectId,
      name: p.name || `${base.name} + ${supplement.name}`,
      kind: 'primary', note: `组合版本：${base.name} v${base.version} + ${supplement.name} v${supplement.version}`,
      version: (state.packages.filter(x => x.parentPackageId === base.id).length) + 2,
      sourceRoots: [...base.sourceRoots, ...supplement.sourceRoots],
      parentPackageId: base.id,
      combinedFrom: { baseId: base.id, supplementId: supplement.id },
      createdAt: nowIso(), updatedAt: nowIso(),
    }
    state.packages.push(pkg)
    saveNow()
    return { package: pkg }
  })
  reg('package.get', async p => {
    const pkg = state.packages.find(x => x.id === p.packageId)
    if (!pkg) throw new ApiError('not-found', '资料包不存在', 404)
    return { package: pkg, versions: state.packages.filter(x => x.id === pkg.id || x.parentPackageId === pkg.id) }
  })

  reg('batch.list', async p => ({ batches: state.batches.filter(x => !p.projectId || x.projectId === p.projectId) }))
  reg('batch.create', async p => {
    const project = (p.projectId && state.projects.find(x => x.id === p.projectId)) || activeProject()
    const pkg = state.packages.find(x => x.id === p.packageId)
    if (!pkg) throw new ApiError('bad-request', '请选择资料包')
    const batch = {
      id: batchId(), projectId: project.id, packageId: pkg.id, packageVersion: pkg.version,
      name: p.name || `${pkg.name} · ${new Date().toLocaleDateString('zh-CN')}`,
      step: 1, sessionId: p.sessionId || '', outputSubdir: p.outputSubdir || '',
      templateId: p.templateId || null, overrides: {}, createdAt: nowIso(), updatedAt: nowIso(),
    }
    state.batches.push(batch)
    saveNow()
    return { batch }
  })
  reg('batch.get', async p => {
    const batch = state.batches.find(x => x.id === p.batchId)
    if (!batch) throw new ApiError('not-found', '批次不存在', 404)
    const pkg = state.packages.find(x => x.id === batch.packageId) || null
    const project = state.projects.find(x => x.id === batch.projectId) || activeProject()
    const runs = state.runs.filter(r => r.batchId === batch.id)
    const latestRunByStage = {}
    for (const r of runs) latestRunByStage[r.stage] = runView(r)
    const delivery = [...state.deliveries].reverse().find(d => d.batchId === batch.id) || null
    return { batch, package: pkg, project, runs: runs.map(runBrief), latestRunByStage, delivery, deliveryValid: delivery ? delivery.artifactDigest === computeArtifactDigest(batch.id) : false }
  })
  reg('batch.update', async p => {
    const batch = state.batches.find(x => x.id === p.batchId)
    if (!batch) throw new ApiError('not-found', '批次不存在', 404)
    if (p.step !== undefined) batch.step = Math.max(1, Math.min(6, Number(p.step) || 1))
    if (p.name) batch.name = p.name
    if (p.overrides) batch.overrides = { ...(batch.overrides || {}), ...p.overrides }
    if (p.templateId !== undefined) batch.templateId = p.templateId
    if (p.outputSubdir !== undefined) batch.outputSubdir = p.outputSubdir
    batch.updatedAt = nowIso()
    saveNow()
    return { batch }
  })

  function computeArtifactDigest(batchIdValue) {
    const runs = state.runs.filter(r => r.batchId === batchIdValue && r.artifacts?.length)
    const latest = runs.at(-1)
    if (!latest) return ''
    return createHash('sha1').update(latest.artifacts.map(a => `${a.rel}:${a.sha1}`).sort().join('|')).digest('hex').slice(0, 16)
  }

  /** 有效运行参数：模板 → 资料包覆盖 → 本次运行调整。 */
  const effectiveOptions = batch => {
    const tpl = state.templates.find(t => t.id === batch.templateId)
    return { ...(tpl?.values || {}), ...(batch.overrides || {}) }
  }

  reg('stage.plan', async p => {
    const batch = state.batches.find(x => x.id === p.batchId)
    if (!batch) throw new ApiError('not-found', '批次不存在', 404)
    const project = state.projects.find(x => x.id === batch.projectId) || activeProject()
    const data = await spawnAdapter('stage.plan', { projectRoot: project.root, batch: batch.id, stage: p.stage, options: { ...effectiveOptions(batch), ...(p.options || {}) } })
    return { plan: data }
  })

  reg('run.start', async p => {
    const batch = state.batches.find(x => x.id === p.batchId)
    if (!batch) throw new ApiError('not-found', '批次不存在', 404)
    const stage = p.stage
    if (!['scan', 'merge', 'export'].includes(stage)) throw new ApiError('bad-request', 'stage 必须是 scan/merge/export')
    const options = { ...effectiveOptions(batch), ...(p.options || {}) }
    const run = await startRun(batch, stage, options, { dryRun: Boolean(p.dryRun) })
    if (!p.dryRun) { batch.updatedAt = nowIso(); save() }
    return { run }
  })
  reg('run.get', async p => {
    const run = state.runs.find(r => r.id === p.runId)
    if (!run) throw new ApiError('not-found', '运行不存在', 404)
    return { run: runView(run) }
  })
  reg('run.list', async p => ({ runs: state.runs.filter(r => !p.batchId || r.batchId === p.batchId).map(runBrief) }))
  reg('run.poll', async p => {
    const run = state.runs.find(r => r.id === p.runId)
    if (!run) throw new ApiError('not-found', '运行不存在', 404)
    const after = Number(p.afterSeq) || 0
    const events = (run.events || []).filter(e => e.seq > after)
    const finished = run.status === 'done' || run.status === 'interrupted'
    return { run: finished ? runView(run) : runBrief(run), seq: run.events?.at(-1)?.seq ?? 0, events }
  })
  reg('run.cancel', async p => {
    const run = state.runs.find(r => r.id === p.runId)
    if (!run) throw new ApiError('not-found', '运行不存在', 404)
    const entry = live.get(run.id)
    if (!entry) {
      if (run.status === 'running' || run.status === 'queued') { run.status = 'interrupted'; saveNow() }
      return { run: runView(run) }
    }
    entry.cancelRequested = true
    run.status = 'cancelling'
    pushEvent(run, '收到取消请求，正在终止子进程树…', 'warn')
    try {
      const { execFile } = await import('node:child_process')
      execFile('taskkill', ['/pid', String(entry.child.pid), '/T', '/F'], { windowsHide: true }, () => { /* ignore */ })
    } catch { /* ignore */ }
    save()
    return { run: runView(run) }
  })

  reg('artifact.list', async p => {
    const batch = state.batches.find(x => x.id === p.batchId)
    if (!batch) throw new ApiError('not-found', '批次不存在', 404)
    const project = state.projects.find(x => x.id === batch.projectId) || activeProject()
    const dirMap = {
      scan: [join(project.root, 'out', batch.id, 'scan'), join(project.root, 'out', batch.id, '02-整理')],
      merge: [join(project.root, 'out', batch.id, '03-汇总')],
      export: [join(project.root, 'out', batch.id, '04-待导入')],
    }
    const dirsOf = stageName => dirMap[stageName] || []
    const wanted = p.stage ? [p.stage] : ['export', 'merge', 'scan']
    const artifacts = []
    const dirs = []
    const seen = new Set()
    for (const stageName of wanted) {
      for (const dir of dirsOf(stageName)) {
        if (!existsSync(dir)) continue
        dirs.push({ stage: stageName, path: dir, rel: relative(project.root, dir).split(sep).join('/') })
        for (const f of walkFiles(dir)) {
          if (seen.has(f.path)) continue
          seen.add(f.path)
          artifacts.push({ ...f, stage: stageName, sha1: sha1File(f.path) })
        }
      }
    }
    return { artifacts, dirs }
  })

  reg('artifact.preview', async p => {
    const project = activeProject()
    const target = assertInside(project.root, p.path)
    const st = safeStat(target)
    if (!st.exists) throw new ApiError('not-found', '文件不存在', 404)
    if (st.size > 8 * 1024 * 1024) throw new ApiError('too-large', '文件超过 8MB，请在 Excel 中打开', 413)
    const data = await spawnAdapter('artifact.preview', { projectRoot: project.root, path: target, sheet: p.sheet, limit: p.limit || 200 })
    return data
  })

  reg('review.detect', async p => {
    const batch = state.batches.find(x => x.id === p.batchId)
    if (!batch) throw new ApiError('not-found', '批次不存在', 404)
    const project = state.projects.find(x => x.id === batch.projectId) || activeProject()
    const lastMerge = [...state.runs].reverse().find(r => r.batchId === batch.id && r.stage === 'merge')
    const recorded = (lastMerge?.artifacts || []).filter(a => a.kind === 'xlsx')
    const changed = []
    let unchanged = 0
    for (const a of recorded) {
      const abs = join(project.root, ...String(a.rel).split('/'))
      const st = safeStat(abs)
      if (!st.exists) { changed.push({ rel: a.rel, recordedSha: a.sha1, currentSha: '', status: 'removed' }); continue }
      const cur = sha1File(abs, 16)
      if (cur !== a.sha1) changed.push({ rel: a.rel, recordedSha: a.sha1, currentSha: cur, status: 'changed' })
      else unchanged++
    }
    return { changed, summary: { total: recorded.length, changed: changed.length, unchanged, checkedAt: nowIso() } }
  })

  reg('delivery.confirm', async p => {
    const batch = state.batches.find(x => x.id === p.batchId)
    if (!batch) throw new ApiError('not-found', '批次不存在', 404)
    const run = state.runs.find(r => r.id === p.runId)
    if (!run) throw new ApiError('not-found', '运行不存在', 404)
    if (run.batchId !== batch.id) throw new ApiError('bad-request', '该运行不属于此批次', 400)
    if (run.stage !== 'export' || run.request?.dryRun) throw new ApiError('bad-request', '只有正式导出运行才能确认交付', 400)
    if (run.status !== 'done') throw new ApiError('run-not-done', '导出运行尚未结束，不能确认交付', 409)
    const pending = Number(run.result?.counts?.categories?.interp?.pending) || 0
    if (p.kind !== 'partial' && pending > 0) throw new ApiError('pending-required', `存在 ${pending} 条待确认，只能确认部分交付`, 409)
    const digest = computeArtifactDigest(batch.id)
    const lastRunDigest = createHash('sha1').update((run.artifacts || []).map(a => `${a.rel}:${a.sha1}`).sort().join('|')).digest('hex').slice(0, 16)
    if (lastRunDigest !== digest) throw new ApiError('stale-artifacts', '产物已变化，需重新执行导出后再确认交付', 409)
    const delivery = {
      id: 'DLV-' + shortId(), batchId: batch.id, runId: run.id,
      kind: p.kind === 'partial' ? 'partial' : 'full',
      note: p.note || '', confirmedAt: nowIso(), artifactDigest: digest,
      summary: run.result?.counts || {}, pendingCount: run.result?.counts?.categories?.interp?.pending || 0,
    }
    state.deliveries.push(delivery)
    batch.step = 6
    batch.updatedAt = nowIso()
    saveNow()
    return { delivery }
  })
  reg('delivery.list', async p => ({ deliveries: state.deliveries.filter(d => !p.batchId || d.batchId === p.batchId) }))

  reg('library.list', async () => {
    const project = activeProject()
    const refs = readReferenceFiles(project.root)
    const current = {
      id: 'LIB-CURRENT', name: '工程当前参考库', version: 'current', status: 'active',
      createdAt: '', publishedAt: '', note: '来自 config/references',
      stats: libraryStats(refs.ruZh, refs.zhCode),
      files: { ruZh: refs.ruZh.sha1, zhCode: refs.zhCode.sha1 },
    }
    return { libraries: [current, ...state.libraries], activeLibraryId: state.prefs.activeLibraryId || 'LIB-CURRENT', binding: project.libraryBinding || null }
  })
  reg('library.get', async p => {
    const project = activeProject()
    if (!p.libraryId || p.libraryId === 'LIB-CURRENT') {
      const refs = readReferenceFiles(project.root)
      return { library: { id: 'LIB-CURRENT', name: '工程当前参考库', version: 'current', status: 'active' }, entries: { ruZh: refs.ruZh.rows.slice(0, 500), zhCode: refs.zhCode.rows.slice(0, 500) }, columns: { ruZh: refs.ruZh.columns, zhCode: refs.zhCode.columns }, stats: libraryStats(refs.ruZh, refs.zhCode) }
    }
    const lib = state.libraries.find(x => x.id === p.libraryId)
    if (!lib) throw new ApiError('not-found', '参考库版本不存在', 404)
    return { library: lib, entries: { ruZh: (lib.ruZh || []).slice(0, 500), zhCode: (lib.zhCode || []).slice(0, 500) }, columns: lib.columns || { ruZh: [], zhCode: [] }, stats: lib.stats || {} }
  })
  reg('library.draft', async p => {
    const project = activeProject()
    const refs = readReferenceFiles(project.root)
    const base = p.libraryId && p.libraryId !== 'LIB-CURRENT' ? state.libraries.find(x => x.id === p.libraryId) : null
    const ruZh = p.patch?.ruZh || base?.ruZh || refs.ruZh.rows
    const zhCode = p.patch?.zhCode || base?.zhCode || refs.zhCode.rows
    const draft = {
      id: 'LIB-' + shortId(), name: p.name || `候选版本 ${state.libraries.length + 1}.0`,
      version: `${state.libraries.length + 1}.0`, status: 'draft',
      createdAt: nowIso(), publishedAt: '', note: p.note || '',
      ruZh, zhCode,
      columns: { ruZh: refs.ruZh.columns, zhCode: refs.zhCode.columns },
      stats: libraryStats({ rows: ruZh, columns: refs.ruZh.columns }, { rows: zhCode, columns: refs.zhCode.columns }),
      baseId: base?.id || 'LIB-CURRENT',
    }
    state.libraries.push(draft)
    saveNow()
    return { library: draft }
  })
  reg('library.publish', async p => {
    const lib = state.libraries.find(x => x.id === p.libraryId)
    if (!lib) throw new ApiError('not-found', '参考库版本不存在', 404)
    lib.status = 'published'
    lib.publishedAt = nowIso()
    saveNow()
    return { library: lib }
  })
  reg('library.diff', async p => {
    const get = id => {
      if (!id || id === 'LIB-CURRENT') {
        const refs = readReferenceFiles(activeProject().root)
        return { ruZh: refs.ruZh.rows, zhCode: refs.zhCode.rows }
      }
      const lib = state.libraries.find(x => x.id === id)
      return { ruZh: lib?.ruZh || [], zhCode: lib?.zhCode || [] }
    }
    const a = get(p.fromId), b = get(p.toId)
    const keyRows = rows => new Set((rows || []).map(r => JSON.stringify(r)))
    const aSet = keyRows(a.ruZh), bSet = keyRows(b.ruZh)
    const added = [...bSet].filter(x => !aSet.has(x)).map(x => JSON.parse(x)).slice(0, 200)
    const removed = [...aSet].filter(x => !bSet.has(x)).map(x => JSON.parse(x)).slice(0, 200)
    return { added, removed, changed: [], summary: { added: added.length, removed: removed.length } }
  })
  reg('library.apply', async p => {
    const lib = state.libraries.find(x => x.id === p.libraryId)
    if (!lib) throw new ApiError('not-found', '参考库版本不存在', 404)
    if (lib.status !== 'published') throw new ApiError('not-published', '候选版本尚未发布，不能应用到工程', 409)
    const project = activeProject()
    const refDir = join(project.root, 'config', 'references')
    const backup = join(project.root, '.pdl-center', 'backup', `refs-${Date.now()}`)
    ensureDir(backup)
    const writeCsv = (file, rows, columns) => {
      const cols = columns && columns.length ? columns : Object.keys(rows[0] || {})
      const esc = v => {
        const s = String(v ?? '')
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
      }
      const text = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n')
      writeFileSync(file, '\uFEFF' + text, 'utf8')
    }
    const ruFile = join(refDir, '解释结论_俄中.csv')
    const zhFile = join(refDir, '解释结论_中文GeoEast.csv')
    if (existsSync(ruFile)) copyFileSync(ruFile, join(backup, '解释结论_俄中.csv'))
    if (existsSync(zhFile)) copyFileSync(zhFile, join(backup, '解释结论_中文GeoEast.csv'))
    writeCsv(ruFile, lib.ruZh || [], lib.columns?.ruZh)
    writeCsv(zhFile, lib.zhCode || [], lib.columns?.zhCode)
    project.libraryBinding = { libraryId: lib.id, name: lib.name, version: lib.version, appliedAt: nowIso(), backup }
    saveNow()
    return { binding: project.libraryBinding }
  })

  reg('rules.list', async () => ({ templates: state.templates, effective: await resolveRules(null) }))
  reg('rules.save', async p => {
    if (!p.name) throw new ApiError('bad-request', '模板需要名称')
    let tpl = p.templateId ? state.templates.find(x => x.id === p.templateId) : null
    if (!tpl) { tpl = { id: 'TPL-' + shortId(), createdAt: nowIso() }; state.templates.push(tpl) }
    tpl.name = p.name
    tpl.stage = p.stage || 'all'
    tpl.values = p.values || {}
    tpl.updatedAt = nowIso()
    saveNow()
    return { template: tpl }
  })
  reg('rules.delete', async p => {
    const i = state.templates.findIndex(x => x.id === p.templateId)
    if (i >= 0) state.templates.splice(i, 1)
    saveNow()
    return { ok: true }
  })
  reg('rules.resolve', async p => {
    const batch = p.batchId ? state.batches.find(x => x.id === p.batchId) : null
    return { fields: await resolveRules(batch) }
  })

  reg('files.stat', async p => {
    const project = activeProject()
    const target = assertInside(project.root, p.path)
    const st = safeStat(target)
    let count = 0, bytes = 0
    if (st.isDir) for (const f of walkFiles(target, { maxFiles: 20000 })) { count++; bytes += f.size }
    return { ...st, path: target, count, bytes }
  })
  reg('files.listDir', async p => {
    const project = activeProject()
    const target = assertInside(project.root, p.path || project.root)
    const st = safeStat(target)
    if (!st.exists || !st.isDir) throw new ApiError('not-found', '目录不存在', 404)
    const entries = readdirSync(target, { withFileTypes: true }).map(ent => {
      const full = join(target, ent.name)
      const s = safeStat(full)
      return { name: ent.name, path: full, isDir: ent.isDirectory(), size: s.size, mtime: s.mtime }
    }).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, 'zh-CN'))
    return { entries, path: target }
  })

  reg('demo.seed', async () => {
    const project = activeProject()
    const info = await probe(project.root, { force: true })
    project.sourceRoots = info.sourceRoots || project.sourceRoots
    save()
    return { ok: true, sourceRoots: project.sourceRoots }
  })

  // ---------- HTTP 路由 ----------
  const sendJson = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  const readBody = req => new Promise((resolvePromise, rejectPromise) => {
    const chunks = []
    let size = 0
    req.on('data', c => {
      try {
        const buf = Buffer.isBuffer(c) ? c : Buffer.from(String(c), 'utf8')
        size += buf.length
        if (size > 4 * 1024 * 1024) { rejectPromise(new ApiError('too-large', '请求体过大', 413)); req.destroy(); return }
        chunks.push(buf)
      } catch (err) { rejectPromise(new ApiError('bad-body', `读取请求体失败：${err && err.message}`)) }
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim()
        if (!raw) { resolvePromise({}); return }
        resolvePromise(JSON.parse(raw))
      } catch (err) { rejectPromise(new ApiError('bad-json', '请求体不是 JSON')) }
    })
    req.on('error', err => rejectPromise(new ApiError('bad-body', String(err && err.message))))
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      if (ctx.connection.requestRejection(req) !== undefined) { sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } }); return }
      if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: { code: 'method', message: 'method not allowed' } }); return }
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const method = url.pathname.startsWith(API_PREFIX + '/') ? decodeURIComponent(url.pathname.slice(API_PREFIX.length + 1)) : ''
      const fn = Object.prototype.hasOwnProperty.call(methods, method) ? methods[method] : null
      if (typeof fn !== 'function') { sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown method "${method}"` } }); return }
      try {
        const payload = await readBody(req)
        const value = await fn(payload)
        sendJson(res, 200, { ok: true, value })
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 500
        sendJson(res, status, { ok: false, error: { code: err.code || 'internal', message: err.message || String(err) } })
      }
    },
  }), 'pdl-center: /pdl-center/api')

  // 插件卸载时：终止仍在运行的子进程
  ctx.effect(() => () => {
    saveNow()
    for (const [, entry] of live) { try { entry.child.kill() } catch { /* ignore */ } }
    live.clear()
  }, 'pdl-center: run cleanup')

  ctx.effect(() => () => { saveNow() }, 'pdl-center: state save')

  console.log(`[pdl-center] ready — project=${defaultRoot} python=${cfg.python}`)
}
