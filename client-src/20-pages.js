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
