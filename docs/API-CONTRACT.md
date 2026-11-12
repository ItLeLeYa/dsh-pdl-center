# PDL 中台 · 实现契约（V1 基线，冻结）

> 本文是 Host / Client / Python 适配层三方共同遵守的接口契约。改动必须同步三方。
> 业务真源：`config/`（规则唯一来源）、`work/<批次>/`、`out/<批次>/`。插件只维护索引与界面偏好。

## 0. 术语

| 对象 | 字段 | 说明 |
| --- | --- | --- |
| Project | `id, name, root, sourceRoots[], outputRoot, createdAt, updatedAt` | 工程；`root` 是含 `config/project.yaml` 的目录 |
| Package | `id, projectId, name, kind('primary'\|'supplement'), note, version, parentPackageId?, sourceRoots[], createdAt, updatedAt` | 资料包；`version` 从 1 起 |
| Batch | `id, projectId, packageId, packageVersion, name, step(1-6), createdAt, updatedAt, sessionId?, outputSubdir?` | 批次；`id` 形如 `B-YYYYMMDD-HHMMSS` |
| Run | `id, batchId, stage('scan'\|'merge'\|'export'\|'plan'), status, attempt, startedAt, finishedAt?, exitCode?, result?, findings[], artifacts[], log?, request` | 一次执行 |
| Delivery | `id, batchId, runId, kind('full'\|'partial'), confirmedAt, summary, pendingCount, artifactDigest` | 交付确认 |

**四类状态分开存储**（不得合并成一个 status）：
- `execution`: `queued | running | waiting | cancelling | done | interrupted | failed`
- `outcome`: `ok | partial | blocked | failed | cancelled | ''`
- `review`: `pending | clean`
- `delivery`: `none | partial-confirmed | full-confirmed`

## 1. Host API（浏览器 ⇄ Host）

- 传输：同源 `POST /pdl-center/api/<method>`，JSON body，响应 `{ok:true,value}` 或 `{ok:false,error:{code,message}}`。
- 路由：`ctx.webServer.register({kind:'prefix', path:'/pdl-center/api'})`。
- 安全栅栏：`ctx.connection.requestRejection(req) === undefined`，否则 403。
- Client 解析：`new URL('pdl-center/api/<method>', document.baseURI)`。
- 运行事件轮询：`run.poll` 返回 `{run, seq, events:[{seq,at,level,text}]}`；`afterSeq` 参数增量拉取。

### 1.1 方法表

| method | 入参 | 出参 |
| --- | --- | --- |
| `ping` | `{}` | `{plugin,version,projectRoot,python,time}` |
| `bootstrap` | `{sessionId?}` | `{projects, activeProjectId, batches, runs, packages, prefs, counters:{projects,packages,batches,running,pending}, lastBatch?, pendingProblems[]}` |
| `project.list` | `{}` | `{projects, activeProjectId}` |
| `project.add` | `{root, name?}` | `{project}`（探测 `config/project.yaml`，失败抛错） |
| `project.select` | `{projectId}` | `{project}` |
| `package.list` | `{projectId?}` | `{packages}` |
| `package.create` | `{projectId, name, kind, sourceRoots[], note?}` | `{package}` |
| `package.combine` | `{baseId, supplementId, name?}` | `{package}`（生成原包的新组合版本） |
| `package.get` | `{packageId}` | `{package, versions[]}` |
| `batch.list` | `{projectId?}` | `{batches}` |
| `batch.create` | `{projectId, packageId, name?, sessionId?, outputSubdir?}` | `{batch}` |
| `batch.get` | `{batchId}` | `{batch, package, project, runs[], latestRunByStage, delivery}` |
| `batch.update` | `{batchId, step?, name?}` | `{batch}` |
| `stage.plan` | `{batchId, stage, options?}` | `{plan}`（见 1.2） |
| `run.start` | `{batchId, stage, options?}` | `{run}`（异步；立即返回） |
| `run.get` | `{runId}` | `{run}` |
| `run.list` | `{batchId?}` | `{runs}` |
| `run.poll` | `{runId, afterSeq?}` | `{run, seq, events[]}` |
| `run.cancel` | `{runId}` | `{run}` |
| `artifact.list` | `{batchId, stage?}` | `{artifacts:[{path,rel,name,size,mtime,sha1,kind}], dirs[]}` |
| `artifact.preview` | `{path, sheet?, limit?}` | `{kind:'table'\|'text'\|'binary', columns[], rows[][], total, sheetNames[], text?}` |
| `review.detect` | `{batchId}` | `{changed:[{rel,path,recordedSha,currentSha}], summary}` |
| `delivery.confirm` | `{batchId, runId, kind, note?}` | `{delivery}` |
| `delivery.list` | `{batchId?}` | `{deliveries}` |
| `library.list` | `{projectId?}` | `{libraries, activeLibraryId, binding}` |
| `library.get` | `{libraryId}` | `{library, entries:{ruZh[],zhCode[]}, stats}` |
| `library.draft` | `{libraryId?, patch}` | `{library}`（生成候选版本，不发布） |
| `library.publish` | `{libraryId}` | `{library}` |
| `library.diff` | `{fromId, toId}` | `{added[],removed[],changed[]}` |
| `rules.list` | `{projectId?}` | `{templates, effective}` |
| `rules.save` | `{templateId?, name, stage, values}` | `{template}` |
| `rules.delete` | `{templateId}` | `{ok:true}` |
| `rules.resolve` | `{batchId?}` | `{fields:[{path,label,value,source,stage}]}` |
| `files.stat` | `{path}` | `{exists,isDir,size,count,mtime}` |
| `files.listDir` | `{path}` | `{entries:[{name,path,isDir,size}]}` |
| `demo.seed` | `{}` | `{ok:true}` |

### 1.2 `stage.plan` 返回

```jsonc
{
  "stage": "scan",
  "batchId": "B-…",
  "title": "扫描归井",
  "inputs": [{"label":"原始资料目录","path":"…","exists":true}],
  "outputs": [{"label":"整理目录","path":"out/<批次>/02-整理","exists":false}],
  "estimates": {"files": 1280, "bytes": 943718400, "wells": 53, "categories": {"curves": 610}},
  "warnings": [{"level":"warn","text":"输出目录已存在同名文件 3 个"}],
  "effectiveConfig": [{"path":"options.well_id_upper","value":true,"source":"工程默认"}],
  "canRun": true,
  "blockers": []
}
```

### 1.3 `run` 形状

```jsonc
{
  "id":"RUN-…","batchId":"B-…","stage":"scan","attempt":1,
  "status":"running",            // execution
  "outcome":"",                  // ok|partial|blocked|failed|cancelled
  "startedAt":"ISO","finishedAt":null,"exitCode":null,
  "progress":{"phase":"扫描中","processed":320,"total":1280,"unit":"文件"},
  "result":{...ModuleResult.as_dict()},
  "findings":[{"code":"R-03","level":"warn","module":"scan","wellId":"","location":"","message":"","suggestion":""}],
  "artifacts":[{"path":"","rel":"","name":"","size":0,"mtime":0,"sha1":"","kind":"csv|xlsx|html|prn|json|log"}],
  "log":"最近 200 行文本",
  "request":{"stage":"scan","options":{}}
}
```

约定：
- `status='running'` 时 Client 每 900ms 轮询 `run.poll`。
- `outcome` 只在执行结束后写入；`export` 的 `partial` 必须由结构化 `result.counts.categories.interp.pending > 0` 判定，**不得只看退出码**。
- 任何阶段产物变化都要使旧 `delivery` 失效（`artifactDigest` 不符即 `delivery='none'`）。

## 2. Python 适配层（Host ⇄ Python）

- 文件：`pdl-dsh-plugin/python/pdl_center_adapter.py`
- 调用：`<python> pdl_center_adapter.py <command>`，stdin 是 JSON 请求，stdout 只输出**一个** JSON 信封：
  - `{"ok": true, "data": …}` / `{"ok": false, "error": {"code","message","detail"}}`
  - 所有日志写 stderr（UTF-8），不得混入 stdout。
- 环境：`PYTHONPATH` 需含 `<projectRoot>/src`；`PYTHONIOENCODING=utf-8`；cwd = `projectRoot`。
- 只允许以下命令：`probe`, `batch.list`, `stage.plan`, `stage.run`, `artifact.list`, `artifact.preview`, `review.detect`, `reference.info`, `rules.resolve`, `demo.info`。

### 2.1 `stage.run`

请求：
```jsonc
{"projectRoot":"/path/to/project","batch":"B-…","stage":"scan",
 "runId":"RUN-…",
 "options":{"copyMode":"copy","extraKeywords":[],"only":["layers"],"dryRun":false}}
```
行为：
1. `ProjectConfig.load(<root>/config/project.yaml)`；`RunContext(root, batch, dry_run, verbose)`。
2. 应用白名单覆盖（`apply_overrides`）：只允许
   `options.well_id_upper`、`options.td_tolerance_m`、`options.las_td_tolerance_m`、
   `options.trajectory_algorithm`、`options.scan_organize`、`options.scan_attachment_exts`、
   `options.merge.well_id_conflict_policy`、`export.encoding`、`export.line_ending`，
   以及 `extraKeywords`（仅 scan）。白名单外一律忽略并记 warning，**不得**改工程配置文件。
3. 冻结快照到 `work/<batch>/pdl-center/<runId>/config-snapshot.json`：
   `{runId,batch,stage,at,projectRoot,effective:{…},files:[{path,sha256,size}],options}`。
4. 调用同源业务模块：
   - `scan`: `from pdl.scan import run_scan` → `run_scan(cfg, rc, extra_keywords=…, copy_mode=…)`
   - `merge`: `from pdl.merge import run_merge` → `run_merge(cfg, rc, input_dir=…, output_dir=…, only=…)`
   - `export`: `from pdl.export import run_export` → `run_export(cfg, rc, input_dir=…, output_dir=…, only=…)`
5. 产物清单：遍历该阶段输出目录（scan→`out/<b>/scan` 与 `out/<b>/02-整理`；merge→`out/<b>/03-汇总`；export→`out/<b>/04-待导入`），
   返回 `{path,rel,name,size,mtime,sha1,kind}`，`sha1` 取前 16 位。
6. 写 `work/<batch>/pdl-center/<runId>/run.json`（同返回体）。
7. 返回 `{runId, result, artifacts, log, startedAt, finishedAt, exitCode}`。

`dryRun=true` 时必须走 `rc.dry_run=True`，不写业务产物，只返回计划与计数。

### 2.2 `stage.plan`

- scan：遍历 `cfg.source_roots`，统计文件数/字节数/扩展名分布/井号目录数；检查 `out/<b>/02-整理` 是否已存在。
- merge：统计 `out/<b>/02-整理/{layers,interp,deviation}` 下文件数。
- export：统计 `out/<b>/03-汇总/*.xlsx` 与行数（openpyxl read_only）。
- 返回 1.2 结构。

## 3. 客户端信息架构

- 左侧 `sidebar.panellist`：id `pdl-center`，order 30，label「PDL 数据中台」。
- 中央 `main` keyed `pdl-center`：完整工作台。
- 会话右侧：`betterSidebar.registerTab`（若服务存在，可选注入）id `pdl-center`，单实例。
- 工作台内部导航（左侧第二条竖向导航，Shadcn 风格）：
  `批次工作台 / 资料包 / 参考库 / 规则模板 / 运行记录`。
- 批次工作台：顶部工程-资料包-批次绑定条 → 三阶段轨道（扫描·汇总·导出）→ 六步向导 → 中部结果区 + 右侧检查器 → 底部固定操作栏。

## 4. 六步 ↔ 三阶段映射

| 步 | 标题 | 阶段 | 主操作 |
| --- | --- | --- | --- |
| 01 | 建批与路径 | — | 选择资料包、输出子目录，预览路径与复制量 |
| 02 | 规则与参考库预检 | — | 模板/覆盖/参考库绑定，展示生效值与来源 |
| 03 | 扫描归井 | scan | 预览计划 → 执行 `pdl-scan` → 分类/异常下钻 |
| 04 | 汇总核对 | merge | 生成三张汇总表 → Excel 复核检测 → 重跑保护 |
| 05 | 转码预检 | export(dry-run) | 输入/可导出/待确认数与原因 |
| 06 | 导出交付 | export | 生成 PRN/报告/清单 → 完整或部分交付确认 |

## 5. 视觉规范

- 只用 `--dsw-alias-*` 主题 token（附字面量兜底），不写死背景/文字色。
- 主色靛蓝 `#4F46E5`；成功青绿 `#0D9488`；待确认琥珀 `#D97706`；阻断玫红 `#E11D48`。
- 字体：`"Inter","PingFang SC","Microsoft YaHei",system-ui`；数字 `font-variant-numeric: tabular-nums`。
- 圆角：卡片 14px，控件 9px，标签 999px。间距基数 4。
- 状态必须「文字 + 图标」双编码，不能只靠颜色。
- 动效只用于执行反馈与区域切换（120–220ms ease-out）。
