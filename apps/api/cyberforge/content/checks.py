"""Cross-content checks shared by `pnpm validate:content` and the `cyberforge` CLI."""

from __future__ import annotations

from datetime import UTC, datetime

from cyberforge.content.loader import ContentBundle, ContentIssue
from cyberforge.services import simulation
from cyberforge.services.sigma_engine import (
    EvalEvent,
    SigmaEngine,
    SigmaEngineError,
    compile_rule,
)


def check_scenarios(bundle: ContentBundle, issues: list[ContentIssue]) -> None:
    """Each lab's scenario must fire exactly the rules its lab.yaml declares."""
    compiled = {}
    for rule in bundle.rules:
        if rule.format != "sigma":
            continue
        try:
            compiled[rule.slug] = compile_rule(rule.slug, rule.content)
        except SigmaEngineError as exc:
            issues.append(ContentIssue(rule.path, f"rule cannot be evaluated: {exc}"))
    engine = SigmaEngine(compiled.values())
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for lab in bundle.labs:
        rows = simulation.materialize(lab.scenario, start)
        events = [
            EvalEvent(i, r["timestamp"], r["fields"], r["logsource"]) for i, r in enumerate(rows)
        ]
        fired = {h.rule.slug for h in engine.evaluate(events)}
        expected = set(lab.doc.expected_detection.rules)
        where = f"labs/{lab.doc.domain}/{lab.doc.slug}"
        for slug in sorted(expected - fired):
            issues.append(ContentIssue(where, f"scenario does not trigger declared rule {slug!r}"))
        for slug in sorted(fired - expected):
            issues.append(
                ContentIssue(
                    where, f"scenario also triggers undeclared rule {slug!r}", level="warning"
                )
            )


def check_stories(bundle: ContentBundle) -> list[ContentIssue]:
    """Cross-checks for attack stories: references, time order, graph integrity, synthetic data,
    and that every detection a step declares really fires on that step's telemetry."""
    import json
    import re

    from cyberforge.content.synthetic import find_non_synthetic
    from cyberforge.services import stories as story_service

    issues: list[ContentIssue] = []
    techniques = {t["id"] for t in bundle.mitre_techniques}
    rules = {r.slug: r for r in bundle.rules}
    compiled = story_service.compile_sigma(bundle.rules)
    seen: set[str] = set()
    for story in bundle.stories:
        where = f"stories/{story.slug}.yaml"
        if story.slug in seen:
            issues.append(ContentIssue(where, "duplicate story slug"))
        seen.add(story.slug)

        step_ids = [s.id for s in story.steps]
        for dup in sorted({i for i in step_ids if step_ids.count(i) > 1}):
            issues.append(ContentIssue(where, f"duplicate step id {dup!r}"))
        times = [s.time for s in story.steps]
        if times != sorted(times):
            issues.append(ContentIssue(where, "step times must not go backwards"))

        evidence_ids = [e.id for s in story.steps for e in s.evidence]
        for dup in sorted({i for i in evidence_ids if evidence_ids.count(i) > 1}):
            issues.append(ContentIssue(where, f"duplicate evidence id {dup!r}"))
        qids = [q.id for s in story.steps for q in s.questions] + [
            s.decision.id for s in story.steps if s.decision
        ]
        for dup in sorted({i for i in qids if qids.count(i) > 1}):
            issues.append(ContentIssue(where, f"duplicate question/decision id {dup!r}"))
        cids = [c.id for c in story.containment]
        for dup in sorted({i for i in cids if cids.count(i) > 1}):
            issues.append(ContentIssue(where, f"duplicate containment id {dup!r}"))
        if not any(c.quality == "recommended" for c in story.containment):
            issues.append(ContentIssue(where, "containment needs at least one recommended action"))

        for tid in sorted(story.techniques()):
            if tid not in techniques:
                issues.append(ContentIssue(where, f"unknown MITRE identifier {tid}"))
        for link in story.attack_chain:
            if link.step not in step_ids:
                issues.append(ContentIssue(where, f"attack_chain references unknown step {link.step!r}"))

        # Graph: unique nodes, edges that connect known nodes, references that resolve.
        nodes: dict[str, str] = {}
        for step in story.steps:
            for node in step.graph_nodes:
                if node.id in nodes:
                    issues.append(ContentIssue(where, f"duplicate graph node {node.id!r}"))
                nodes[node.id] = node.type
                if node.type == "detection" and node.ref not in rules:
                    issues.append(ContentIssue(where, f"graph node {node.id!r}: unknown rule {node.ref!r}"))
                if node.type == "technique" and node.ref not in techniques:
                    issues.append(ContentIssue(where, f"graph node {node.id!r}: unknown technique {node.ref!r}"))
        known_so_far: set[str] = set()
        for step in story.steps:
            known_so_far |= {n.id for n in step.graph_nodes}
            for edge in step.graph_edges:
                for end in (edge.source, edge.target):
                    if end not in known_so_far:
                        issues.append(
                            ContentIssue(where, f"step {step.id}: edge uses node {end!r} before it is defined")
                        )

        # Detections: declared rules must exist and must fire on that step's telemetry.
        _rows, hits = story_service.evaluate(story, compiled)
        for step, step_hits in zip(story.steps, hits, strict=True):
            for slug in step.detections:
                if slug not in rules:
                    issues.append(ContentIssue(where, f"step {step.id}: unknown rule {slug!r}"))
                elif slug not in step_hits.rules:
                    issues.append(
                        ContentIssue(where, f"step {step.id}: rule {slug!r} does not fire on this step's telemetry")
                    )
            for slug in sorted(set(step_hits.rules) - set(step.detections)):
                issues.append(
                    ContentIssue(where, f"step {step.id}: rule {slug!r} also fires but is not declared", level="warning")
                )
            if step.alert and step.alert.rule and step.alert.rule not in step.detections:
                issues.append(ContentIssue(where, f"step {step.id}: alert rule {step.alert.rule!r} is not in `detections`"))
            for slug in step.detections:
                if slug in rules and rules[slug].format != "sigma":
                    issues.append(ContentIssue(where, f"step {step.id}: only Sigma rules can be evaluated in stories"))

        # Everything must be synthetic: addresses and URLs in telemetry, evidence and narrative.
        blob = json.dumps(story.model_dump(), default=str)
        for bad in find_non_synthetic(blob):
            issues.append(ContentIssue(where, f"non-synthetic address or host {bad!r}: use RFC 5737 / RFC 1918 addresses and *.example names"))
        if re.search(r"[A-Za-z0-9+/]{200,}", blob):
            issues.append(ContentIssue(where, "unusually long encoded blob: keep payloads short and harmless", level="warning"))
    return issues


def check_datasets(bundle: ContentBundle) -> list[ContentIssue]:
    """Each playground dataset must trigger every rule it lists in `expected_rules`."""
    from cyberforge.content.synthetic import find_non_synthetic
    from cyberforge.services import playground

    issues: list[ContentIssue] = []
    for ds in bundle.playground_datasets:
        where = f"datasets/playground/{ds.slug}.yaml"
        try:
            fired = playground.rules_fired(bundle.rules, ds)
        except playground.PlaygroundError as exc:
            issues.append(ContentIssue(where, str(exc)))
            continue
        for slug in ds.expected_rules:
            if slug not in fired:
                issues.append(ContentIssue(where, f"dataset does not trigger expected rule {slug!r}"))
        for bad in find_non_synthetic(ds.model_dump_json()):
            issues.append(ContentIssue(where, f"non-synthetic address or host {bad!r}"))
    return issues
