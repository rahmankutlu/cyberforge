"""Detection workbench: rules, validation, translation and testing."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

import plyara
from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from cyberforge.api.deps import BundleDep, PageDep, SessionDep, detection_health, escape_like
from cyberforge.content.loader import _SURICATA, ContentBundle, _suricata_options
from cyberforge.content.schemas import ScenarioEvent
from cyberforge.db import utcnow
from cyberforge.models import Alert, DetectionRule, Lab, MitreTechnique, lab_rules
from cyberforge.schemas.common import Page, paginate
from cyberforge.schemas.detections import (
    CoverageOut,
    MitreLookup,
    QualityCheckOut,
    QualityResponse,
    RuleCreate,
    RuleDetail,
    RuleMeta,
    RulePatch,
    RuleQualityOut,
    RuleSummary,
    RuleTestCaseOut,
    RuleTestsOut,
    TestMatch,
    TestRequest,
    TestResponse,
    TranslateRequest,
    TranslateResponse,
    TranslationOut,
    ValidateRequest,
    ValidateResponse,
)
from cyberforge.services import (
    detection_engine,
    rule_quality,
    rule_tests,
    sigma_service,
    simulation,
    telemetry,
)
from cyberforge.services.sigma_engine import EvalEvent, SigmaEngine, SigmaEngineError, compile_rule

router = APIRouter(tags=["detections"])


# --- listing ------------------------------------------------------------------------------------


def _summaries(session: SessionDep, rules: list[DetectionRule]) -> list[RuleSummary]:
    ids = [r.id for r in rules]
    labs: dict[int, int] = dict(
        session.execute(
            select(lab_rules.c.rule_id, func.count())
            .where(lab_rules.c.rule_id.in_(ids))
            .group_by(lab_rules.c.rule_id)
        ).all()
    )
    alerts = dict(
        session.execute(
            select(Alert.rule_id, func.count())
            .where(Alert.rule_id.in_(ids))
            .group_by(Alert.rule_id)
        ).all()
    )
    out = []
    for r in rules:
        item = RuleSummary.model_validate(r)
        item.lab_count = labs.get(r.id, 0)
        item.alert_count = alerts.get(r.id, 0)
        out.append(item)
    return out


SORTS = {
    "title": DetectionRule.title,
    "level": DetectionRule.level,
    "format": DetectionRule.format,
    "updated_at": DetectionRule.updated_at,
    "status": DetectionRule.status,
}


@router.get("/detections", response_model=Page[RuleSummary], summary="List detection rules")
def list_detections(
    session: SessionDep,
    paging: PageDep,
    format: Annotated[Literal["sigma", "yara", "suricata"] | None, Query()] = None,
    level: Annotated[list[str] | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    technique: Annotated[str | None, Query(max_length=32)] = None,
    origin: Annotated[Literal["builtin", "user"] | None, Query()] = None,
    enabled: bool | None = None,
    sort: Annotated[str, Query(pattern="^(title|level|format|updated_at|status)$")] = "title",
    order: Literal["asc", "desc"] = "asc",
) -> dict[str, Any]:
    stmt = select(DetectionRule).options(selectinload(DetectionRule.techniques))
    if format:
        stmt = stmt.where(DetectionRule.format == format)
    if level:
        stmt = stmt.where(DetectionRule.level.in_(level))
    if origin:
        stmt = stmt.where(DetectionRule.origin == origin)
    if enabled is not None:
        stmt = stmt.where(DetectionRule.enabled.is_(enabled))
    if q:
        like = f"%{escape_like(q.lower())}%"
        stmt = stmt.where(
            or_(
                func.lower(DetectionRule.title).like(like, escape="\\"),
                func.lower(DetectionRule.slug).like(like, escape="\\"),
                func.lower(DetectionRule.description).like(like, escape="\\"),
            )
        )
    if technique:
        from cyberforge.models import rule_techniques

        ids = select(rule_techniques.c.rule_id).where(
            or_(
                rule_techniques.c.technique_id == technique,
                rule_techniques.c.technique_id.like(f"{escape_like(technique)}.%", escape="\\"),
            )
        )
        stmt = stmt.where(DetectionRule.id.in_(ids))
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    col = SORTS[sort]
    rows = (
        session.scalars(
            stmt.order_by(col.asc() if order == "asc" else col.desc(), DetectionRule.id)
            .offset(paging.offset)
            .limit(paging.page_size)
        )
        .unique()
        .all()
    )
    return paginate(_summaries(session, list(rows)), total, paging.page, paging.page_size)


_health = detection_health


def _quality_row(
    q: rule_quality.RuleQuality, bundle: ContentBundle, summary: rule_tests.RunSummary
) -> RuleQualityOut:
    rule = bundle.rule(q.slug)
    report = summary.report_for(q.slug)
    return RuleQualityOut(
        slug=q.slug,
        title=q.title,
        level=rule.level if rule else "medium",
        technique_ids=rule.technique_ids if rule else [],
        passed=q.passed,
        total=q.total,
        checks=[QualityCheckOut(**c.__dict__) for c in q.checks],
        positive_tests=report.positives if report else 0,
        negative_tests=report.negatives if report else 0,
        failing_tests=len(report.failures) if report else 0,
    )


@router.get(
    "/detections/quality",
    response_model=QualityResponse,
    summary="Detection test coverage and per-rule quality checks",
)
def detection_quality(request: Request, bundle: BundleDep) -> QualityResponse:
    summary, quality = _health(request, bundle)
    rows = [_quality_row(q, bundle, summary) for q in quality]
    return QualityResponse(
        coverage=CoverageOut(
            rules=summary.rule_count,
            tested=summary.tested_rules,
            percent=summary.coverage_percent,
            tests=summary.test_count,
            failing=summary.failure_count + summary.error_count,
        ),
        checks_passed=sum(q.passed for q in quality),
        checks_total=sum(q.total for q in quality),
        rules=rows,
    )


@router.get(
    "/detections/{slug}/tests",
    response_model=RuleTestsOut,
    summary="The tests that ship with a Sigma rule, and their latest results",
)
def get_rule_tests(slug: str, request: Request, bundle: BundleDep) -> RuleTestsOut:
    rule = bundle.rule(slug)
    if rule is None:
        raise HTTPException(404, "Rule not found")
    summary, quality = _health(request, bundle)
    report = summary.report_for(slug)
    q = next((x for x in quality if x.slug == slug), None)
    source = None
    if rule.tests_path:
        source = (bundle.root / rule.tests_path).read_text(encoding="utf-8")
    return RuleTestsOut(
        slug=slug,
        tests_path=rule.tests_path,
        source=source,
        errors=report.errors if report else [],
        cases=[
            RuleTestCaseOut(
                name=c.name,
                expected=c.expected,
                passed=c.passed,
                message=c.message,
                matched_events=c.matched_events,
                hits=c.hits,
                definition=c.definition,
            )
            for c in (report.cases if report else [])
        ],
        quality=_quality_row(q, bundle, summary) if q else None,
    )


@router.get("/detections/{slug}", response_model=RuleDetail, summary="Get a detection rule")
def get_detection(slug: str, session: SessionDep) -> RuleDetail:
    rule = session.scalar(
        select(DetectionRule)
        .where(DetectionRule.slug == slug)
        .options(selectinload(DetectionRule.techniques))
    )
    if rule is None:
        raise HTTPException(404, "Rule not found")
    base = _summaries(session, [rule])[0]
    labs = session.execute(
        select(Lab.slug, Lab.title, Lab.number)
        .join(lab_rules, lab_rules.c.lab_id == Lab.id)
        .where(lab_rules.c.rule_id == rule.id)
        .order_by(Lab.number)
    ).all()
    recent = list(
        session.scalars(
            select(Alert.id)
            .where(Alert.rule_id == rule.id)
            .order_by(Alert.timestamp.desc())
            .limit(10)
        )
    )
    return RuleDetail(
        **base.model_dump(), description=rule.description, content=rule.content, tags=rule.tags,
        false_positives=rule.false_positives, references=rule.references, source_path=rule.source_path,
        labs=[{"slug": s, "title": t, "number": n} for s, t, n in labs], recent_alert_ids=recent,
    )  # fmt: skip


# --- validation / translation / testing ----------------------------------------------------------


def _known_techniques(session: SessionDep) -> dict[str, str]:
    return dict(session.execute(select(MitreTechnique.id, MitreTechnique.name)).all())


def _validate_yara(content: str) -> tuple[list[str], list[str], dict[str, Any] | None]:
    try:
        parsed = plyara.Plyara().parse_string(content)
    except Exception as exc:
        return [f"YARA syntax error: {exc}"], [], None
    if not parsed:
        return ["No YARA rule found"], [], None
    rule = parsed[0]
    meta: dict[str, Any] = {}
    for item in rule.get("metadata", []):
        meta.update(item)
    warnings = []
    if not meta.get("description"):
        warnings.append("Missing meta.description")
    if not meta.get("mitre_attack"):
        warnings.append("No meta.mitre_attack technique")
    return (
        [],
        warnings,
        {
            "title": meta.get("title", rule["rule_name"]),
            "level": str(meta.get("severity", "medium")),
            "description": str(meta.get("description", "")),
            "author": str(meta.get("author", "")),
            "tags": list(rule.get("tags", [])),
            "techniques": [meta["mitre_attack"]] if meta.get("mitre_attack") else [],
        },
    )


def _validate_suricata(content: str) -> tuple[list[str], list[str], dict[str, Any] | None]:
    line = next(
        (
            ln.strip()
            for ln in content.splitlines()
            if ln.strip() and not ln.lstrip().startswith("#")
        ),
        "",
    )
    match = _SURICATA.match(line)
    if not match:
        return ["Not a valid Suricata rule. Expected: action proto src -> dst (options;)"], [], None
    opts = _suricata_options(match.group(5))
    errors = [f"Missing required option: {k}" for k in ("msg", "sid") if not opts.get(k)]
    tech = re.search(r"mitre_technique_id\s+(T\d{4}(?:\.\d{3})?)", opts.get("metadata", ""))
    warnings = [] if tech else ["No metadata mitre_technique_id"]
    return (
        errors,
        warnings,
        {
            "title": opts.get("msg", "").strip('"'),
            "level": "medium",
            "description": "",
            "author": "",
            "tags": [],
            "techniques": [tech.group(1)] if tech else [],
        },
    )


def do_validate(session: SessionDep, content: str, fmt: str) -> ValidateResponse:
    known = _known_techniques(session)
    if fmt == "sigma":
        report = sigma_service.validate(content, set(known))
        meta = RuleMeta(**report.meta.__dict__) if report.meta else None
        techniques = report.meta.techniques if report.meta else []
        errors, warnings = report.errors, report.warnings
    else:
        errors, warnings, raw = (
            _validate_yara(content) if fmt == "yara" else _validate_suricata(content)
        )
        meta = (
            RuleMeta(id=None, status=None, logsource={}, falsepositives=[], references=[], is_correlation=False, fields=[], **{k: raw[k] for k in ("title", "level", "description", "author", "tags", "techniques")})
            if raw else None
        )  # fmt: skip
        techniques = raw["techniques"] if raw else []
    return ValidateResponse(
        valid=not errors,
        format=fmt,
        errors=errors,
        warnings=warnings,
        meta=meta,
        mitre=[MitreLookup(id=t, name=known.get(t), known=t in known) for t in techniques],
    )


@router.post("/detections/validate", response_model=ValidateResponse, summary="Validate a rule")
def validate_rule(body: ValidateRequest, session: SessionDep) -> ValidateResponse:
    return do_validate(session, body.content, body.format)


@router.post(
    "/detections/translate", response_model=TranslateResponse, summary="Translate a Sigma rule"
)
def translate_rule(body: TranslateRequest, session: SessionDep) -> TranslateResponse:
    validation = do_validate(session, body.content, "sigma")
    if not validation.valid:
        return TranslateResponse(validation=validation, translations=[])
    try:
        translations = sigma_service.translate(
            body.content, list(body.targets) if body.targets else None
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return TranslateResponse(
        validation=validation,
        translations=[
            TranslationOut(
                target=t.target,
                label=t.label,
                language=t.language,
                queries=t.queries,
                error=t.error,
                notes=t.notes,
            )
            for t in translations
        ],
    )


@router.post(
    "/detections/test",
    response_model=TestResponse,
    summary="Test a Sigma rule against sample or lab events",
)
def test_rule(body: TestRequest, session: SessionDep) -> TestResponse:
    """Runs the real evaluation engine. Each event may carry a `category` (to pick its logsource) or an explicit `logsource`."""
    try:
        compiled = compile_rule("playground", body.content)
    except SigmaEngineError as exc:
        return TestResponse(
            valid=False,
            errors=[str(exc)],
            event_count=0,
            matched_count=0,
            matches=[],
            correlation=[],
        )

    now = datetime.now(UTC)
    evals: list[EvalEvent] = []
    if body.lab_slug:
        lab = session.scalar(select(Lab).where(Lab.slug == body.lab_slug))
        if lab is None:
            raise HTTPException(404, "Lab not found")
        rows = simulation.materialize(
            [ScenarioEvent.model_validate(e) for e in lab.scenario_events], now
        )
        evals = [
            EvalEvent(i, r["timestamp"], r["fields"], r["logsource"]) for i, r in enumerate(rows)
        ]
    elif body.events:
        for i, ev in enumerate(body.events):
            ls = dict(ev.logsource or {})
            if not ls and ev.category and telemetry.known_category(ev.category):
                ls = dict(telemetry.CATEGORIES[ev.category].logsource)
            if not ls:  # unspecified: let the rule's own logsource apply
                ls = dict(compiled.logsource)
            evals.append(EvalEvent(i, now, ev.fields, ls))
    else:
        raise HTTPException(422, "Provide either events or lab_slug")

    matches: list[TestMatch] = []
    correlation: list[dict[str, Any]] = []
    if compiled.is_correlation:
        for hit in SigmaEngine([compiled]).evaluate(evals):
            correlation.append(
                {
                    "event_indexes": [e.id for e in hit.events],
                    "group": hit.group,
                    "details": hit.details,
                }
            )
        matched_ids = {i for c in correlation for i in c["event_indexes"]}
        matches = [
            TestMatch(
                index=e.id or 0,
                matched=(e.id in matched_ids),
                trace=[],
                summary="part of a correlated match"
                if e.id in matched_ids
                else "no correlation match",
            )
            for e in evals
        ]
    else:
        from cyberforge.services.sigma_engine import match_event

        for e in evals:
            ok, trace = match_event(compiled, e)
            matches.append(
                TestMatch(
                    index=e.id or 0,
                    matched=ok,
                    trace=trace,
                    summary="matched" if ok else "no match",
                )
            )
    return TestResponse(
        valid=True,
        errors=[],
        event_count=len(evals),
        matched_count=sum(m.matched for m in matches),
        matches=matches,
        correlation=correlation,
    )


# --- user-authored rules --------------------------------------------------------------------------


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80]
    return f"user-{slug or 'rule'}"


@router.post(
    "/detections",
    response_model=RuleDetail,
    status_code=201,
    summary="Create a user detection rule",
)
def create_detection(body: RuleCreate, session: SessionDep) -> RuleDetail:
    if body.format != "sigma":
        raise HTTPException(
            422, "Only Sigma rules can be created in v0.1 (YARA and Suricata are file-based)"
        )
    known = _known_techniques(session)
    report = sigma_service.validate(body.content, set(known))
    if not report.valid or report.meta is None:
        raise HTTPException(422, {"message": "Rule is not valid", "errors": report.errors})
    meta = report.meta
    try:
        compile_rule("check", body.content)
    except SigmaEngineError as exc:
        raise HTTPException(
            422, {"message": "Rule cannot be evaluated by the engine", "errors": [str(exc)]}
        ) from exc
    slug, n = _slugify(meta.title), 1
    while session.scalar(select(DetectionRule.id).where(DetectionRule.slug == slug)):
        n += 1
        slug = f"{_slugify(meta.title)}-{n}"
    rule = DetectionRule(
        slug=slug, title=meta.title, format="sigma", status=meta.status or "experimental", level=meta.level,
        description=meta.description, content=body.content, logsource=meta.logsource, tags=meta.tags,
        false_positives=meta.falsepositives, references=meta.references, author=meta.author or "You",
        is_correlation=meta.is_correlation, origin="user", enabled=True, source_path="user",
    )  # fmt: skip
    rule.techniques = list(
        session.scalars(select(MitreTechnique).where(MitreTechnique.id.in_(meta.techniques)))
    )
    session.add(rule)
    session.flush()
    detection_engine.clear_cache()
    return get_detection(slug, session)


@router.patch(
    "/detections/{slug}",
    response_model=RuleDetail,
    summary="Enable/disable a rule or edit a user rule",
)
def patch_detection(slug: str, body: RulePatch, session: SessionDep) -> RuleDetail:
    rule = session.scalar(select(DetectionRule).where(DetectionRule.slug == slug))
    if rule is None:
        raise HTTPException(404, "Rule not found")
    if body.content is not None:
        if rule.origin != "user":
            raise HTTPException(
                403, "Built-in rules are read-only. Copy the rule to create your own version."
            )
        report = sigma_service.validate(body.content, set(_known_techniques(session)))
        if not report.valid or report.meta is None:
            raise HTTPException(422, {"message": "Rule is not valid", "errors": report.errors})
        rule.content = body.content
        rule.title, rule.level, rule.description = (
            report.meta.title,
            report.meta.level,
            report.meta.description,
        )
        rule.logsource, rule.tags = report.meta.logsource, report.meta.tags
        rule.false_positives, rule.is_correlation = (
            report.meta.falsepositives,
            report.meta.is_correlation,
        )
        rule.techniques = list(
            session.scalars(
                select(MitreTechnique).where(MitreTechnique.id.in_(report.meta.techniques))
            )
        )
        rule.updated_at = utcnow()
    if body.enabled is not None:
        rule.enabled = body.enabled
    session.flush()
    detection_engine.clear_cache()
    return get_detection(slug, session)


@router.delete("/detections/{slug}", status_code=204, summary="Delete a user rule")
def delete_detection(slug: str, session: SessionDep) -> None:
    rule = session.scalar(select(DetectionRule).where(DetectionRule.slug == slug))
    if rule is None:
        raise HTTPException(404, "Rule not found")
    if rule.origin != "user":
        raise HTTPException(403, "Built-in rules cannot be deleted; disable them instead.")
    session.delete(rule)
    detection_engine.clear_cache()
