"""Sigma processing pipelines: map a rule's field names to a SIEM's schema before translating.

A Sigma rule uses the field names of its log source (``CommandLine``, ``Image``). A SIEM stores
the same data under its own schema (``process.command_line`` in ECS, ``TargetProcessCommandLine``
in Microsoft Sentinel's ASIM). pySigma ships processing pipelines for the common schemas; this
module registers the ones CyberForge offers, decides which one fits a rule, and reports exactly
which fields a pipeline renamed, added or dropped so a translation can be trusted or corrected.

pySigma pipelines rewrite a rule **in place**. Every attempt therefore parses the rule again.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any

from sigma.collection import SigmaCollection
from sigma.pipelines.azuremonitor import azure_monitor_pipeline
from sigma.pipelines.elasticsearch.windows import ecs_windows
from sigma.pipelines.microsoftxdr import microsoft_xdr_pipeline
from sigma.pipelines.sentinelasim import sentinel_asim_pipeline
from sigma.pipelines.splunk import splunk_cim_data_model, splunk_windows_pipeline
from sigma.processing.pipeline import ProcessingPipeline
from sigma.rule import SigmaDetection, SigmaDetectionItem, SigmaRule

NONE = "none"
AUTO = "auto"


@dataclass(frozen=True)
class PipelineSpec:
    id: str
    label: str
    description: str
    factory: Callable[[], ProcessingPipeline]


# Per translation target, the pipelines pySigma provides for it. Order matters for "auto".
REGISTRY: dict[str, tuple[PipelineSpec, ...]] = {
    "elastic": (
        PipelineSpec(
            "ecs_windows",
            "ECS (Windows)",
            "Elastic Common Schema field names for Windows and Sysmon logs (Winlogbeat).",
            ecs_windows,
        ),
    ),
    "opensearch": (
        PipelineSpec(
            "ecs_windows",
            "ECS (Windows)",
            "Elastic Common Schema field names for Windows and Sysmon logs (Winlogbeat).",
            ecs_windows,
        ),
    ),
    "splunk": (
        PipelineSpec(
            "splunk_windows",
            "Splunk (Windows)",
            "Field names and sourcetypes for the Splunk Add-on for Microsoft Windows and Sysmon.",
            splunk_windows_pipeline,
        ),
        PipelineSpec(
            "splunk_cim",
            "Splunk CIM data models",
            "Search the CIM data models (tstats). Supports process, file and registry events only.",
            splunk_cim_data_model,
        ),
    ),
    "sentinel": (
        PipelineSpec(
            "sentinel_asim",
            "Microsoft Sentinel ASIM",
            "Advanced Security Information Model parsers such as imProcessCreate.",
            sentinel_asim_pipeline,
        ),
        PipelineSpec(
            "azure_monitor",
            "Azure Monitor tables",
            "Native Log Analytics tables such as SecurityEvent and DeviceProcessEvents.",
            azure_monitor_pipeline,
        ),
        PipelineSpec(
            "microsoft_xdr",
            "Microsoft Defender XDR",
            "Advanced hunting tables such as DeviceProcessEvents.",
            microsoft_xdr_pipeline,
        ),
    ),
}

# Pipelines tried, in order, when a client asks for "auto". The first that translates the rule
# and changes something wins. CIM is opt-in because it only covers a few event types.
AUTO_ORDER: dict[str, tuple[str, ...]] = {
    "elastic": ("ecs_windows",),
    "opensearch": ("ecs_windows",),
    "splunk": ("splunk_windows",),
    "sentinel": ("sentinel_asim", "azure_monitor", "microsoft_xdr"),
}


def pipelines_for(target: str) -> tuple[PipelineSpec, ...]:
    return REGISTRY.get(target, ())


def resolve(target: str, selection: str) -> list[PipelineSpec]:
    """The pipelines to try for ``selection``: ``none``, ``auto`` or one pipeline id."""
    if selection == NONE or target not in REGISTRY:
        return []
    available = {spec.id: spec for spec in REGISTRY[target]}
    if selection == AUTO:
        return [available[pid] for pid in AUTO_ORDER[target]]
    if selection not in available:
        options = ", ".join([NONE, AUTO, *available])
        raise ValueError(f"Unknown pipeline '{selection}' for target '{target}' (use {options})")
    return [available[selection]]


# --- field tracking ----------------------------------------------------------------------------

_TAG = "_cf_source"


@dataclass(frozen=True)
class _Node:
    """A frozen picture of a detection tree: an item (``field``) or a group (``children``)."""

    field: str | None = None
    tag: str | None = None
    children: tuple[_Node, ...] | None = None


@dataclass(frozen=True)
class FieldChange:
    source: str
    targets: tuple[str, ...]

    @property
    def changed(self) -> bool:
        return self.targets != (self.source,)


@dataclass
class MappingReport:
    changes: list[FieldChange] = field(default_factory=list)
    added: list[str] = field(default_factory=list)  # fields the pipeline introduced
    dropped: list[str] = field(default_factory=list)  # rule fields the pipeline removed

    @property
    def effective(self) -> bool:
        return bool(self.added or self.dropped or any(c.changed for c in self.changes))


def _items(node: Any) -> Iterator[SigmaDetectionItem]:
    if isinstance(node, SigmaDetectionItem):
        yield node
    elif isinstance(node, SigmaDetection):
        for child in node.detection_items:
            yield from _items(child)


def _rules(collection: SigmaCollection) -> list[SigmaRule]:
    return [rule for rule in collection.rules if isinstance(rule, SigmaRule)]


def _freeze(node: Any) -> _Node:
    if isinstance(node, SigmaDetectionItem):
        return _Node(field=node.field, tag=getattr(node, _TAG, None))
    return _Node(children=tuple(_freeze(child) for child in node.detection_items))


def _snapshot(collection: SigmaCollection) -> list[dict[str, _Node]]:
    return [
        {name: _freeze(det) for name, det in rule.detection.detections.items()}
        for rule in _rules(collection)
    ]


def _fields(node: _Node) -> list[str]:
    if node.children is None:
        return [node.field] if node.field else []
    return [name for child in node.children for name in _fields(child)]


class FieldTracker:
    """Records a rule's fields before a pipeline runs and compares them afterwards.

    Items a pipeline renames in place keep a private tag, which pairs them exactly. A field that
    maps to several fields is replaced by a new group at the same position, so groups are paired
    by position. Anything that cannot be paired is reported as added or dropped, never guessed.
    """

    def __init__(self, collection: SigmaCollection) -> None:
        for rule in _rules(collection):
            for detection in rule.detection.detections.values():
                for item in _items(detection):
                    if item.field:
                        setattr(item, _TAG, item.field)
        self._collection = collection
        self._before = _snapshot(collection)

    def report(self) -> MappingReport:
        pairs: dict[str, list[str]] = {}
        before_fields: list[str] = []
        after_fields: list[str] = []
        paired_targets: set[str] = set()

        def record(source: str, targets: list[str]) -> None:
            known = pairs.setdefault(source, [])
            for target in targets:
                if target not in known:
                    known.append(target)
            paired_targets.update(targets)

        def compare(before: _Node, after: _Node) -> None:
            if before.children is None:
                if before.field:
                    record(before.field, _fields(after))
                return
            if after.children is None:
                return
            if len(before.children) == len(after.children):
                for b, a in zip(before.children, after.children, strict=True):
                    compare(b, a)
                return
            kept = {
                child.tag: child for child in after.children if child.children is None and child.tag
            }
            for b in before.children:
                if b.children is None and b.field and b.tag in kept:
                    record(b.field, [kept[b.tag].field or b.field])

        after_snapshot = _snapshot(self._collection)
        for before_rule, after_rule in zip(self._before, after_snapshot, strict=True):
            for name, before in before_rule.items():
                before_fields.extend(_fields(before))
                after = after_rule.get(name)
                if after is not None:
                    compare(before, after)
            for after in after_rule.values():
                after_fields.extend(_fields(after))

        ordered_sources = list(dict.fromkeys(before_fields))
        report = MappingReport()
        for source in ordered_sources:
            if source in pairs:
                report.changes.append(FieldChange(source, tuple(pairs[source])))
            else:
                report.dropped.append(source)
        report.added = [f for f in dict.fromkeys(after_fields) if f not in paired_targets]
        return report
