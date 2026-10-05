"""Sigma parsing, validation and translation (pySigma-backed)."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

import yaml
from sigma.backends.elasticsearch import LuceneBackend
from sigma.backends.kusto import KustoBackend
from sigma.backends.opensearch import OpensearchLuceneBackend
from sigma.backends.splunk import SplunkBackend
from sigma.collection import SigmaCollection
from sigma.conditions import (
    ConditionAND,
    ConditionFieldEqualsValueExpression,
    ConditionNOT,
    ConditionOR,
    ConditionValueExpression,
)
from sigma.correlations import (
    SigmaCorrelationCondition,
    SigmaCorrelationRule,
    SigmaCorrelationType,
)
from sigma.plugins import InstalledSigmaPlugins
from sigma.rule import SigmaRule
from sigma.types import (
    SigmaBool,
    SigmaCIDRExpression,
    SigmaCompareExpression,
    SigmaExists,
    SigmaExpansion,
    SigmaFieldReference,
    SigmaNull,
    SigmaNumber,
    SigmaRegularExpression,
    SigmaString,
    SpecialChars,
)
from sigma.validation import SigmaValidator

from cyberforge.services import sigma_pipelines

log = logging.getLogger(__name__)

MAX_RULE_BYTES = 64 * 1024

ATTACK_TAG = re.compile(r"^attack\.(t\d{4}(?:\.\d{3})?)$", re.IGNORECASE)
ATLAS_TAG = re.compile(r"^atlas\.(aml\.t\d{4}(?:\.\d{3})?)$", re.IGNORECASE)


@dataclass
class SigmaMeta:
    title: str = ""
    id: str | None = None
    name: str | None = None
    status: str | None = None
    level: str = "medium"
    description: str = ""
    author: str = ""
    logsource: dict[str, str] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    techniques: list[str] = field(default_factory=list)
    falsepositives: list[str] = field(default_factory=list)
    references: list[str] = field(default_factory=list)
    is_correlation: bool = False
    fields: list[str] = field(default_factory=list)


@dataclass
class ValidationReport:
    valid: bool
    errors: list[str]
    warnings: list[str]
    meta: SigmaMeta | None


@dataclass
class Translation:
    target: str
    label: str
    language: str
    queries: list[str] = field(default_factory=list)
    error: str | None = None
    notes: list[str] = field(default_factory=list)
    # Set when a processing pipeline mapped the rule's fields to the target's schema.
    pipeline: str | None = None
    pipeline_label: str | None = None
    field_changes: list[sigma_pipelines.FieldChange] = field(default_factory=list)
    added_fields: list[str] = field(default_factory=list)
    dropped_fields: list[str] = field(default_factory=list)
    # Why a requested pipeline could not be used (the query is then shown unmapped).
    pipeline_error: str | None = None


def technique_from_tag(tag: str) -> str | None:
    """attack.t1059.001 -> T1059.001 ; atlas.aml.t0051.000 -> AML.T0051.000"""
    if m := ATTACK_TAG.match(tag):
        return m.group(1).upper()
    if m := ATLAS_TAG.match(tag):
        return m.group(1).upper()
    return None


# --- metadata -----------------------------------------------------------------------------


def _load_documents(text: str) -> list[dict[str, Any]]:
    docs = [d for d in yaml.safe_load_all(text) if d is not None]
    if not docs or not all(isinstance(d, dict) for d in docs):
        raise ValueError("Sigma content must be one or more YAML mappings")
    return docs


def _collect_fields(rule: SigmaRule) -> list[str]:
    found: set[str] = set()
    for cond in rule.detection.parsed_condition:
        _walk_fields(cond.parsed, found)
    return sorted(found)


def _walk_fields(node: Any, out: set[str]) -> None:
    if isinstance(node, ConditionFieldEqualsValueExpression):
        out.add(node.field)
    for child in getattr(node, "args", []) or []:
        _walk_fields(child, out)


def parse_meta(text: str) -> SigmaMeta:
    """Extract metadata. Correlation files report the correlation rule as the main rule."""
    docs = _load_documents(text)
    main = next((d for d in docs if "correlation" in d), docs[0])
    base_docs = [d for d in docs if "detection" in d]
    logsource_raw = (base_docs[0].get("logsource") if base_docs else None) or {}
    logsource = {k: str(v) for k, v in logsource_raw.items()}
    tags = [str(t) for t in main.get("tags", [])]
    fields: list[str] = []
    try:
        collection = SigmaCollection.from_yaml(text)
        for rule in collection.rules:
            if isinstance(rule, SigmaRule):
                fields.extend(_collect_fields(rule))
    except Exception:
        # Metadata extraction is best-effort; validate() is what reports rule errors.
        log.debug("could not extract fields from Sigma rule", exc_info=True)
    references = main.get("references") or []
    if isinstance(references, str):
        references = [references]
    return SigmaMeta(
        title=str(main.get("title", "")),
        id=str(main["id"]) if main.get("id") else None,
        name=main.get("name"),
        status=main.get("status"),
        level=str(main.get("level", "medium")),
        description=str(main.get("description", "")).strip(),
        author=str(main.get("author", "")),
        logsource=logsource,
        tags=tags,
        techniques=sorted({t for tag in tags if (t := technique_from_tag(tag))}),
        falsepositives=[str(f) for f in (main.get("falsepositives") or [])],
        references=[str(r) for r in references],
        is_correlation="correlation" in main,
        fields=sorted(set(fields)),
    )


# --- validation ---------------------------------------------------------------------------


# pySigma's ATT&CK and D3FEND tag validators download the upstream MITRE data at first use and cache it
# under $HOME. CyberForge stays offline and checks tags against its own vendored dataset instead
# (see the `known_techniques` check in validate()).
_ONLINE_VALIDATORS = {"ATTACKTagValidator", "D3FENDTagValidator"}

_validator_classes = [
    v
    for v in InstalledSigmaPlugins.autodiscover().validators.values()
    if getattr(v, "__name__", "") not in _ONLINE_VALIDATORS
]
_VALIDATORS = SigmaValidator(_validator_classes)  # type: ignore[arg-type]


def validate(text: str, known_techniques: set[str] | None = None) -> ValidationReport:
    if len(text.encode("utf-8")) > MAX_RULE_BYTES:
        return ValidationReport(
            False, [f"Rule exceeds {MAX_RULE_BYTES // 1024} KiB limit"], [], None
        )
    try:
        meta = parse_meta(text)
    except (yaml.YAMLError, ValueError) as exc:
        return ValidationReport(False, [f"YAML: {exc}"], [], None)

    errors: list[str] = []
    warnings: list[str] = []
    try:
        collection = SigmaCollection.from_yaml(text, collect_errors=True)
    except Exception as exc:
        return ValidationReport(False, [str(exc)], [], meta)

    if not collection.rules:
        errors.append("No Sigma rule found in document")
    for rule in collection.rules:
        errors.extend(f"{type(e).__name__}: {e}" for e in rule.errors)
        if isinstance(rule, SigmaRule) and not rule.errors:
            try:
                for cond in rule.detection.parsed_condition:
                    _ = cond.parsed  # surfaces dangling identifiers / bad selectors
            except Exception as exc:
                errors.append(f"Condition error: {exc}")
            for issue in _VALIDATORS.validate_rule(rule):
                # `atlas.aml.tXXXX` is CyberForge's convention for MITRE ATLAS technique tags.
                if type(issue).__name__ == "InvalidNamespaceTagIssue" and str(
                    getattr(issue, "tag", "")
                ).startswith("atlas."):
                    continue
                warnings.append(f"{type(issue).__name__}: {issue}")
    if not errors:
        try:
            collection.resolve_rule_references()
        except Exception as exc:
            errors.append(f"Reference error: {exc}")

    if not meta.description:
        warnings.append("Missing description")
    if not meta.falsepositives:
        warnings.append("Missing falsepositives — document expected benign matches")
    if not meta.techniques:
        warnings.append("No MITRE ATT&CK tag (e.g. attack.t1059.001)")
    if known_techniques is not None:
        for tech in meta.techniques:
            if tech not in known_techniques:
                warnings.append(f"{tech} is not in CyberForge's curated MITRE dataset")
    return ValidationReport(valid=not errors, errors=errors, warnings=warnings, meta=meta)


# --- translation --------------------------------------------------------------------------

PIPELINE_NOTE = (
    "Field names are passed through unchanged. Choose a processing pipeline (ECS, Splunk, "
    "ASIM, ...) to map them to your platform's schema before running this against production data."
)
MAPPED_NOTE = (
    "Field names follow the {label} schema. Check them against your own data source before "
    "running this in production."
)
NO_PIPELINE_NOTE = (
    "No {label} pipeline changes this rule's fields ({logsource}), so field names are passed "
    "through unchanged."
)


def _pysigma_targets() -> dict[str, tuple[str, str, Any]]:
    return {
        "elastic": ("Elastic Query", "Lucene query string", LuceneBackend),
        "splunk": ("Splunk SPL", "SPL", SplunkBackend),
        "sentinel": ("Microsoft Sentinel / KQL", "KQL", KustoBackend),
        "opensearch": ("OpenSearch", "Lucene query string", OpensearchLuceneBackend),
    }


TARGET_IDS = ["elastic", "splunk", "sentinel", "opensearch", "sql"]


def _convert(
    backend_cls: Any, text: str, spec: sigma_pipelines.PipelineSpec | None
) -> tuple[list[str], sigma_pipelines.MappingReport | None]:
    """Translate ``text`` once. A fresh collection per call: pipelines rewrite rules in place."""
    collection = SigmaCollection.from_yaml(text)
    if spec is None:
        return [str(q) for q in backend_cls().convert(collection)], None
    tracker = sigma_pipelines.FieldTracker(collection)
    backend = backend_cls(processing_pipeline=spec.factory())
    queries = [str(q) for q in backend.convert(collection)]
    return queries, tracker.report()


def _short(reason: str, limit: int = 240) -> str:
    """First line of a pipeline error. pySigma appends the full list of valid fields."""
    line = reason.strip().splitlines()[0] if reason.strip() else reason
    return line if len(line) <= limit else line[: limit - 1] + "…"


def _describe_logsource(text: str) -> str:
    try:
        rules = [r for r in SigmaCollection.from_yaml(text).rules if isinstance(r, SigmaRule)]
    except Exception:  # validation reports malformed rules; this is only a note
        return "unknown log source"
    sources = {
        "/".join(v for v in (r.logsource.product, r.logsource.category, r.logsource.service) if v)
        or "any log source"
        for r in rules
    }
    return ", ".join(sorted(sources))


def _translate_with_pipelines(
    text: str, target: str, selection: str, out: Translation, backend_cls: Any
) -> None:
    """Fill ``out`` using the requested pipelines, falling back to the unmapped query."""
    candidates = sigma_pipelines.resolve(target, selection)
    first_failure: tuple[str, str] | None = None
    unmapped: list[str] | None = None

    def _unmapped() -> list[str]:
        nonlocal unmapped
        if unmapped is None:
            unmapped = _convert(backend_cls, text, None)[0]
        return unmapped

    ineffective: sigma_pipelines.PipelineSpec | None = None
    for spec in candidates:
        try:
            queries, report = _convert(backend_cls, text, spec)
        except Exception as exc:
            if first_failure is None:
                first_failure = (spec.label, _short(f"{type(exc).__name__}: {exc}"))
            continue
        # A pipeline can also change the query without renaming a field (Azure Monitor picks the
        # SecurityEvent table), so compare against the unmapped query too.
        if report is None or not (report.effective or queries != _unmapped()):
            ineffective = ineffective or spec
            continue
        out.queries = queries
        out.pipeline, out.pipeline_label = spec.id, spec.label
        out.field_changes = report.changes
        out.added_fields, out.dropped_fields = report.added, report.dropped
        out.notes = [MAPPED_NOTE.format(label=spec.label)]
        return

    # No pipeline produced a mapped query: show the unmapped one, and say why.
    out.queries = _unmapped()
    out.notes = [PIPELINE_NOTE]
    if first_failure:
        label, reason = first_failure
        out.pipeline_error = f"{label}: {reason}"
    elif ineffective and candidates:
        out.notes = [
            NO_PIPELINE_NOTE.format(label=ineffective.label, logsource=_describe_logsource(text))
        ]


def translate(
    text: str, targets: list[str] | None = None, pipelines: dict[str, str] | None = None
) -> list[Translation]:
    """Translate a rule to each target. ``pipelines`` maps a target to ``none`` (the default),
    ``auto`` or a pipeline id from :mod:`sigma_pipelines`."""
    if len(text.encode("utf-8")) > MAX_RULE_BYTES:
        raise ValueError(f"Rule exceeds {MAX_RULE_BYTES // 1024} KiB limit")
    wanted = targets or TARGET_IDS
    unknown = [t for t in wanted if t not in TARGET_IDS]
    if unknown:
        raise ValueError(f"Unknown translation target(s): {', '.join(unknown)}")
    selections = pipelines or {}
    for target, selection in selections.items():
        if target not in TARGET_IDS:
            raise ValueError(f"Unknown translation target '{target}' in pipelines")
        sigma_pipelines.resolve(target, selection)  # validates the selection before any work
    collection = SigmaCollection.from_yaml(text)
    results: list[Translation] = []
    registry = _pysigma_targets()
    for target in wanted:
        if target == "sql":
            results.append(_translate_sql(collection))
            continue
        label, language, backend_cls = registry[target]
        out = Translation(target, label, language, notes=[PIPELINE_NOTE])
        try:
            _translate_with_pipelines(
                text, target, selections.get(target, sigma_pipelines.NONE), out, backend_cls
            )
        except Exception as exc:
            out.queries = []
            out.error = f"{type(exc).__name__}: {exc}"
        results.append(out)
    return results


# --- generic SQL-like backend ------------------------------------------------------------


def _sql_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _like(pattern: SigmaString) -> tuple[str, bool]:
    parts: list[str] = []
    wild = False
    for part in pattern.s:
        if part is SpecialChars.WILDCARD_MULTI:
            parts.append("%")
            wild = True
        elif part is SpecialChars.WILDCARD_SINGLE:
            parts.append("_")
            wild = True
        else:
            parts.append(str(part).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_"))
    return "".join(parts), wild


def _sql_value(field_name: str, value: Any) -> str:
    col = _sql_ident(field_name)
    if isinstance(value, SigmaString):
        text, wild = _like(value)
        if wild:
            return f"{col} LIKE {_sql_str(text)} ESCAPE '\\'"
        return f"{col} = {_sql_str(value.to_plain())}"
    if isinstance(value, SigmaNumber):
        return f"{col} = {value.number}"
    if isinstance(value, SigmaBool):
        return f"{col} = {'TRUE' if value.boolean else 'FALSE'}"
    if isinstance(value, SigmaNull):
        return f"{col} IS NULL"
    if isinstance(value, SigmaExists):
        return f"{col} IS {'NOT ' if value.exists else ''}NULL"
    if isinstance(value, SigmaRegularExpression):
        return f"REGEXP_LIKE({col}, {_sql_str(str(value.regexp))})"
    if isinstance(value, SigmaCIDRExpression):
        return f"CIDR_MATCH({col}, {_sql_str(value.cidr)})"
    if isinstance(value, SigmaCompareExpression):
        op = {"LT": "<", "LTE": "<=", "GT": ">", "GTE": ">=", "NEQ": "<>"}[value.op.name]
        return f"{col} {op} {value.number.number}"
    if isinstance(value, SigmaFieldReference):
        return f"{col} = {_sql_ident(value.field)}"
    if isinstance(value, SigmaExpansion):
        return "(" + " OR ".join(_sql_value(field_name, v) for v in value.values) + ")"
    raise ValueError(f"unsupported value type {type(value).__name__}")


def _sql_node(node: Any) -> str:
    if isinstance(node, ConditionAND):
        return "(" + " AND ".join(_sql_node(a) for a in node.args) + ")"
    if isinstance(node, ConditionOR):
        return "(" + " OR ".join(_sql_node(a) for a in node.args) + ")"
    if isinstance(node, ConditionNOT):
        return "NOT " + _sql_node(node.args[0])
    if isinstance(node, ConditionFieldEqualsValueExpression):
        return _sql_value(node.field, node.value)
    if isinstance(node, ConditionValueExpression):
        text = node.value.to_plain() if isinstance(node.value, SigmaString) else str(node.value)
        return f"raw_message LIKE {_sql_str('%' + text + '%')}"
    raise ValueError(f"unsupported condition node {type(node).__name__}")


def _detection_where(rule: SigmaRule) -> str:
    return " OR ".join(_sql_node(c.parsed) for c in rule.detection.parsed_condition)


_OPS = {"LT": "<", "LTE": "<=", "GT": ">", "GTE": ">=", "EQ": "=", "NEQ": "<>"}


def _translate_sql(collection: SigmaCollection) -> Translation:
    out = Translation(
        "sql",
        "Generic SQL-like",
        "ANSI-style SQL",
        notes=[
            "Illustrative representation for review and teaching; function names such as "
            "REGEXP_LIKE and CIDR_MATCH vary by engine.",
            PIPELINE_NOTE,
        ],
    )
    try:
        referenced = {
            id(ref.rule)
            for rule in collection.rules
            if isinstance(rule, SigmaCorrelationRule)
            for ref in rule.referenced_rules
        }
        for rule in collection.rules:
            if id(rule) in referenced:
                continue  # rendered as part of the correlation that uses it
            if isinstance(rule, SigmaCorrelationRule):
                base = rule.referenced_rules[0].rule
                condition = rule.condition
                if not isinstance(base, SigmaRule) or not isinstance(
                    condition, SigmaCorrelationCondition
                ):
                    raise ValueError("unsupported correlation shape")
                where = _detection_where(base)
                cols = ", ".join(_sql_ident(g) for g in rule.group_by or [])
                agg = "COUNT(*)"
                if rule.type == SigmaCorrelationType.VALUE_COUNT and condition.fieldref:
                    agg = f"COUNT(DISTINCT {_sql_ident(str(condition.fieldref))})"
                elif rule.type not in (
                    SigmaCorrelationType.EVENT_COUNT,
                    SigmaCorrelationType.VALUE_COUNT,
                ):
                    raise ValueError(f"correlation type {rule.type.name.lower()} not supported")
                op = _OPS[condition.op.name]
                out.queries.append(
                    f"SELECT {cols + ', ' if cols else ''}{agg} AS matches\n"
                    f"FROM events\nWHERE {where}\n"
                    f"  AND event_time >= NOW() - INTERVAL '{rule.timespan.seconds} seconds'\n"
                    + (f"GROUP BY {cols}\n" if cols else "")
                    + f"HAVING {agg} {op} {condition.count}"
                )
            elif isinstance(rule, SigmaRule):
                out.queries.append(f"SELECT *\nFROM events\nWHERE {_detection_where(rule)}")
    except Exception as exc:
        out.queries = []
        out.error = f"{type(exc).__name__}: {exc}"
    return out
