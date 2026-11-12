# dsh-pdl-center

**PDL well data loading center** — a [DeepSeek Harness](https://github.com/deepseek-ai) plugin (dsh) that puts a batch workbench and a six-step wizard in front of the PDL engine, turning raw well data into GeoEast-ready load packages.

**PDL 井数据整理加载中台** —— DeepSeek Harness 插件：为 PDL 引擎提供批次工作台与六步向导，把原始井资料整理成 GeoEast 可直接导入的加载包。

> This plugin is a UI + orchestration layer. The actual data processing is done by a PDL engine (`pdl` package under `src/pdl` of your project directory), which the plugin drives through a thin Python adapter. You need a project that already contains that engine and its `config/project.yaml`.

## Features

- **Batch workbench** — projects, data packages, batches and runs in one place; each package/batch has a version and a fixed run identity.
- **Six-step wizard** — plan → execute → review → deliver, mapped onto the engine's `pdl-scan → pdl-merge → pdl-export` stages:
  1. create batch and output path
  2. resolve rules and bind a reference library
  3. scan and group files by well
  4. merge and check the three delivery tables (with Excel review detection)
  5. export pre-check (dry run)
  6. export and confirm delivery
- **Run records** — every run stores a frozen config snapshot and artifact digests, so a delivery confirmation is invalidated automatically when artifacts change.
- **Reference library & rule templates** — inspect and bind reference CSVs, review effective rule values with their source, and apply a template to a single run without rewriting project defaults.
- **Right-side session panel** — current stage, pending issues and recent artifacts beside the conversation.
- **Local state only** — the plugin keeps an index in `<project>/.pdl-center/state.json`; business data stays in the project's own `config/`, `work/` and `out/` directories.

## Requirements

- DeepSeek Harness with a web profile (the plugin registers a browser UI).
- Python 3.9+ on the machine, able to `import pdl` from `<projectRoot>/src`.
- A PDL project directory containing `config/project.yaml`.

## Install

From dsh-market (once listed) — search **dsh-pdl-center** and install.

Or from a terminal:

```sh
# prebuilt tarball attached to the GitHub release
dsh plugin --profile <profile> add https://github.com/ItLeLeYa/dsh-pdl-center/releases/download/v1.0.0/dsh-pdl-center-1.0.0.tgz

# or straight from source
dsh plugin --profile <profile> add github:ItLeLeYa/dsh-pdl-center
```

Restart `dsh web` (or refresh the page) after installing. The plugin appears as **PDL 数据中台** in the left sidebar and as a tab in the session's right panel.

## Configure

The bundle patch lives in [`cordis.patch.yml`](./cordis.patch.yml). Defaults are `python` (from `PATH`) and the host's working directory. Point it at your project by uncommenting the `config` block:

```yaml
- insert:
    - id: pdl-center
      name: dsh-pdl-center
      config:
        python: /path/to/python        # interpreter that can `import pdl`
        projectRoot: /path/to/pdl-project
```

`projectRoot` is also editable from the workbench UI; `python` is the interpreter the host spawns for the adapter.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.js` | Host half: persistent index, controlled executor, `/pdl-center/api/*` |
| `client.js` | Client half (built from `client-src/*.js`) |
| `client-src/` | UI fragments: design system, workbench, management pages, right panel, shell |
| `python/pdl_center_adapter.py` | Thin adapter: calls the PDL engine and returns one JSON envelope |
| `cordis.patch.yml` | Bundle patch inserted on install |
| `locale/*.json`, `icon.svg` | Display metadata and icon |
| `docs/` | API contract |

## Development

`client.js` is generated; edit `client-src/*.js` and rebuild:

```sh
node tools/build-client.mjs
```

## Limitations

- First version does not edit business rows in the UI; Excel review uses an external-edit → re-detect → pre-check loop.
- Batch queues and cross-batch diff enhancements are not included in this version.
- Physical import acceptance on the GeoEast side is recorded manually; the UI only shows "pending import".
- The right panel falls back to the native `sidebar.right.pane.tab` registration when `dsh-better-sidebar` is not installed.

## License

MIT © 2026 ItLeLeYa
