#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDL Center 薄 Python 适配层。

供 DSH 插件 Host 半边以子进程方式调用：``python pdl_center_adapter.py <command>``。
stdin 读一个 JSON 请求，stdout 只写一个 JSON 信封；所有日志写 stderr。

约束：
- Python 3.9（不使用 match / ``X | Y`` 注解等 3.10+ 语法）
- 只新增本文件，不修改 src/pdl 下任何业务代码
- 业务规则仍以 config/ 为唯一来源；本层只在内存中应用白名单覆盖，绝不写 config/
"""
from __future__ import annotations

import copy
import csv
import hashlib
import io
import json
import logging
import math
import os
import re
import sys
import traceback
from collections import Counter
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

ADAPTER_VERSION = "1.0.0"
DEFAULT_PREVIEW_LIMIT = 200
MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024
MAX_ARTIFACTS = 50000
HASH_CHUNK = 4 * 1024 * 1024

#: 适配层自身所在工程根（pdl-dsh-plugin/python/ 向上两级）
ADAPTER_ROOT = Path(__file__).resolve().parents[2]

SKIP_DIR_NAMES = {
    "__pycache__", ".git", ".svn", ".hg", ".idea", "__macosx",
    "$recycle.bin", "node_modules",
}
SKIP_FILE_PREFIXES = ("~$", ".~lock")
TEXT_EXTS = (".txt", ".prn", ".log", ".las", ".md", ".ini", ".csv")
TABLE_EXTS = (".xlsx", ".xlsm", ".xls")


class AdapterError(Exception):
    """可预期的适配层错误（请求非法、文件不存在等）。"""


# ------------------------------------------------------------------ 基础工具
def _json_safe(value: Any) -> Any:
    """把 Path/日期/Decimal/NaN 等转成 JSON 安全值。"""
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_json_safe(v) for v in value]
    return str(value)


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _write_envelope(envelope: Dict[str, Any]) -> None:
    """向 stdout 写唯一一个 UTF-8 JSON 信封（不依赖控制台编码）。"""
    text = json.dumps(_json_safe(envelope), ensure_ascii=False)
    payload = (text + "\n").encode("utf-8")
    buffer = getattr(sys.stdout, "buffer", None)
    if buffer is not None:
        buffer.write(payload)
        buffer.flush()
    else:  # pragma: no cover - 仅极端环境
        sys.stdout.write(text + "\n")
        sys.stdout.flush()


def _configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _decode_bytes(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gbk", "cp1251", "utf-16"):
        try:
            return raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("utf-8", errors="replace")


def _decode_text_preview(raw: bytes) -> str:
    """预览文本解码：截断点可能落在多字节字符中间，先按 UTF-8 微调尾部。"""
    for trim in (0, 1, 2, 3):
        candidate = raw[:len(raw) - trim] if trim else raw
        try:
            return candidate.decode("utf-8-sig")
        except UnicodeDecodeError:
            continue
    return _decode_bytes(raw)


def _bootstrap_pdl(project_root: Path) -> None:
    """把 <projectRoot>/src 插到 sys.path[0]。

    对插件自带的独立工程也兼容：若目标工程没有 src（例如 tmp 测试工程），
    回落到适配层所在工程根下的 src。
    """
    candidates = [Path(project_root) / "src", ADAPTER_ROOT / "src"]
    for candidate in candidates:
        if candidate.is_dir():
            src = str(candidate.resolve())
            while src in sys.path:
                sys.path.remove(src)
            sys.path.insert(0, src)
            return
    # 兼容已通过 PYTHONPATH 安装 pdl 的场景
    try:
        import pdl  # noqa: F401
        return
    except Exception:
        raise AdapterError("未找到 pdl 源码目录（%s/src）" % project_root)


def _project_root(payload: Dict[str, Any]) -> Path:
    raw = payload.get("projectRoot") or payload.get("project_root")
    if not raw:
        raise AdapterError("缺少 projectRoot")
    root = Path(str(raw)).expanduser()
    if not root.is_absolute():
        root = Path.cwd() / root
    root = root.resolve()
    if not root.is_dir():
        raise AdapterError("工程目录不存在：%s" % root)
    _bootstrap_pdl(root)
    return root


def _load_config(root: Path):
    from pdl.config import ProjectConfig

    config_path = root / "config" / "project.yaml"
    if not config_path.exists():
        raise AdapterError("工程缺少 config/project.yaml：%s" % config_path)
    try:
        return ProjectConfig.load(str(config_path))
    except Exception as exc:  # noqa: BLE001 - 转成适配层错误
        raise AdapterError("加载工程配置失败：%s" % exc)


def _require_batch(payload: Dict[str, Any]) -> str:
    batch = str(payload.get("batch") or payload.get("batchId") or "").strip()
    if not batch:
        raise AdapterError("缺少 batch")
    _validate_component(batch, "batch")
    return batch


def _require_stage(payload: Dict[str, Any]) -> str:
    stage = str(payload.get("stage") or "").strip().lower()
    if stage not in ("scan", "merge", "export"):
        raise AdapterError("stage 必须是 scan / merge / export，收到：%s" % stage)
    return stage


def _validate_component(value: str, label: str) -> None:
    if not value or value in (".", ".."):
        raise AdapterError("%s 非法：%s" % (label, value))
    if any(ch in value for ch in ("/", "\\", ":", "\x00")):
        raise AdapterError("%s 含非法路径字符：%s" % (label, value))
    if re.search(r"[\x00-\x1f]", value):
        raise AdapterError("%s 含控制字符" % label)


def _as_posix_rel(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except (ValueError, OSError):
        return str(path)


def _path_or_rel(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except (ValueError, OSError):
        return str(path)


def _sha1_file(path: Path, length: int = 16) -> str:
    digest = hashlib.sha1()
    try:
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(HASH_CHUNK)
                if not chunk:
                    break
                digest.update(chunk)
    except OSError:
        return ""
    return digest.hexdigest()[:length]


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(HASH_CHUNK)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _kind_of(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext == ".csv":
        return "csv"
    if ext in (".xlsx", ".xlsm", ".xls"):
        return "xlsx"
    if ext in (".html", ".htm"):
        return "html"
    if ext in (".prn", ".txt", ".las"):
        return "prn"
    if ext == ".json":
        return "json"
    if ext == ".log":
        return "log"
    return "other"


def _write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_json_safe(payload), ensure_ascii=False, indent=2),
                    encoding="utf-8")


def _walk_files(root: Path, recursive: bool = True) -> Iterable[Path]:
    if not root.is_dir():
        return
    if recursive:
        for dirpath, dirnames, filenames in os.walk(str(root)):
            dirnames[:] = [d for d in dirnames
                           if d.lower() not in SKIP_DIR_NAMES and not d.startswith(".")]
            for name in filenames:
                if name.startswith(SKIP_FILE_PREFIXES) or name.endswith(".tmp"):
                    continue
                yield Path(dirpath) / name
    else:
        try:
            for entry in root.iterdir():
                if entry.is_file() and not entry.name.startswith(SKIP_FILE_PREFIXES):
                    yield entry
        except OSError:
            return


def _dir_stats(path: Path, recursive: bool = True) -> Dict[str, int]:
    files = 0
    size = 0
    for item in _walk_files(path, recursive=recursive):
        try:
            size += item.stat().st_size
            files += 1
        except OSError:
            continue
    return {"files": files, "bytes": size}


def _output_root(cfg: Any, root: Path) -> Path:
    value = getattr(cfg, "output_root", None) or "out"
    path = Path(value)
    if path.is_absolute():
        return path
    base = Path(cfg.config_dir) if getattr(cfg, "config_dir", None) else root
    return (base / path).resolve()


def _stage_option(cfg: Any, stage: str, key: str, default: Any) -> Any:
    """读取 options.<stage>.<key>（不修改配置）。"""
    section = cfg.opt(stage, {}) if hasattr(cfg, "opt") else {}
    if isinstance(section, dict):
        value = section.get(key)
        if value not in (None, ""):
            return value
    return default


def _stage_dir(cfg: Any, root: Path, batch: str, stage: str, which: str) -> Path:
    """stage 的输入/输出目录（相对 out/<batch>）。"""
    base = root / "out" / batch
    if stage == "scan":
        organize = cfg.opt("scan_organize", {}) if hasattr(cfg, "opt") else {}
        name = (organize or {}).get("root") if isinstance(organize, dict) else None
        return base / str(name or "02-整理")
    if stage == "merge":
        default = "02-整理" if which == "input" else "03-汇总"
        return base / str(_stage_option(cfg, "merge", "%s_dir" % which, default))
    if stage == "export":
        default = "03-汇总" if which == "input" else "04-待导入"
        return base / str(_stage_option(cfg, "export", "%s_dir" % which, default))
    return base


# ------------------------------------------------------------------ 白名单覆盖
WHITELIST_PATHS = (
    "options.well_id_upper",
    "options.td_tolerance_m",
    "options.las_td_tolerance_m",
    "options.trajectory_algorithm",
    "options.scan_organize",
    "options.scan_attachment_exts",
    "options.merge.well_id_conflict_policy",
    "export.encoding",
    "export.line_ending",
)
EXECUTION_KEYS = {
    "dryRun", "dry_run", "verbose", "only", "copyMode", "copy_mode",
    "extraKeywords", "extra_keywords",
}
_CHILD_ALLOWED = {
    "options": {
        "well_id_upper", "td_tolerance_m", "las_td_tolerance_m",
        "trajectory_algorithm", "scan_organize", "scan_attachment_exts", "merge",
    },
    "merge": {"well_id_conflict_policy"},
    "export": {"encoding", "line_ending"},
}
_FLAT_ALLOWED = {path.split(".")[-1] for path in WHITELIST_PATHS}


def _to_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("1", "true", "yes", "on", "是"):
            return True
        if lowered in ("0", "false", "no", "off", "否"):
            return False
    return default


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, (list, tuple, set)):
        raise ValueError("应为数组")
    return [str(item).strip() for item in value if str(item).strip()]


def _value_at(options: Dict[str, Any], dotted: str) -> Tuple[bool, Any]:
    """按「点号路径 / 嵌套对象 / 扁平短名」三种写法取覆盖值。"""
    if dotted in options:
        return True, options[dotted]
    parts = dotted.split(".")
    current: Any = options
    found = True
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            found = False
            break
    if found:
        return True, current
    if parts[0] == "options" and len(parts) > 1:
        current = options
        found = True
        for part in parts[1:]:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                found = False
                break
        if found:
            return True, current
    short = parts[-1]
    if short in options:
        return True, options[short]
    return False, None


def _unknown_override_warnings(options: Dict[str, Any]) -> List[str]:
    warnings: List[str] = []
    for key, value in options.items():
        if key in EXECUTION_KEYS:
            continue
        if key in WHITELIST_PATHS or key in _FLAT_ALLOWED:
            continue
        if key in _CHILD_ALLOWED:
            if not isinstance(value, dict):
                warnings.append("忽略覆盖项 %s：应为对象" % key)
                continue
            for child in value:
                if child not in _CHILD_ALLOWED[key]:
                    warnings.append("忽略白名单外的覆盖项：%s.%s" % (key, child))
            continue
        if key.startswith("options.") or key.startswith("export."):
            warnings.append("忽略白名单外的覆盖项：%s" % key)
            continue
        warnings.append("忽略白名单外的覆盖项：%s" % key)
    return warnings


def _apply_overrides(cfg: Any, options: Any, stage: str) -> Tuple[Any, List[str], Dict[str, Any]]:
    """在内存副本上应用契约 2.1 白名单，绝不写 config/。"""
    effective = copy.deepcopy(cfg)
    if not isinstance(getattr(effective, "options", None), dict):
        effective.options = {}
    warnings: List[str] = []
    applied: Dict[str, Any] = {}
    if not isinstance(options, dict):
        return effective, ["options 不是 JSON 对象，已忽略"], applied

    def opt_dict(name: str) -> Dict[str, Any]:
        section = effective.options.get(name)
        if not isinstance(section, dict):
            section = {}
            effective.options[name] = section
        return section

    for path in WHITELIST_PATHS:
        found, value = _value_at(options, path)
        if not found:
            continue
        try:
            if path == "options.well_id_upper":
                effective.options["well_id_upper"] = _to_bool(value)
            elif path == "options.td_tolerance_m":
                effective.options["td_tolerance_m"] = float(value)
            elif path == "options.las_td_tolerance_m":
                effective.options["las_td_tolerance_m"] = float(value)
            elif path == "options.trajectory_algorithm":
                effective.options["trajectory_algorithm"] = str(value)
            elif path == "options.scan_organize":
                if not isinstance(value, dict):
                    raise ValueError("应为对象")
                existing = effective.options.get("scan_organize")
                if isinstance(existing, dict):
                    merged = copy.deepcopy(existing)
                    merged.update(copy.deepcopy(value))
                    effective.options["scan_organize"] = merged
                else:
                    effective.options["scan_organize"] = copy.deepcopy(value)
            elif path == "options.scan_attachment_exts":
                effective.options["scan_attachment_exts"] = _as_list(value)
            elif path == "options.merge.well_id_conflict_policy":
                policy = str(value).strip().lower()
                if policy not in ("file", "table"):
                    raise ValueError("只允许 file / table")
                opt_dict("merge")["well_id_conflict_policy"] = policy
            elif path == "export.encoding":
                opt_dict("export")["encoding"] = str(value)
            elif path == "export.line_ending":
                line_ending = str(value).strip().lower()
                if line_ending not in ("crlf", "lf", "cr"):
                    raise ValueError("只允许 crlf / lf / cr")
                opt_dict("export")["line_ending"] = line_ending
            applied[path] = _json_safe(value)
        except (TypeError, ValueError) as exc:
            warnings.append("覆盖项 %s 值非法，已忽略：%s" % (path, exc))

    warnings.extend(_unknown_override_warnings(options))
    # 去掉重复 warning，保持顺序
    seen = set()
    unique: List[str] = []
    for item in warnings:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return effective, unique, applied


def _execution_options(options: Dict[str, Any], stage: str,
                       warnings: List[str]) -> Tuple[bool, bool, List[str], str, Optional[List[str]]]:
    """解析 dryRun / verbose / extraKeywords / copyMode / only。"""
    dry_run = _to_bool(options.get("dryRun", options.get("dry_run", False)), False)
    verbose = _to_bool(options.get("verbose", False), False)

    raw_keywords = options.get("extraKeywords", options.get("extra_keywords"))
    keywords: List[str] = []
    if raw_keywords is not None:
        try:
            keywords = _as_list(raw_keywords)
        except ValueError:
            warnings.append("extraKeywords 应为字符串数组，已忽略")
            keywords = []
        if keywords and stage != "scan":
            warnings.append("extraKeywords 仅在 scan 阶段生效，已忽略")
            keywords = []

    copy_mode = str(options.get("copyMode", options.get("copy_mode", "copy")) or "copy").strip().lower()
    if copy_mode in ("manifest_only", "manifestonly"):
        copy_mode = "manifest-only"
    if copy_mode not in ("copy", "link", "manifest-only"):
        warnings.append("copyMode 非法（%s），按 copy 处理" % copy_mode)
        copy_mode = "copy"
    if stage != "scan" and copy_mode != "copy":
        warnings.append("copyMode 仅在 scan 阶段生效，已忽略")
        copy_mode = "copy"

    raw_only = options.get("only")
    selected: Optional[List[str]] = None
    if raw_only is not None:
        try:
            items = _as_list(raw_only)
        except ValueError:
            warnings.append("only 应为字符串数组，已忽略")
            items = []
        valid = [item for item in items if item.lower() in ("layers", "interp", "deviation")]
        invalid = [item for item in items if item.lower() not in ("layers", "interp", "deviation")]
        if invalid:
            warnings.append("only 含未知类别，已忽略：%s" % "、".join(invalid))
        if stage == "scan" and items:
            warnings.append("only 仅在 merge/export 阶段生效，已忽略")
        elif valid:
            selected = valid
    return dry_run, verbose, keywords, copy_mode, selected


# ------------------------------------------------------------------ 规则字段
def _scan_defaults() -> Dict[str, Any]:
    try:
        from pdl import scan as scan_mod
        return {
            "attachment_exts": list(getattr(scan_mod, "DEFAULT_ATTACHMENT_EXTS", ())),
            "binary_exts": list(getattr(scan_mod, "DEFAULT_BINARY_EXTS", ())),
            "layouts": dict(getattr(scan_mod, "DEFAULT_ORGANIZE_LAYOUTS", {})),
            "keep_widest": list(getattr(scan_mod, "DEFAULT_KEEP_WIDEST", ())),
            "organize_exts": {key: list(value) for key, value in
                              getattr(scan_mod, "DEFAULT_ORGANIZE_EXTS", {}).items()},
        }
    except Exception:
        return {"attachment_exts": [], "binary_exts": [], "layouts": {},
                "keep_widest": [], "organize_exts": {}}


def _export_defaults() -> Dict[str, Any]:
    try:
        from pdl.export import DEFAULT_EXPORT
        return copy.deepcopy(DEFAULT_EXPORT)
    except Exception:
        return {}


def _merge_defaults() -> Dict[str, Any]:
    try:
        from pdl.merge import DEFAULT_MERGE
        return copy.deepcopy(DEFAULT_MERGE)
    except Exception:
        return {}


def _rule_fields(cfg: Any) -> List[Dict[str, Any]]:
    """把 project.yaml + lexicon.yaml 的关键可配置项摊平成字段列表。"""
    fields: List[Dict[str, Any]] = []
    defaults = _scan_defaults()

    def add(path: str, label: str, stage: str, value: Any) -> None:
        fields.append({"path": path, "label": label,
                       "value": _json_safe(value), "source": "工程默认",
                       "stage": stage})

    scan_opts = cfg.opt("scan_organize", {}) or {}
    if not isinstance(scan_opts, dict):
        scan_opts = {}
    add("options.well_id_upper", "井号统一大写", "scan",
        cfg.opt("well_id_upper", False))
    add("options.scan_organize.root", "整理根目录", "scan",
        scan_opts.get("root") or "02-整理")
    add("options.scan_organize.default_layout", "默认整理布局", "scan",
        scan_opts.get("default_layout") or "flat")
    add("options.scan_organize.layouts", "按类别整理布局", "scan",
        scan_opts.get("layouts") or defaults["layouts"])
    add("options.scan_organize.include_exts", "整理扩展名白名单", "scan",
        scan_opts.get("include_exts") or defaults["organize_exts"])
    add("options.scan_organize.keep_widest", "同井保留最全深度段的类别", "scan",
        scan_opts.get("keep_widest", defaults["keep_widest"]))
    add("options.scan_attachment_exts", "井目录附件类型", "scan",
        cfg.opt("scan_attachment_exts", defaults["attachment_exts"]))
    add("options.scan_binary_exts", "无解析器二进制扩展名", "scan",
        cfg.opt("scan_binary_exts", defaults["binary_exts"]))
    add("options.td_tolerance_m", "井深容差（m）", "merge",
        cfg.opt("td_tolerance_m", 5.0))
    add("options.las_td_tolerance_m", "LAS 井深容差（m）", "scan",
        cfg.opt("las_td_tolerance_m", 30.0))
    add("options.trajectory_algorithm", "井斜轨迹算法", "merge",
        cfg.opt("trajectory_algorithm", "minimum_curvature"))

    merge_opts = cfg.opt("merge", {}) or {}
    if not isinstance(merge_opts, dict):
        merge_opts = {}
    merge_defaults = _merge_defaults()
    add("options.merge.input_dir", "汇总输入目录", "merge",
        merge_opts.get("input_dir") or merge_defaults.get("input_dir") or "02-整理")
    add("options.merge.output_dir", "汇总输出目录", "merge",
        merge_opts.get("output_dir") or merge_defaults.get("output_dir") or "03-汇总")
    add("options.merge.well_id_conflict_policy", "井号冲突取值策略", "merge",
        merge_opts.get("well_id_conflict_policy")
        or merge_defaults.get("well_id_conflict_policy") or "file")
    add("options.merge.conflict_fill", "冲突行标记颜色", "merge",
        merge_opts.get("conflict_fill") or merge_defaults.get("conflict_fill") or "FFFF00")
    add("options.merge.well_id_overrides", "文件级井号覆盖", "merge",
        merge_opts.get("well_id_overrides") or merge_defaults.get("well_id_overrides") or [])
    merge_tables = merge_opts.get("tables") or merge_defaults.get("tables") or {}
    if isinstance(merge_tables, dict):
        for cat in ("layers", "interp", "deviation"):
            spec = merge_tables.get(cat) or {}
            if not isinstance(spec, dict):
                continue
            for key in ("file", "sheet", "columns"):
                if key in spec:
                    add("options.merge.tables.%s.%s" % (cat, key),
                        "汇总表配置：%s/%s" % (cat, key), "merge", spec.get(key))

    export_opts = cfg.opt("export", {}) or {}
    if not isinstance(export_opts, dict):
        export_opts = {}
    export_defaults = _export_defaults()
    add("options.export.input_dir", "导出输入目录", "export",
        export_opts.get("input_dir") or export_defaults.get("input_dir") or "03-汇总")
    add("options.export.output_dir", "导出输出目录", "export",
        export_opts.get("output_dir") or export_defaults.get("output_dir") or "04-待导入")
    add("options.export.encoding", "PRN 编码", "export",
        export_opts.get("encoding") or export_defaults.get("encoding") or "utf-8")
    add("options.export.line_ending", "PRN 换行符", "export",
        export_opts.get("line_ending") or export_defaults.get("line_ending") or "crlf")
    refs = export_opts.get("references") or export_defaults.get("references") or {}
    if isinstance(refs, dict):
        add("options.export.references.ru_zh", "俄中参考库", "export",
            refs.get("ru_zh") or "references/解释结论_俄中.csv")
        add("options.export.references.zh_code", "中文 GeoEast 代码库", "export",
            refs.get("zh_code") or "references/解释结论_中文GeoEast.csv")
    export_tables = export_opts.get("tables") or export_defaults.get("tables") or {}
    if isinstance(export_tables, dict):
        for cat in ("layers", "interp", "deviation"):
            spec = export_tables.get(cat) or {}
            if not isinstance(spec, dict):
                continue
            for key in ("file", "sheet", "header_row", "columns", "prn", "partial_prn"):
                if key in spec:
                    add("options.export.tables.%s.%s" % (cat, key),
                        "导出表配置：%s/%s" % (cat, key), "export", spec.get(key))
    add("output.encoding", "默认输出编码", "export", cfg.output.encoding)
    add("output.line_ending", "默认换行符", "export", cfg.output.line_ending)

    # 词典：扫描关键词 / 列别名 / 内容证据阈值
    lexicon = getattr(cfg, "lexicon", None)
    if lexicon is not None:
        for name, term in getattr(lexicon, "keywords", {}).items():
            values = [getattr(term, "name", name)] + list(getattr(term, "aliases", []))
            add("lexicon.keywords.%s" % name, "扫描关键词：%s" % name, "scan",
                list(dict.fromkeys(values)))
        for name, term in getattr(lexicon, "columns", {}).items():
            values = [getattr(term, "name", name)] + list(getattr(term, "aliases", []))
            add("lexicon.columns.%s" % name, "列别名：%s" % name, "scan",
                list(dict.fromkeys(values)))
        evidence = getattr(lexicon, "evidence", {}) or {}
        threshold_keys = ("check", "min_rows", "min_ratio", "min_cells",
                          "min_terms", "min_value_ratio", "sheet_keywords",
                          "value_vocabulary_source")
        for category, spec in evidence.items():
            if not isinstance(spec, dict):
                continue
            for key in threshold_keys:
                if key in spec:
                    add("lexicon.evidence.%s.%s" % (category, key),
                        "内容证据：%s/%s" % (category, key), "scan", spec.get(key))
    return fields


def _core_effective_fields(cfg: Any, stage: str) -> List[Dict[str, Any]]:
    """stage.plan 里使用的精简生效配置。"""
    fields = _rule_fields(cfg)
    core_paths = [
        "options.well_id_upper",
        "options.scan_organize.root",
        "options.scan_organize.default_layout",
        "options.scan_organize.layouts",
        "options.scan_attachment_exts",
        "options.td_tolerance_m",
        "options.las_td_tolerance_m",
        "options.trajectory_algorithm",
        "options.merge.well_id_conflict_policy",
        "options.merge.conflict_fill",
        "options.export.encoding",
        "options.export.line_ending",
        "options.export.references.ru_zh",
        "options.export.references.zh_code",
    ]
    wanted = {path: index for index, path in enumerate(core_paths)}
    picked: List[Dict[str, Any]] = []
    for field in fields:
        path = field["path"]
        if path not in wanted:
            continue
        if field["stage"] not in (stage, "all"):
            continue
        picked.append({"path": path, "label": field["label"],
                       "value": field["value"], "source": field["source"]})
    picked.sort(key=lambda item: wanted.get(item["path"], 999))
    return picked


# ------------------------------------------------------------------ 扫描统计
def _scan_tree_stats(source_roots: Sequence[Path], upper: bool = False) -> Dict[str, Any]:
    files = 0
    size = 0
    ext_counts: Counter = Counter()
    well_dirs: set = set()
    missing: List[str] = []
    try:
        from pdl.scan import extract_well_id as _extract_well_id
    except Exception:
        _extract_well_id = None
    for root in source_roots:
        if not root.is_dir():
            missing.append(str(root))
            continue
        for dirpath, dirnames, filenames in os.walk(str(root)):
            dirnames[:] = [name for name in dirnames
                           if name.lower() not in SKIP_DIR_NAMES and not name.startswith(".")]
            parent_id = ""
            if _extract_well_id is not None:
                parent_id = _extract_well_id(Path(dirpath).name, upper=upper)[0]
            for name in dirnames:
                if _extract_well_id is not None:
                    well_id = _extract_well_id(name, upper=upper)[0]
                    # 与 scan._well_dir_rows 一致：井目录下的子目录不算独立井目录
                    if well_id and parent_id != well_id:
                        well_dirs.add(well_id)
                else:
                    match = re.match(r"^(\d{2,})", name)
                    if match:
                        well_dirs.add(match.group(1).lower().replace("д", "d"))
            for name in filenames:
                if name.startswith(SKIP_FILE_PREFIXES):
                    continue
                path = Path(dirpath) / name
                try:
                    size += path.stat().st_size
                except OSError:
                    continue
                files += 1
                ext = path.suffix.lower() or "(无扩展名)"
                ext_counts[ext] += 1
    top = ext_counts.most_common(10)
    return {
        "files": files,
        "bytes": size,
        "wells": len(well_dirs),
        "extensionsTop": [{"ext": ext, "count": count} for ext, count in top],
        "categories": {ext: count for ext, count in top},
        "missingRoots": missing,
    }


def _xlsx_row_count(path: Path) -> Optional[int]:
    try:
        from openpyxl import load_workbook
        workbook = load_workbook(filename=str(path), read_only=True, data_only=True)
        try:
            sheet = workbook.worksheets[0]
            max_row = sheet.max_row or 0
            return max(0, int(max_row) - 1)
        finally:
            workbook.close()
    except Exception:
        return None


def _plan_scan(root: Path, cfg: Any, batch: str) -> Dict[str, Any]:
    stats = _scan_tree_stats(list(cfg.source_roots or []),
                             upper=bool(cfg.opt("well_id_upper", False)))
    organize_dir = _stage_dir(cfg, root, batch, "scan", "output")
    organize_stats = _dir_stats(organize_dir)
    warnings: List[Dict[str, str]] = []
    for missing in stats["missingRoots"]:
        warnings.append({"level": "warn", "text": "原始资料目录不存在：%s" % missing})
    if organize_stats["files"] > 0:
        warnings.append({
            "level": "warn",
            "text": "整理目录已存在 %d 个文件；重跑会重建该派生目录" % organize_stats["files"],
        })
    roots = list(cfg.source_roots or [])
    inputs = [{"label": "原始资料目录", "path": str(path),
               "exists": path.is_dir()}
              for path in roots]
    outputs = [{
        "label": "整理目录",
        "path": _path_or_rel(organize_dir, root),
        "exists": organize_dir.is_dir(),
        "fileCount": organize_stats["files"],
    }]
    default_organize = root / "out" / batch / "02-整理"
    if organize_dir != default_organize:
        default_stats = _dir_stats(default_organize)
        outputs.append({
            "label": "整理目录（默认）",
            "path": _path_or_rel(default_organize, root),
            "exists": default_organize.is_dir(),
            "fileCount": default_stats["files"],
        })
    blockers: List[str] = []
    if not any(item["exists"] for item in inputs):
        blockers.append("未找到可读取的原始资料根目录")
    return {
        "stage": "scan",
        "batchId": batch,
        "title": "扫描归井",
        "inputs": inputs,
        "outputs": outputs,
        "estimates": {
            "files": stats["files"],
            "bytes": stats["bytes"],
            "wells": stats["wells"],
            "categories": stats["categories"],
            "extensionsTop": stats["extensionsTop"],
        },
        "warnings": warnings,
        "canRun": not blockers,
        "blockers": blockers,
    }


def _plan_merge(root: Path, cfg: Any, batch: str) -> Dict[str, Any]:
    in_dir = _stage_dir(cfg, root, batch, "merge", "input")
    out_dir = _stage_dir(cfg, root, batch, "merge", "output")
    categories: Dict[str, int] = {}
    details: List[Dict[str, Any]] = []
    total_files = 0
    total_bytes = 0
    warnings: List[Dict[str, str]] = []
    for cat, label in (("layers", "分层"), ("interp", "解释结论"), ("deviation", "井斜")):
        cat_dir = in_dir / cat
        stats = _dir_stats(cat_dir)
        categories[cat] = stats["files"]
        total_files += stats["files"]
        total_bytes += stats["bytes"]
        details.append({"category": cat, "label": label,
                        "path": _path_or_rel(cat_dir, root),
                        "exists": cat_dir.is_dir(), "files": stats["files"]})
        if not cat_dir.is_dir():
            warnings.append({"level": "warn",
                             "text": "%s整理目录不存在：%s" % (label, _path_or_rel(cat_dir, root))})
        elif stats["files"] == 0:
            warnings.append({"level": "info", "text": "%s整理目录为空" % label})
    out_stats = _dir_stats(out_dir)
    out_files = list(_walk_files(out_dir, recursive=False))
    if out_files:
        warnings.append({
            "level": "warn",
            "text": "汇总目录已存在 %d 个文件；重跑会覆盖/归档旧结果" % len(out_files),
        })
    inputs = [{"label": "整理目录", "path": _path_or_rel(in_dir, root),
               "exists": in_dir.is_dir(), "fileCount": total_files}]
    inputs.extend({"label": "%s整理目录" % item["label"], "path": item["path"],
                   "exists": item["exists"], "fileCount": item["files"]}
                  for item in details)
    outputs = [{"label": "汇总目录", "path": _path_or_rel(out_dir, root),
                "exists": out_dir.is_dir(), "fileCount": out_stats["files"]}]
    blockers: List[str] = []
    if not in_dir.is_dir():
        blockers.append("上游 02-整理 目录不存在，请先完成扫描")
    elif total_files == 0:
        blockers.append("02-整理 下没有可汇总的文件")
    return {
        "stage": "merge",
        "batchId": batch,
        "title": "汇总核对",
        "inputs": inputs,
        "outputs": outputs,
        "estimates": {
            "files": total_files,
            "bytes": total_bytes,
            "categories": categories,
            "tables": details,
        },
        "warnings": warnings,
        "canRun": not blockers,
        "blockers": blockers,
    }


def _plan_export(root: Path, cfg: Any, batch: str) -> Dict[str, Any]:
    in_dir = _stage_dir(cfg, root, batch, "export", "input")
    out_dir = _stage_dir(cfg, root, batch, "export", "output")
    xlsx_files = []
    if in_dir.is_dir():
        xlsx_files = sorted(
            [p for p in in_dir.iterdir()
             if p.is_file() and p.suffix.lower() in (".xlsx", ".xlsm")
             and not p.name.startswith(SKIP_FILE_PREFIXES)],
            key=lambda item: item.name.lower(),
        )
    total_rows = 0
    total_bytes = 0
    categories: Dict[str, int] = {}
    details: List[Dict[str, Any]] = []
    warnings: List[Dict[str, str]] = []
    for path in xlsx_files:
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        rows = _xlsx_row_count(path)
        if rows is None:
            rows = 0
            warnings.append({"level": "warn", "text": "Excel 无法按只读方式打开：%s" % path.name})
        total_rows += rows
        total_bytes += size
        categories[path.name] = rows
        details.append({"file": path.name, "rows": rows, "bytes": size})
    out_stats = _dir_stats(out_dir, recursive=False)
    if out_stats["files"] > 0:
        warnings.append({
            "level": "warn",
            "text": "待导入目录已存在 %d 个旧导出文件；重跑会先归档旧结果" % out_stats["files"],
        })
    inputs = [{"label": "汇总目录", "path": _path_or_rel(in_dir, root),
               "exists": in_dir.is_dir(), "fileCount": len(xlsx_files)}]
    outputs = [{"label": "待导入目录", "path": _path_or_rel(out_dir, root),
                "exists": out_dir.is_dir(), "fileCount": out_stats["files"]}]
    blockers: List[str] = []
    if not in_dir.is_dir():
        blockers.append("上游 03-汇总 目录不存在，请先完成汇总")
    elif not xlsx_files:
        blockers.append("03-汇总 下没有可导出的 xlsx 主表")
    return {
        "stage": "export",
        "batchId": batch,
        "title": "导出交付",
        "inputs": inputs,
        "outputs": outputs,
        "estimates": {
            "files": len(xlsx_files),
            "bytes": total_bytes,
            "rows": total_rows,
            "categories": categories,
            "tables": details,
        },
        "warnings": warnings,
        "canRun": not blockers,
        "blockers": blockers,
    }


# ------------------------------------------------------------------ 命令：probe / batch.list
def cmd_probe(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = _project_root(payload)
    cfg = _load_config(root)
    import pdl

    batches: List[str] = []
    try:
        from pdl import status as status_mod
        batches = status_mod.list_batches(root)
    except Exception:
        batches = []
    output_root = _output_root(cfg, root)
    config_path = root / "config" / "project.yaml"
    try:
        config_stat = config_path.stat()
        created_at = datetime.fromtimestamp(config_stat.st_mtime).isoformat(timespec="seconds")
        updated_at = created_at
    except OSError:
        created_at = ""
        updated_at = ""
    project_id = "P-" + hashlib.sha1(str(root).encode("utf-8")).hexdigest()[:8]
    return {
        "adapter": {
            "version": ADAPTER_VERSION,
            "python": sys.version.split()[0],
            "executable": sys.executable,
            "encoding": "utf-8",
        },
        "pdlVersion": getattr(pdl, "__version__", ""),
        "python": sys.executable,
        "project": {
            "id": project_id,
            "name": cfg.name,
            "root": str(root),
            "configPath": str(config_path),
            "outputRoot": str(output_root),
            "sourceRoots": [str(path) for path in (cfg.source_roots or [])],
            "targetSoftware": cfg.target_software,
            "targetVersion": cfg.target_version,
            "createdAt": created_at,
            "updatedAt": updated_at,
        },
        "sourceRoots": [str(path) for path in (cfg.source_roots or [])],
        "outputRoot": str(output_root),
        "configPath": str(config_path),
        "batchCount": len(batches),
        "latestBatch": batches[0] if batches else None,
        "commands": list(COMMANDS.keys()),
        "time": _now_iso(),
    }


def _newest_activity(root: Path, batch: str) -> str:
    stamps: List[float] = []
    for base in (root / "out" / batch, root / "work" / batch):
        if not base.exists():
            continue
        candidates: List[Path] = [base]
        summary = base / "run_summary.json"
        if summary.exists():
            candidates.append(summary)
        try:
            candidates.extend(base.glob("*/.done.json"))
        except OSError:
            pass
        for path in candidates:
            try:
                stamps.append(path.stat().st_mtime)
            except OSError:
                continue
    if not stamps:
        return ""
    return datetime.fromtimestamp(max(stamps)).isoformat(timespec="seconds")


def cmd_batch_list(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = _project_root(payload)
    from pdl import status as status_mod

    names = status_mod.list_batches(root)
    batches: List[Dict[str, Any]] = []
    for name in names:
        state = status_mod.collect(root, name)
        batches.append({
            "id": name,
            "name": name,
            "projectId": "",
            "packageId": "",
            "step": None,
            "existsInWork": state.get("exists_in_work", False),
            "existsInOut": state.get("exists_in_out", False),
            "summaryFound": state.get("summary_found", False),
            "modules": len(state.get("modules") or []),
            "finished": len(state.get("finished") or []),
            "remaining": state.get("remaining") or [],
            "interruptedAt": state.get("interrupted_at") or [],
            "failed": state.get("failed") or [],
            "nextModule": state.get("next_module"),
            "resumeCommand": state.get("resume_command", ""),
            "createdAt": "",
            "updatedAt": _newest_activity(root, name),
        })
    return {"projectRoot": str(root), "batches": batches}


# ------------------------------------------------------------------ 命令：stage.plan
def cmd_stage_plan(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = _project_root(payload)
    batch = _require_batch(payload)
    stage = _require_stage(payload)
    cfg = _load_config(root)
    options = payload.get("options") or {}
    effective, ignore_warnings, _applied = _apply_overrides(cfg, options, stage)
    if stage == "scan":
        plan = _plan_scan(root, effective, batch)
    elif stage == "merge":
        plan = _plan_merge(root, effective, batch)
    else:
        plan = _plan_export(root, effective, batch)
    plan["warnings"] = list(plan.get("warnings") or []) + [
        {"level": "warn", "text": text} for text in ignore_warnings
    ]
    plan["effectiveConfig"] = _core_effective_fields(effective, stage)
    return plan


# ------------------------------------------------------------------ 命令：stage.run
class _LogBuffer(logging.Handler):
    """把 pdl 日志同时缓冲到内存（最近 N 行），用于 run.log。"""

    def __init__(self, max_lines: int = 500) -> None:
        super().__init__(level=logging.DEBUG)
        self.max_lines = max_lines
        self.lines: List[str] = []
        self.setFormatter(logging.Formatter(
            "[%(asctime)s] %(levelname)-7s %(message)s", "%H:%M:%S"))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = self.format(record)
        except Exception:
            message = record.getMessage()
        for line in str(message).splitlines() or [""]:
            self.lines.append(line)
            if len(self.lines) > self.max_lines:
                del self.lines[:len(self.lines) - self.max_lines]

    def text(self, limit: int = 200) -> str:
        return "\n".join(self.lines[-limit:])


def _new_run_id(stage: str) -> str:
    import secrets
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return "RUN-%s-%s-%s" % (stage.upper(), stamp, secrets.token_hex(3).upper())


def _snapshot_effective(cfg: Any, root: Path) -> Dict[str, Any]:
    output = cfg.output
    lexicon = getattr(cfg, "lexicon", None)
    lexicon_payload: Dict[str, Any] = {}
    if lexicon is not None:
        lexicon_payload = {
            "keywords": {name: list(getattr(term, "aliases", []))
                         for name, term in getattr(lexicon, "keywords", {}).items()},
            "columns": {name: list(getattr(term, "aliases", []))
                        for name, term in getattr(lexicon, "columns", {}).items()},
            "evidence": getattr(lexicon, "evidence", {}) or {},
        }
    codes_payload: Dict[str, Any] = {}
    for name, table in getattr(cfg, "codes", {}).items():
        codes_payload[name] = {
            "count": len(getattr(table, "display", {}) or {}),
            "display": getattr(table, "display", {}) or {},
        }
    return {
        "name": cfg.name,
        "sourceRoots": [str(path) for path in (cfg.source_roots or [])],
        "outputRoot": str(_output_root(cfg, root)),
        "targetSoftware": cfg.target_software,
        "targetVersion": cfg.target_version,
        "crs": cfg.crs,
        "output": {
            "encoding": output.encoding,
            "line_ending": output.line_ending,
            "delimiter": output.delimiter,
            "decimal_digits": output.decimal_digits,
            "null_excel": output.null_excel,
            "null_las": output.null_las,
            "date_format": output.date_format,
            "las_version": output.las_version,
            "las_wrap": output.las_wrap,
        },
        "options": cfg.options,
        "paths": cfg.paths,
        "lexicon": lexicon_payload,
        "codes": codes_payload,
    }


def _reference_config_paths(cfg: Any) -> List[Path]:
    paths: List[Path] = []
    export_opts = cfg.opt("export", {}) if hasattr(cfg, "opt") else {}
    refs = (export_opts or {}).get("references") if isinstance(export_opts, dict) else {}
    if not isinstance(refs, dict):
        return paths
    base = Path(cfg.config_dir) if cfg.config_dir else Path.cwd()
    for value in refs.values():
        if not value:
            continue
        path = Path(str(value))
        if not path.is_absolute():
            path = base / path
        paths.append(path)
    return paths


def _key_config_files(cfg: Any) -> List[Path]:
    config_dir = Path(cfg.config_dir) if cfg.config_dir else None
    if config_dir is None:
        return []
    candidates: List[Path] = [config_dir / "project.yaml", config_dir / "lexicon.yaml"]
    try:
        candidates.extend(sorted((config_dir / "codes").glob("*.csv")))
        candidates.extend(sorted((config_dir / "references").glob("*.csv")))
    except OSError:
        pass
    candidates.extend(_reference_config_paths(cfg))
    # value_vocabulary_source 指向的 Markdown 词表也算关键配置
    lexicon = getattr(cfg, "lexicon", None)
    evidence = getattr(lexicon, "evidence", {}) if lexicon is not None else {}
    for spec in (evidence or {}).values():
        if isinstance(spec, dict) and spec.get("value_vocabulary_source"):
            candidates.append(Path(str(spec["value_vocabulary_source"])))
    seen = set()
    unique: List[Path] = []
    for path in candidates:
        try:
            resolved = path.resolve()
        except OSError:
            resolved = path
        key = str(resolved).lower()
        if key in seen or not resolved.is_file():
            continue
        seen.add(key)
        unique.append(resolved)
    return unique


def _write_config_snapshot(work_dir: Path, run_id: str, batch: str, stage: str,
                           root: Path, cfg: Any, applied: Dict[str, Any],
                           request_options: Dict[str, Any]) -> Dict[str, Any]:
    files: List[Dict[str, Any]] = []
    for path in _key_config_files(cfg):
        try:
            files.append({
                "path": _path_or_rel(path, root),
                "sha256": _sha256_file(path),
                "size": path.stat().st_size,
            })
        except OSError:
            continue
    snapshot = {
        "runId": run_id,
        "batch": batch,
        "stage": stage,
        "at": _now_iso(),
        "projectRoot": str(root),
        "effective": _snapshot_effective(cfg, root),
        "files": files,
        "options": applied,
        "requestOptions": _json_safe(request_options),
    }
    path = work_dir / "config-snapshot.json"
    _write_json_file(path, snapshot)
    return snapshot


def _stage_output_dirs(cfg: Any, root: Path, batch: str, stage: str) -> List[Tuple[str, Path]]:
    base = root / "out" / batch
    if stage == "scan":
        dirs = [("扫描输出", base / "scan")]
        organize = _stage_dir(cfg, root, batch, "scan", "output")
        dirs.append(("整理目录", organize))
        if organize.name != "02-整理":
            dirs.append(("整理目录（默认）", base / "02-整理"))
        return dirs
    if stage == "merge":
        return [("汇总输出", _stage_dir(cfg, root, batch, "merge", "output"))]
    return [("待导入", _stage_dir(cfg, root, batch, "export", "output"))]


def _collect_artifacts(cfg: Any, root: Path, batch: str, stage: str) -> List[Dict[str, Any]]:
    artifacts: List[Dict[str, Any]] = []
    seen = set()
    for label, directory in _stage_output_dirs(cfg, root, batch, stage):
        for path in _walk_files(directory, recursive=True):
            try:
                resolved = path.resolve()
            except OSError:
                resolved = path
            key = str(resolved).lower()
            if key in seen:
                continue
            seen.add(key)
            try:
                stat = path.stat()
            except OSError:
                continue
            artifacts.append({
                "path": str(path),
                "rel": _as_posix_rel(path, root),
                "name": path.name,
                "size": stat.st_size,
                "mtime": int(stat.st_mtime * 1000),
                "sha1": _sha1_file(path),
                "kind": _kind_of(path.name),
                "stage": stage,
                "dir": label,
            })
            if len(artifacts) >= MAX_ARTIFACTS:
                break
        if len(artifacts) >= MAX_ARTIFACTS:
            break
    artifacts.sort(key=lambda item: item["rel"].lower())
    return artifacts


def _exit_code(stage: str, result: Any) -> int:
    """与 CLI 的退出码语义保持一致。"""
    status = getattr(result, "status", "failed")
    blocks = getattr(result, "block_count", 0)
    if stage == "export":
        return 0 if status == "ok" and blocks == 0 else 1
    if stage == "merge":
        return 1 if status in ("failed", "blocked") or blocks else 0
    # scan（经 pipeline._run/_emit）：只有 failed/blocked 才退出 1
    return 1 if status in ("failed", "blocked") else 0


def _invoke_stage(stage: str, cfg: Any, rc: Any, root: Path, batch: str,
                  keywords: List[str], copy_mode: str,
                  only: Optional[List[str]]) -> Any:
    if stage == "scan":
        from pdl.scan import run_scan
        return run_scan(cfg, rc, extra_keywords=keywords, copy_mode=copy_mode)
    if stage == "merge":
        from pdl.merge import run_merge
        in_dir = _stage_dir(cfg, root, batch, "merge", "input")
        out_dir = _stage_dir(cfg, root, batch, "merge", "output")
        return run_merge(cfg, rc, input_dir=str(in_dir), output_dir=str(out_dir),
                         only=only)
    from pdl.export import run_export
    in_dir = _stage_dir(cfg, root, batch, "export", "input")
    out_dir = _stage_dir(cfg, root, batch, "export", "output")
    return run_export(cfg, rc, input_dir=str(in_dir), output_dir=str(out_dir),
                      only=only)


def cmd_stage_run(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = _project_root(payload)
    batch = _require_batch(payload)
    stage = _require_stage(payload)
    cfg = _load_config(root)
    options = payload.get("options") or {}
    if not isinstance(options, dict):
        options = {}
    raw_run_id = payload.get("runId") or payload.get("run_id")
    run_id = str(raw_run_id).strip() if raw_run_id else _new_run_id(stage)
    _validate_component(run_id, "runId")

    effective, override_warnings, applied = _apply_overrides(cfg, options, stage)
    dry_run, verbose, keywords, copy_mode, only = _execution_options(
        options, stage, override_warnings)
    if payload.get("dryRun") is not None or payload.get("dry_run") is not None:
        dry_run = _to_bool(payload.get("dryRun", payload.get("dry_run")), dry_run)

    started_at = _now_iso()
    work_dir = root / "work" / batch / "pdl-center" / run_id
    work_dir.mkdir(parents=True, exist_ok=True)
    snapshot = _write_config_snapshot(work_dir, run_id, batch, stage, root,
                                      effective, applied, options)

    from pdl.context import Finding, ModuleResult, RunContext

    rc = RunContext(root, batch=batch, dry_run=dry_run, verbose=verbose)
    log_buffer = _LogBuffer()
    rc.log.addHandler(log_buffer)
    warnings = list(override_warnings)
    try:
        for warning in warnings:
            rc.log.warning("适配层：%s", warning)
        try:
            result = _invoke_stage(stage, effective, rc, root, batch,
                                   keywords, copy_mode, only)
        except Exception as exc:  # 业务模块异常 → 结构化 failed，而不是无输出
            rc.log.error("阶段 %s 执行异常：%s\n%s", stage, exc, traceback.format_exc())
            result = ModuleResult(module=stage, status="failed", batch=batch)
            result.add_finding(Finding(
                code="ADAPTER-ERROR", level="block",
                message="阶段执行异常：%s" % exc,
                suggestion="查看 run.log / 适配层 stderr 与 traceback",
                module=stage,
            ))
            result.notes.append("适配层捕获到未处理异常，已将运行标记为 failed")
            rc.record(result)
    finally:
        rc.log.removeHandler(log_buffer)

    finished_at = _now_iso()
    exit_code = _exit_code(stage, result)
    artifacts: List[Dict[str, Any]] = []
    if not dry_run:
        try:
            artifacts = _collect_artifacts(effective, root, batch, stage)
        except Exception as exc:  # 产物枚举失败不应吞掉本次运行结果
            warnings.append("产物枚举失败：%s" % exc)
    log_text = log_buffer.text(200)
    data: Dict[str, Any] = {
        "runId": run_id,
        "batch": batch,
        "stage": stage,
        "dryRun": dry_run,
        "result": result.as_dict(),
        "artifacts": artifacts,
        "log": log_text,
        "startedAt": started_at,
        "finishedAt": finished_at,
        "exitCode": exit_code,
        "warnings": warnings,
        "configSnapshot": {
            "path": _path_or_rel(work_dir / "config-snapshot.json", root),
            "at": snapshot["at"],
            "files": snapshot["files"],
        },
        "events": [{"at": started_at, "level": "warn", "text": warning}
                   for warning in warnings],
    }
    data = _json_safe(data)
    try:
        _write_json_file(work_dir / "run.json", data)
    except OSError as exc:
        rc.log.warning("写 run.json 失败：%s", exc)
    return data


# ------------------------------------------------------------------ 命令：artifact.*
def _artifact_dirs_payload(cfg: Any, root: Path, batch: str,
                           stages: Sequence[str]) -> List[Dict[str, Any]]:
    payload: List[Dict[str, Any]] = []
    seen = set()
    for stage in stages:
        for label, directory in _stage_output_dirs(cfg, root, batch, stage):
            key = str(directory).lower()
            if key in seen:
                continue
            seen.add(key)
            stats = _dir_stats(directory)
            payload.append({
                "stage": stage,
                "label": label,
                "path": str(directory),
                "rel": _path_or_rel(directory, root),
                "exists": directory.is_dir(),
                "fileCount": stats["files"],
                "bytes": stats["bytes"],
            })
    return payload


def cmd_artifact_list(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = _project_root(payload)
    batch = _require_batch(payload)
    cfg = _load_config(root)
    requested_stage = str(payload.get("stage") or "").strip().lower()
    if requested_stage and requested_stage not in ("scan", "merge", "export"):
        raise AdapterError("stage 必须是 scan / merge / export")
    stages = [requested_stage] if requested_stage else ["scan", "merge", "export"]
    artifacts: List[Dict[str, Any]] = []
    seen = set()
    for stage in stages:
        for item in _collect_artifacts(cfg, root, batch, stage):
            key = item["path"].lower()
            if key in seen:
                continue
            seen.add(key)
            artifacts.append(item)
    artifacts.sort(key=lambda item: item["rel"].lower())
    return {
        "artifacts": artifacts,
        "dirs": _artifact_dirs_payload(cfg, root, batch, stages),
        "batch": batch,
        "stage": requested_stage or "all",
    }


def _preview_limit(value: Any) -> int:
    try:
        limit = int(value)
    except (TypeError, ValueError):
        limit = DEFAULT_PREVIEW_LIMIT
    if limit <= 0:
        limit = DEFAULT_PREVIEW_LIMIT
    return min(limit, 5000)


def _assert_inside(root: Path, target: Path) -> Path:
    try:
        resolved_root = str(root.resolve()).lower()
        resolved_target = str(target.resolve()).lower()
    except OSError:
        resolved_root = str(root).lower()
        resolved_target = str(target).lower()
    if resolved_target != resolved_root and not resolved_target.startswith(
            resolved_root + os.sep.lower()):
        raise AdapterError("路径不在工程目录内：%s" % target)
    return target.resolve()


def _read_csv_preview(path: Path, limit: int) -> Tuple[List[str], List[List[Any]], int]:
    """CSV 预览：优先 pdl.context.read_csv（自带多编码尝试）。"""
    try:
        from pdl.context import read_csv
        records = read_csv(str(path))
    except Exception:
        records = []
    if records:
        columns = list(records[0].keys())
        rows = [[record.get(column, "") for column in columns]
                for record in records[:limit]]
        return columns, rows, len(records)
    # 空数据或读取失败：至少返回表头
    columns: List[str] = []
    try:
        text = _decode_bytes(path.read_bytes())
        reader = csv.reader(io.StringIO(text))
        header = next(reader, [])
        columns = [str(cell) for cell in header]
    except Exception:
        columns = []
    return columns, [], 0


def _read_xlsx_preview(path: Path, sheet: Any,
                       limit: int) -> Tuple[str, List[str], List[List[Any]], int, List[str]]:
    from openpyxl import load_workbook
    workbook = load_workbook(filename=str(path), read_only=True, data_only=True)
    try:
        sheet_names = list(workbook.sheetnames)
        selected = None
        if sheet not in (None, ""):
            if isinstance(sheet, int) or str(sheet).isdigit():
                index = int(sheet)
                if 0 <= index < len(workbook.worksheets):
                    selected = workbook.worksheets[index]
                else:
                    raise AdapterError("Sheet 序号超出范围：%s" % sheet)
            else:
                if str(sheet) not in workbook.sheetnames:
                    raise AdapterError("Sheet 不存在：%s" % sheet)
                selected = workbook[str(sheet)]
        if selected is None:
            selected = workbook.worksheets[0] if workbook.worksheets else None
        if selected is None:
            return "table", [], [], 0, sheet_names
        header: List[str] = []
        rows: List[List[Any]] = []
        total = 0
        for row_index, row in enumerate(selected.iter_rows(values_only=True)):
            if row_index == 0:
                header = ["" if cell is None else str(cell) for cell in row]
                continue
            if all(cell is None or str(cell).strip() == "" for cell in row):
                continue
            total += 1
            if len(rows) < limit:
                rows.append([_json_safe(cell) for cell in row])
        return "table", header, rows, total, sheet_names
    finally:
        workbook.close()


def cmd_artifact_preview(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = _project_root(payload)
    raw_path = payload.get("path")
    if not raw_path:
        raise AdapterError("缺少 path")
    target = Path(str(raw_path))
    if not target.is_absolute():
        target = root / target
    _assert_inside(root, target)
    if not target.is_file():
        raise AdapterError("文件不存在：%s" % target)
    limit = _preview_limit(payload.get("limit"))
    suffix = target.suffix.lower()
    result: Dict[str, Any] = {
        "path": str(target),
        "name": target.name,
        "kind": "binary",
        "columns": [],
        "rows": [],
        "total": 0,
        "sheetNames": [],
        "truncated": False,
    }
    if suffix == ".csv":
        columns, rows, total = _read_csv_preview(target, limit)
        result.update({"kind": "table", "columns": columns, "rows": rows, "total": total})
        return result
    if suffix in (".xlsx", ".xlsm"):
        kind, columns, rows, total, sheet_names = _read_xlsx_preview(
            target, payload.get("sheet"), limit)
        result.update({"kind": kind, "columns": columns, "rows": rows,
                       "total": total, "sheetNames": sheet_names})
        return result
    if suffix in TEXT_EXTS:
        try:
            size = target.stat().st_size
        except OSError:
            size = 0
        raw = target.read_bytes()
        truncated = size > MAX_TEXT_PREVIEW_BYTES
        if truncated:
            raw = raw[:MAX_TEXT_PREVIEW_BYTES]
        text = _decode_text_preview(raw)
        lines = text.splitlines()
        result.update({
            "kind": "text",
            "text": text,
            "total": len(lines),
            "truncated": truncated,
        })
        return result
    result["message"] = "二进制文件，暂不支持在线预览"
    return result


# ------------------------------------------------------------------ 命令：review.detect
def cmd_review_detect(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = _project_root(payload)
    batch = _require_batch(payload)
    recorded = payload.get("recorded") or {}
    if not isinstance(recorded, dict):
        recorded = {}
    normalized = {str(key).replace("\\", "/"): str(value)
                  for key, value in recorded.items()}
    review_dir = root / "out" / batch / "03-汇总"
    changed: List[Dict[str, Any]] = []
    current_keys = set()
    total = 0
    if review_dir.is_dir():
        for path in _walk_files(review_dir, recursive=True):
            if path.suffix.lower() not in (".xlsx", ".xlsm"):
                continue
            total += 1
            rel = path.relative_to(review_dir).as_posix()
            current_keys.add(rel)
            current_sha = _sha1_file(path)
            recorded_sha = (normalized.get(rel)
                            or normalized.get(_path_or_rel(path, root))
                            or normalized.get(path.name)
                            or "")
            if not recorded_sha:
                # 兼容 Host 传来的各种相对写法（03-汇总/xx、out/<batch>/03-汇总/xx）
                for key, value in normalized.items():
                    if key.endswith("/" + rel) or key.endswith("\\" + rel):
                        recorded_sha = value
                        break
            if recorded_sha != current_sha:
                status = "untracked" if not recorded_sha else "modified"
                changed.append({
                    "rel": rel,
                    "path": str(path),
                    "recordedSha": recorded_sha,
                    "currentSha": current_sha,
                    "status": status,
                })
    removed = [{"rel": key, "recordedSha": value, "status": "removed"}
               for key, value in normalized.items() if key not in current_keys]
    changed.sort(key=lambda item: item["rel"].lower())
    return {
        "batch": batch,
        "changed": changed,
        "removed": removed,
        "summary": {
            "total": total,
            "changed": len(changed),
            "unchanged": max(0, total - len(changed)),
            "removed": len(removed),
            "checkedAt": _now_iso(),
        },
    }


# ------------------------------------------------------------------ 命令：reference.info
def _read_table_file(path: Path) -> Tuple[List[str], List[Dict[str, str]]]:
    text = _decode_bytes(path.read_bytes())
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        return [], []
    header = [str(cell).strip() for cell in header]
    rows: List[Dict[str, str]] = []
    for values in reader:
        if not values or all(str(cell).strip() == "" for cell in values):
            continue
        row: Dict[str, str] = {}
        for index, column in enumerate(header):
            row[column] = values[index] if index < len(values) else ""
        rows.append(row)
    return header, rows


def _duplicate_stats(values: Sequence[str]) -> Dict[str, Any]:
    cleaned = [str(value).strip() for value in values if str(value).strip()]
    counter = Counter(cleaned)
    duplicates = [{"value": value, "count": count}
                  for value, count in counter.items() if count > 1]
    duplicates.sort(key=lambda item: (-item["count"], item["value"]))
    return {"duplicates": duplicates, "duplicateCount": len(duplicates),
            "emptyCount": sum(1 for value in values if not str(value).strip())}


def cmd_reference_info(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = _project_root(payload)
    cfg = _load_config(root)
    config_dir = Path(cfg.config_dir) if cfg.config_dir else root / "config"
    ref_dir = config_dir / "references"
    references: List[Dict[str, Any]] = []
    ru_rows: List[Dict[str, str]] = []
    zh_rows: List[Dict[str, str]] = []
    for key, filename in (("ruZh", "解释结论_俄中.csv"),
                          ("zhCode", "解释结论_中文GeoEast.csv")):
        path = ref_dir / filename
        entry: Dict[str, Any] = {
            "id": key, "name": filename, "path": _path_or_rel(path, root),
            "exists": path.is_file(), "count": 0, "columns": [],
            "sample": [], "duplicates": {"duplicates": [], "duplicateCount": 0,
                                          "emptyCount": 0},
        }
        if path.is_file():
            try:
                columns, rows = _read_table_file(path)
            except Exception as exc:  # noqa: BLE001
                entry["error"] = str(exc)
                columns, rows = [], []
            entry["columns"] = columns
            entry["count"] = len(rows)
            entry["sample"] = rows[:20]
            if columns:
                entry["duplicates"] = _duplicate_stats([row.get(columns[0], "") for row in rows])
            if key == "ruZh":
                ru_rows = rows
            else:
                zh_rows = rows
        references.append(entry)

    zh_values = set()
    zh_codes = set()
    if zh_rows:
        columns = list(zh_rows[0].keys())
        first_column = columns[0] if columns else ""
        code_column = columns[1] if len(columns) > 1 else ""
        zh_values = {str(row.get(first_column, "")).strip()
                     for row in zh_rows if str(row.get(first_column, "")).strip()}
        if code_column:
            zh_codes = {str(row.get(code_column, "")).strip()
                        for row in zh_rows if str(row.get(code_column, "")).strip()}
    missing_code = 0
    missing_items: List[Dict[str, str]] = []
    if ru_rows and zh_values:
        ru_columns = list(ru_rows[0].keys())
        target_column = ru_columns[1] if len(ru_columns) > 1 else ru_columns[0]
        translated = []
        for row in ru_rows:
            value = str(row.get(target_column, "")).strip()
            if value and value not in translated:
                translated.append(value)
        for value in translated:
            if value not in zh_values:
                missing_code += 1
                if len(missing_items) < 50:
                    missing_items.append({"value": value})
    references[0]["missingCode"] = missing_code
    references[0]["missingCodeSample"] = missing_items

    codes: List[Dict[str, Any]] = []
    codes_dir = config_dir / "codes"
    if codes_dir.is_dir():
        for path in sorted(codes_dir.glob("*.csv")):
            entry = {"name": path.stem, "path": _path_or_rel(path, root),
                     "exists": True, "count": 0, "columns": [], "sample": [],
                     "duplicateCodes": 0, "emptyCodes": 0, "duplicateNames": 0}
            try:
                columns, rows = _read_table_file(path)
                entry["columns"] = columns
                entry["count"] = len(rows)
                entry["sample"] = rows[:20]
                if columns:
                    code_column = "code" if "code" in columns else columns[0]
                    name_column = "name" if "name" in columns else (
                        columns[1] if len(columns) > 1 else code_column)
                    codes_stats = _duplicate_stats([row.get(code_column, "") for row in rows])
                    entry["duplicateCodes"] = codes_stats["duplicateCount"]
                    entry["emptyCodes"] = codes_stats["emptyCount"]
                    entry["duplicateNames"] = _duplicate_stats(
                        [row.get(name_column, "") for row in rows])["duplicateCount"]
            except Exception as exc:  # noqa: BLE001
                entry["error"] = str(exc)
            codes.append(entry)

    ru_count = references[0]["count"] if references else 0
    zh_count = references[1]["count"] if len(references) > 1 else 0
    code_count = len(zh_codes)
    coverage = round((ru_count - missing_code) / ru_count * 1000) / 10 if ru_count else 0.0
    return {
        "projectRoot": str(root),
        "references": references,
        "codes": codes,
        "entries": {
            "ruZh": references[0]["sample"] if references else [],
            "zhCode": references[1]["sample"] if len(references) > 1 else [],
        },
        "summary": {
            "referenceCount": len(references),
            "ruZhCount": ru_count,
            "zhCodeCount": zh_count,
            "codeTableCount": len(codes),
            "missingCode": missing_code,
            # 与 Host libraryStats 的命名保持兼容
            "ruCount": ru_count,
            "zhCount": zh_count,
            "codeCount": code_count,
            "ambiguous": 0,
            "coverage": coverage,
        },
    }


# ------------------------------------------------------------------ 命令：rules.resolve
def cmd_rules_resolve(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = _project_root(payload)
    cfg = _load_config(root)
    return {
        "projectRoot": str(root),
        "batch": payload.get("batch") or payload.get("batchId") or "",
        "fields": _rule_fields(cfg),
    }


# ------------------------------------------------------------------ 命令：demo.info
def cmd_demo_info(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not (payload.get("projectRoot") or payload.get("project_root")):
        candidate = ADAPTER_ROOT if (ADAPTER_ROOT / "config" / "project.yaml").is_file() else Path.cwd()
        payload = dict(payload)
        payload["projectRoot"] = str(candidate)
    root = _project_root(payload)
    cfg = _load_config(root)
    stats = _scan_tree_stats(list(cfg.source_roots or []),
                             upper=bool(cfg.opt("well_id_upper", False)))
    samples_dir = root / "samples"
    project_name = str(cfg.name or "")
    is_demo = bool(samples_dir.is_dir() or "样例" in project_name or "演示" in project_name)
    batches: List[str] = []
    try:
        from pdl import status as status_mod
        batches = status_mod.list_batches(root)
    except Exception:
        batches = []
    return {
        "projectRoot": str(root),
        "project": {"name": project_name, "root": str(root)},
        "name": project_name,
        "isDemo": is_demo,
        "samplesDir": str(samples_dir),
        "samplesExists": samples_dir.is_dir(),
        "sourceRoots": [
            {"path": str(path), "exists": path.is_dir()}
            for path in (cfg.source_roots or [])
        ],
        "counts": {"files": stats["files"], "bytes": stats["bytes"],
                   "wells": stats["wells"]},
        "batchCount": len(batches),
        "latestBatch": batches[0] if batches else None,
        "stages": [
            {"stage": "scan", "title": "扫描归井", "ready": stats["files"] > 0},
            {"stage": "merge", "title": "汇总核对", "ready": False},
            {"stage": "export", "title": "导出交付", "ready": False},
        ],
        "notes": [
            "演示工程使用合成样例；正式工程请以 config/project.yaml 为准。",
        ],
    }


# ------------------------------------------------------------------ 命令表 / 入口
COMMANDS = {
    "probe": cmd_probe,
    "batch.list": cmd_batch_list,
    "stage.plan": cmd_stage_plan,
    "stage.run": cmd_stage_run,
    "artifact.list": cmd_artifact_list,
    "artifact.preview": cmd_artifact_preview,
    "review.detect": cmd_review_detect,
    "reference.info": cmd_reference_info,
    "rules.resolve": cmd_rules_resolve,
    "demo.info": cmd_demo_info,
}


def dispatch(command: str, payload: Dict[str, Any]) -> Any:
    """供测试/宿主内嵌调用：执行命令并返回 data（异常向外抛）。"""
    handler = COMMANDS.get(command)
    if handler is None:
        raise AdapterError("未知命令：%s（允许：%s）"
                           % (command, ", ".join(sorted(COMMANDS))))
    if not isinstance(payload, dict):
        raise AdapterError("请求必须是 JSON 对象")
    return _json_safe(handler(payload))


def main(argv: Optional[Sequence[str]] = None) -> int:
    _configure_stdio()
    args = list(sys.argv if argv is None else argv)
    command = args[1] if len(args) > 1 else ""
    try:
        raw = sys.stdin.buffer.read() if hasattr(sys.stdin, "buffer") else sys.stdin.read()
        if isinstance(raw, str):
            raw = raw.encode("utf-8")
        text = _decode_bytes(raw)
        payload = json.loads(text) if text.strip() else {}
        if not isinstance(payload, dict):
            raise ValueError("请求必须是 JSON 对象")
    except Exception:
        _write_envelope({
            "ok": False,
            "error": {"code": "bad-request",
                      "message": "stdin 不是合法 JSON 对象",
                      "detail": traceback.format_exc()},
        })
        return 2
    try:
        data = dispatch(command, payload)
        _write_envelope({"ok": True, "data": data})
        return 0
    except Exception as exc:  # noqa: BLE001 - 契约要求所有异常都落 JSON 信封
        _write_envelope({
            "ok": False,
            "error": {"code": "adapter-error",
                      "message": str(exc),
                      "detail": traceback.format_exc()},
        })
        return 0


if __name__ == "__main__":
    sys.exit(main())
