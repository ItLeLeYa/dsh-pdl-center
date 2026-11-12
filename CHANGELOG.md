# Changelog

## v1.0.0 — 2026-11-12

### Added

- First public release of `dsh-pdl-center`, a DeepSeek Harness plugin that wraps the PDL engine in a batch workbench and a six-step wizard (`pdl-scan → pdl-merge → pdl-export`).
- Batch workbench: projects, data packages, batches, runs, deliveries, reference libraries and rule templates with a persistent local index.
- Six-step wizard with plan preview, controlled execution, artifact review and delivery confirmation.
- Run records with frozen config snapshots and artifact digests; stale delivery confirmations are invalidated when artifacts change.
- Right-side session panel showing stage, pending issues and recent artifacts.
- Host API under `POST /pdl-center/api/<method>` and a thin Python adapter (`python/pdl_center_adapter.py`).
- English and Chinese locale metadata, original SVG icon.

### Packaging

- Installable bundle: `package.json` declares `dsh.bundle` + `dsh.client`; prebuilt client is committed, so installation needs no build step.
- Prebuilt release asset: `dsh-pdl-center-1.0.0.tgz`.
