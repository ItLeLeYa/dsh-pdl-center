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
