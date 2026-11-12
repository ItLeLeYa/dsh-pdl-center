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
