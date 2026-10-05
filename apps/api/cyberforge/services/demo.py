"""Demo mode: turn a scripted scenario into a playable, fully derived incident.

Everything the viewer sees is computed from the scenario's telemetry: which rules fire, when the
alerts are raised, how the incident's severity escalates, which ATT&CK techniques appear, the
process chain, and the incident summary. The analyst notes and containment steps come from the
scenario file. No AI and no external service is involved, and the same input always yields the
same script, so screenshots and recordings are reproducible.
"""

from __future__ import annotations

import ntpath
import random
from datetime import datetime, timedelta
from typing import Any

from cyberforge.content.demos import DemoScenario
from cyberforge.content.loader import ContentBundle
from cyberforge.services import playground, simulation
from cyberforge.services.sigma_engine import EvalEvent, SigmaEngine
from cyberforge.services.stories import STORY_DATE, compile_sigma

SEVERITY_ORDER = ["informational", "low", "medium", "high", "critical"]
ALERT_DELAY_SECONDS = 1.0  # detection to alert: a beat the viewer can see


def _rank(level: str) -> int:
    return SEVERITY_ORDER.index(level) if level in SEVERITY_ORDER else 0


def _clock(demo: DemoScenario) -> datetime:
    h, m, s = (int(p) for p in demo.start_clock.split(":"))
    return datetime(STORY_DATE.year, STORY_DATE.month, STORY_DATE.day, h, m, s, tzinfo=playground.DATASET_START.tzinfo)


def _basename(path: str) -> str:
    return ntpath.basename(path.replace("/", "\\")) or path


def _process_tree(events: list[dict[str, Any]]) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

    def node(image: str, host: str | None, t: float, flagged: bool) -> str:
        key = f"{host}:{_basename(image).lower()}"
        if key not in nodes:
            nodes[key] = {"id": key, "label": _basename(image), "host": host, "t": t, "flagged": flagged}
        else:
            nodes[key]["flagged"] = nodes[key]["flagged"] or flagged
        return key

    for ev in events:
        f = ev["fields"]
        flagged = bool(ev["detections"])
        if ev["category"] == "process_creation" and f.get("Image"):
            child = node(str(f["Image"]), ev["host"], ev["t"], flagged)
            if f.get("ParentImage"):
                parent = node(str(f["ParentImage"]), ev["host"], max(0.0, ev["t"] - 0.1), False)
                if not any(e["source"] == parent and e["target"] == child for e in edges):
                    edges.append({"source": parent, "target": child, "t": ev["t"]})
        elif ev["category"] == "process_access" and f.get("SourceImage") and f.get("TargetImage"):
            src = node(str(f["SourceImage"]), ev["host"], ev["t"], flagged)
            dst = node(str(f["TargetImage"]), ev["host"], ev["t"], flagged)
            edges.append({"source": src, "target": dst, "t": ev["t"], "kind": "access"})
    # The interesting chain: every flagged process and all of its ancestors.
    parents: dict[str, list[str]] = {}
    for e in edges:
        parents.setdefault(e["target"], []).append(e["source"])
    keep: set[str] = set()
    stack = [k for k, n in nodes.items() if n["flagged"]]
    while stack:
        key = stack.pop()
        if key in keep:
            continue
        keep.add(key)
        stack.extend(parents.get(key, []))
    for key, n in nodes.items():
        n["in_chain"] = key in keep
    return {"nodes": sorted(nodes.values(), key=lambda n: n["t"]), "edges": sorted(edges, key=lambda e: e["t"])}


def build_script(demo: DemoScenario, bundle: ContentBundle) -> dict[str, Any]:
    rules = {r.slug: r for r in bundle.rules}
    compiled = compile_sigma(bundle.rules)
    names = {t["id"]: t for t in bundle.mitre_techniques}
    tactic_names = {t["id"]: t["name"] for t in bundle.mitre_tactics if t["framework"] == "attack"}
    start = _clock(demo)

    rows = simulation.materialize(demo.events, start)
    offsets = [t for t, _ in simulation.expand(demo.events)]
    evals = [EvalEvent(i, r["timestamp"], r["fields"], r["logsource"]) for i, r in enumerate(rows)]
    hits = SigmaEngine(compiled.values()).evaluate(evals)
    by_event: dict[int, list[str]] = {}
    hit_rows: list[tuple[float, str, int]] = []
    for hit in hits:
        latest = max(hit.events, key=lambda e: (e.timestamp, e.id or 0))
        idx = latest.id or 0
        by_event.setdefault(idx, []).append(hit.rule.slug)
        hit_rows.append((offsets[idx], hit.rule.slug, idx))

    events: list[dict[str, Any]] = []
    for i, row in enumerate(rows):
        slugs = sorted(set(by_event.get(i, [])))
        level = max((rules[s].level for s in slugs), key=_rank, default="informational")
        events.append(
            {
                "id": f"evt-{i + 1}",
                "t": offsets[i],
                "timestamp": row["timestamp"].isoformat(),
                "host": row["host"],
                "user": row["user"],
                "source": row["source"],
                "category": row["category"],
                "message": row["message"],
                "command_line": row["command_line"],
                "raw": row["raw"],
                "fields": row["fields"],
                "note": row["note"],
                "detections": slugs,
                "severity": level,
            }
        )

    alerts: list[dict[str, Any]] = []
    for t, slug, idx in sorted(hit_rows, key=lambda h: (h[0], h[1])):
        rule = rules[slug]
        primary = rule.technique_ids[0] if rule.technique_ids else None
        alerts.append(
            {
                "id": f"ALT-{1001 + len(alerts)}",
                "t": round(t + ALERT_DELAY_SECONDS, 2),
                "rule": slug,
                "title": rule.title,
                "severity": rule.level,
                "event_id": events[idx]["id"],
                "host": events[idx]["host"],
                "technique": primary,
            }
        )

    seen: dict[str, dict[str, Any]] = {}
    for alert in alerts:
        for tid in rules[alert["rule"]].technique_ids:
            if tid in seen or tid not in names:
                continue
            tech = names[tid]
            seen[tid] = {
                "id": tid,
                "name": tech["name"],
                "tactics": [{"id": ta, "name": tactic_names.get(ta, ta)} for ta in tech["tactics"]],
                "t": alert["t"],
                "rule": alert["rule"],
            }
    techniques = list(seen.values())

    severity_timeline: list[dict[str, Any]] = [{"t": 0.0, "severity": "informational"}]
    for alert in alerts:
        if _rank(alert["severity"]) > _rank(severity_timeline[-1]["severity"]):
            severity_timeline.append({"t": alert["t"], "severity": alert["severity"]})

    tactics = [
        {"id": t["id"], "name": t["name"]}
        for t in sorted(bundle.mitre_tactics, key=lambda t: t.get("position", 0))
        if t["framework"] == "attack"
    ]
    containment = sorted((c.model_dump() for c in demo.containment), key=lambda c: c["t"])
    notes = sorted((n.model_dump() for n in demo.notes), key=lambda n: n["t"])
    summary = _summary(demo, events, alerts, techniques, severity_timeline, containment, start)

    return {
        "slug": demo.slug,
        "title": demo.title,
        "summary": demo.summary,
        "duration_seconds": demo.duration_seconds,
        "start": start.isoformat(),
        "host": demo.host,
        "user": demo.user,
        "events": events,
        "alerts": alerts,
        "techniques": techniques,
        "tactics": tactics,
        "process_tree": _process_tree(events),
        "severity_timeline": severity_timeline,
        "notes": notes,
        "containment": containment,
        "incident_summary": summary,
    }


def _mmss(seconds: float) -> str:
    total = round(seconds)
    return f"{total // 60:02d}:{total % 60:02d}"


def _summary(
    demo: DemoScenario,
    events: list[dict[str, Any]],
    alerts: list[dict[str, Any]],
    techniques: list[dict[str, Any]],
    severity_timeline: list[dict[str, Any]],
    containment: list[dict[str, Any]],
    start: datetime,
) -> dict[str, Any]:
    """A deterministic incident report. Facts come from the derived data; nothing is generated."""
    suspicious = [e for e in events if e["detections"]]
    first_bad = suspicious[0]["t"] if suspicious else 0.0
    first_alert = alerts[0]["t"] if alerts else first_bad
    contained_at = next((c["t"] for c in containment if c["state"] == "contained"), None)
    tactics = sorted({ta["name"] for t in techniques for ta in t["tactics"]})
    peak = severity_timeline[-1]["severity"]
    rules_fired = sorted({a["rule"] for a in alerts})
    clock = lambda t: (start + timedelta(seconds=t)).strftime("%H:%M:%S")  # noqa: E731
    headline = (
        f"{peak.capitalize()}-severity incident on {demo.host}: {len(alerts)} alerts, "
        f"{len(techniques)} ATT&CK techniques across {len(tactics)} tactics"
        + (f", contained {_mmss(contained_at - first_bad)} after the first malicious event." if contained_at is not None else ".")
    )
    chain = "; ".join(f"{clock(a['t'])} {a['title']}" for a in alerts[:6])
    paragraphs = [
        f"Between {clock(first_bad)} and {clock(alerts[-1]['t'] if alerts else first_bad)} the host {demo.host} "
        f"(user {demo.user}) produced {len(suspicious)} suspicious events among {len(events)} ingested. "
        f"{len(rules_fired)} detection rules fired and raised {len(alerts)} alerts; the first alert came "
        f"{first_alert - first_bad:.0f} second{'s' if round(first_alert - first_bad) != 1 else ''} after the first malicious event.",
        f"Sequence: {chain}{'…' if len(alerts) > 6 else ''}.",
        "Techniques observed: " + ", ".join(f"{t['id']} {t['name']}" for t in techniques) + ".",
        "Credential access means every credential in memory on the host must be treated as exposed. "
        "Reset the affected accounts, remove the persistence entry and hunt for the download address on other hosts.",
    ]
    return {
        "t": max(0.0, demo.duration_seconds - 6),
        "headline": headline,
        "paragraphs": paragraphs,
        "stats": {
            "events": len(events),
            "suspicious_events": len(suspicious),
            "alerts": len(alerts),
            "rules": len(rules_fired),
            "techniques": len(techniques),
            "tactics": len(tactics),
            "peak_severity": peak,
            "seconds_to_first_alert": round(first_alert - first_bad, 1),
            "seconds_to_containment": round(contained_at - first_bad, 1) if contained_at is not None else None,
        },
    }


# --- live event stream ----------------------------------------------------------------------------


def stream_pool(bundle: ContentBundle) -> list[dict[str, Any]]:
    """A mixed pool of synthetic events for the live stream: every match, and some ordinary traffic."""
    compiled = compile_sigma(bundle.rules)
    rules = {r.slug: r for r in bundle.rules}
    pool: list[dict[str, Any]] = []
    for ds in bundle.playground_datasets:
        if ds.kind != "events":
            continue
        items = playground.dataset_items(ds)
        evals = [EvalEvent(it.index, it.timestamp or playground.DATASET_START, it.fields, it.logsource) for it in items]
        matched: dict[int, list[str]] = {}
        for hit in SigmaEngine(compiled.values()).evaluate(evals):
            latest = max(hit.events, key=lambda e: (e.timestamp, e.id or 0))
            matched.setdefault(latest.id or 0, []).append(hit.rule.slug)
        for it in items:
            slugs = sorted(set(matched.get(it.index, [])))
            if not slugs and it.index % 6:
                continue  # keep a sixth of the ordinary traffic
            level = max((rules[s].level for s in slugs), key=_rank, default="informational")
            pool.append(
                {
                    "source": it.source,
                    "host": it.host or "-",
                    "event_type": it.category,
                    "message": it.title[:160],
                    "rule": rules[slugs[0]].title if slugs else None,
                    "rule_slug": slugs[0] if slugs else None,
                    "severity": level,
                    "dataset": ds.slug,
                }
            )
    random.Random(7).shuffle(pool)  # noqa: S311 - deterministic variety, not security
    return pool
