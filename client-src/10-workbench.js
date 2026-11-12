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

