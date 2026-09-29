"""Detection playground: run and explain a rule against a curated dataset or custom samples.

Sigma is evaluated by the real engine, YARA and Suricata by the small teaching evaluators in
`yara_lite` and `suricata_lite`. Everything here is read-only and works on synthetic data:
nothing is scanned, executed or sent anywhere.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from cyberforge.content.schemas import PlaygroundDataset, ScenarioEvent
from cyberforge.services import (
    sigma_explain,
    sigma_service,
    simulation,
    suricata_lite,
    telemetry,
    yara_lite,
)
from cyberforge.services.sigma_engine import (
    CompiledRule,
    EvalEvent,
    SigmaEngine,
    SigmaEngineError,
    compile_rule,
    match_event,
)

# Fixed so datasets look the same on every run (and in every screenshot).
DATASET_START = datetime(2026, 3, 10, 9, 0, 0, tzinfo=UTC)
MAX_ITEMS = 500
MAX_CUSTOM_SAMPLE = 64 * 1024


class PlaygroundError(ValueError):
    pass


@dataclass
class Item:
    """One event (Sigma, Suricata) or one file (YARA)."""

    index: int
    kind: str  # event | file
    title: str  # one-line summary
    offset: float = 0.0
    timestamp: datetime | None = None
    category: str | None = None
    source: str | None = None
    host: str | None = None
    user: str | None = None
    raw: str = ""
    fields: dict[str, Any] = field(default_factory=dict)
    logsource: dict[str, str] = field(default_factory=dict)
    note: str | None = None
    data: bytes = b""  # file content

    def public(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "kind": self.kind,
            "title": self.title,
            "offset_seconds": self.offset,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "category": self.category,
            "source": self.source,
            "host": self.host,
            "user": self.user,
            "raw": self.raw,
            "fields": self.fields if self.kind == "event" else {},
            "note": self.note,
            "size": len(self.data) if self.kind == "file" else None,
        }


# --- building items -----------------------------------------------------------------------------


def dataset_items(ds: PlaygroundDataset) -> list[Item]:
    if ds.kind == "files":
        items = []
        for i, f in enumerate(ds.files):
            data = (bytes.fromhex(f.hex_prefix) if f.hex_prefix else b"") + f.text().encode("utf-8")
            items.append(Item(i, "file", f.name, raw=f.text(), note=f.description, data=data))
        return items
    return _event_items(ds.events)


def _event_items(events: list[ScenarioEvent]) -> list[Item]:
    items: list[Item] = []
    expanded = simulation.expand(events)
    if len(expanded) > MAX_ITEMS * 4:
        raise PlaygroundError("dataset too large")
    for offset, ev in expanded:
        ts = DATASET_START + timedelta(seconds=offset)
        row = telemetry.normalize(
            ev.category, ts, ev.host, ev.user, ev.fields, action=ev.action, outcome=ev.outcome
        )
        headline = row["command_line"] or row["message"]
        items.append(
            Item(
                len(items), "event", str(headline)[:240], offset, ts, ev.category, row["source"],
                row["host"], row["user"], row["raw"], row["fields"], row["logsource"], ev.note,
            )
        )  # fmt: skip
    return items


def custom_items(events: list[dict[str, Any]] | None, files: list[dict[str, Any]] | None) -> list[Item]:
    """Items from user-supplied JSON events ({category, fields, host?, user?, t?}) or text samples."""
    if files:
        out = []
        for i, f in enumerate(files[:MAX_ITEMS]):
            text = str(f.get("content", ""))[:MAX_CUSTOM_SAMPLE]
            out.append(Item(i, "file", str(f.get("name") or f"sample-{i + 1}"), raw=text, data=text.encode()))
        return out
    items: list[Item] = []
    for i, ev in enumerate((events or [])[:MAX_ITEMS]):
        fields = ev.get("fields")
        if not isinstance(fields, dict):
            raise PlaygroundError(f"event {i + 1}: `fields` must be an object")
        category = ev.get("category")
        ls: dict[str, str] = dict(ev.get("logsource") or {})
        if category:
            if not telemetry.known_category(category):
                raise PlaygroundError(f"event {i + 1}: unknown category {category!r}")
            ls = ls or dict(telemetry.CATEGORIES[category].logsource)
        offset = float(ev.get("t", i))
        ts = DATASET_START + timedelta(seconds=offset)
        if category:
            row = telemetry.normalize(category, ts, ev.get("host"), ev.get("user"), fields)
            items.append(
                Item(i, "event", row["message"], offset, ts, category, row["source"], row["host"],
                     row["user"], row["raw"], row["fields"], row["logsource"])
            )  # fmt: skip
        else:
            items.append(Item(i, "event", ", ".join(f"{k}={v}" for k, v in list(fields.items())[:3]), offset, ts, None, None,
                              ev.get("host"), ev.get("user"), "", dict(fields), ls))  # fmt: skip
    return items


def _eval_events(items: list[Item], rule: CompiledRule) -> list[EvalEvent]:
    out = []
    for it in items:
        ls = it.logsource or dict(rule.logsource)
        out.append(EvalEvent(it.index, it.timestamp or DATASET_START, it.fields, ls))
    return out


# --- run ----------------------------------------------------------------------------------------


def run(
    fmt: str, content: str, items: list[Item], known_techniques: dict[str, str]
) -> dict[str, Any]:
    if fmt == "sigma":
        return _run_sigma(content, items, known_techniques)
    if fmt == "yara":
        return _run_yara(content, items)
    if fmt == "suricata":
        return _run_suricata(content, items)
    raise PlaygroundError(f"unsupported format {fmt!r}")


def _verdict(matched: bool | None) -> str:
    return "matched" if matched else "no_match" if matched is False else "not_applicable"


def _run_sigma(content: str, items: list[Item], known: dict[str, str]) -> dict[str, Any]:
    report = sigma_service.validate(content, set(known))
    base: dict[str, Any] = {"format": "sigma", "valid": report.valid, "errors": report.errors,
                            "warnings": report.warnings, "results": [], "matched_count": 0,
                            "item_count": len(items), "correlation": None}  # fmt: skip
    meta = report.meta
    if meta:
        base["meta"] = {
            "title": meta.title, "level": meta.level, "status": meta.status,
            "description": meta.description, "logsource": meta.logsource,
            "techniques": meta.techniques, "falsepositives": meta.falsepositives,
            "references": meta.references, "is_correlation": meta.is_correlation, "fields": meta.fields,
        }  # fmt: skip
        base["mitre"] = [{"id": t, "name": known.get(t), "known": t in known} for t in meta.techniques]
    if not report.valid:
        return base
    try:
        rule = compile_rule("playground", content)
    except SigmaEngineError as exc:
        base.update(valid=False, errors=[str(exc)])
        return base

    events = _eval_events(items, rule)
    if rule.is_correlation:
        engine = SigmaEngine([rule])
        hits = engine.evaluate(events)
        member = {e.id for h in hits for e in h.events}
        base["correlation"] = sigma_explain.explain_correlation(rule, events)
        base["results"] = [
            {"index": it.index, "verdict": _verdict(it.index in member), "matched_fields": []}
            for it in items
        ]
        base["matched_count"] = len(member)
        return base

    results = []
    for it, ev in zip(items, events, strict=True):
        ok, trace = match_event(rule, ev)
        results.append(
            {"index": it.index, "verdict": _verdict(ok),
             "matched_fields": sorted({t["field"] for t in trace})}
        )  # fmt: skip
    base["results"] = results
    base["matched_count"] = sum(r["verdict"] == "matched" for r in results)
    return base


def _run_yara(content: str, items: list[Item]) -> dict[str, Any]:
    base: dict[str, Any] = {"format": "yara", "valid": True, "errors": [], "warnings": [],
                            "results": [], "matched_count": 0, "item_count": len(items),
                            "correlation": None}  # fmt: skip
    try:
        parsed = yara_lite.parse(content)
    except Exception as exc:
        base.update(valid=False, errors=[f"YARA syntax error: {exc}"])
        return base
    meta: dict[str, Any] = {}
    for m in parsed.get("metadata", []):
        meta.update(m)
    technique = meta.get("mitre_attack")
    base["meta"] = {
        "title": str(meta.get("title", parsed["rule_name"])), "level": str(meta.get("severity", "medium")),
        "status": str(meta.get("status", "")), "description": str(meta.get("description", "")),
        "logsource": {"kind": "file"}, "techniques": [technique] if technique else [],
        "falsepositives": [str(meta["false_positives"])] if meta.get("false_positives") else [],
        "references": [str(meta["reference"])] if meta.get("reference") else [], "is_correlation": False,
        "fields": [],
    }  # fmt: skip
    base["mitre"] = []
    for it in items:
        if it.kind != "file":
            base["results"].append({"index": it.index, "verdict": "not_applicable", "matched_fields": []})
            continue
        exp = yara_lite.evaluate(content, it.data)
        verdict = "not_applicable" if exp.unsupported else _verdict(exp.matched)
        if exp.unsupported:
            base["warnings"] = [*base["warnings"], f"Preview limitation: {exp.unsupported}"][:3]
        base["results"].append(
            {"index": it.index, "verdict": verdict,
             "matched_fields": [s.name for s in exp.strings if s.matched]}
        )  # fmt: skip
    base["matched_count"] = sum(r["verdict"] == "matched" for r in base["results"])
    return base


def _run_suricata(content: str, items: list[Item]) -> dict[str, Any]:
    base: dict[str, Any] = {"format": "suricata", "valid": True, "errors": [], "warnings": [],
                            "results": [], "matched_count": 0, "item_count": len(items),
                            "correlation": None}  # fmt: skip
    try:
        parsed = suricata_lite.parse(content)
    except suricata_lite.SuricataError as exc:
        base.update(valid=False, errors=[str(exc)])
        return base
    base["meta"] = {
        "title": parsed.msg, "level": "medium", "status": "", "description": "",
        "logsource": {"protocol": parsed.protocol}, "techniques": [], "falsepositives": [],
        "references": [], "is_correlation": False, "fields": [],
    }  # fmt: skip
    base["mitre"] = []
    if parsed.metadata:
        import re

        technique = re.search(r"mitre_technique_id\s+(T\d{4}(?:\.\d{3})?)", parsed.metadata)
        if technique:
            base["meta"]["techniques"] = [technique.group(1)]
    for it in items:
        exp = suricata_lite.evaluate(content, it.fields) if it.kind == "event" else None
        matched = exp.matched if exp else None
        base["results"].append(
            {"index": it.index, "verdict": _verdict(matched),
             "matched_fields": sorted({c.buffer for c in exp.checks if c.matched}) if exp else []}
        )  # fmt: skip
    base["matched_count"] = sum(r["verdict"] == "matched" for r in base["results"])
    if parsed.protocol not in ("http", "dns"):
        base["warnings"] = [
            f"The {parsed.protocol} protocol has no telemetry here; only http and dns rules can be previewed."
        ]
    return base


# --- explain ------------------------------------------------------------------------------------


def explain(fmt: str, content: str, items: list[Item], index: int) -> dict[str, Any]:
    if not 0 <= index < len(items):
        raise PlaygroundError("no such event")
    item = items[index]
    if fmt == "sigma":
        try:
            rule = compile_rule("playground", content)
        except SigmaEngineError as exc:
            raise PlaygroundError(str(exc)) from exc
        events = _eval_events(items, rule)
        if rule.is_correlation:
            out: dict[str, Any] = {"kind": "correlation"}
            corr = sigma_explain.explain_correlation(rule, events)
            out["correlation"] = corr
            out["member_of"] = [
                i for i, h in enumerate(corr["hits"]) if index in h["event_indexes"]
            ]
            base_explanations = []
            for base in rule.bases:
                exp = sigma_explain.explain_event(base, events[index])
                base_explanations.append({"rule": base.slug.split(":")[-1], **exp.to_dict()})
            out["bases"] = base_explanations
            out["matched"] = bool(out["member_of"])
            return {"format": "sigma", "item": item.public(), **out}
        exp = sigma_explain.explain_event(rule, events[index])
        return {"format": "sigma", "kind": "event", "item": item.public(), "matched": exp.matched,
                "explanation": exp.to_dict()}  # fmt: skip
    if fmt == "yara":
        if item.kind != "file":
            raise PlaygroundError("YARA rules are evaluated against files, not events")
        yexp = yara_lite.evaluate(content, item.data)
        return {"format": "yara", "kind": "file", "item": item.public(), "matched": yexp.matched,
                "explanation": yexp.to_dict()}  # fmt: skip
    if fmt == "suricata":
        s = suricata_lite.evaluate(content, item.fields)
        return {"format": "suricata", "kind": "event", "item": item.public(), "matched": bool(s.matched),
                "explanation": s.to_dict()}  # fmt: skip
    raise PlaygroundError(f"unsupported format {fmt!r}")


# --- dataset contract -----------------------------------------------------------------------------


def rules_fired(rules: list[Any], ds: PlaygroundDataset) -> set[str]:
    """Slugs of the shipped rules (LoadedRule) that match at least one item of the dataset."""
    items = dataset_items(ds)
    fired: set[str] = set()
    sigma = []
    for rule in rules:
        if rule.format == "sigma" and ds.kind == "events":
            try:
                sigma.append(compile_rule(rule.slug, rule.content))
            except SigmaEngineError:
                continue
        elif rule.format == "yara" and ds.kind == "files":
            if any(yara_lite.evaluate(rule.content, it.data).matched for it in items):
                fired.add(rule.slug)
        elif rule.format == "suricata" and ds.kind == "events":
            try:
                if any(suricata_lite.evaluate(rule.content, it.fields).matched for it in items):
                    fired.add(rule.slug)
            except suricata_lite.SuricataError:
                continue
    if sigma:
        evals = [EvalEvent(it.index, it.timestamp or DATASET_START, it.fields, it.logsource) for it in items]
        fired |= {h.rule.slug for h in SigmaEngine(sigma).evaluate(evals)}
    return fired
