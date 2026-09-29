"""Scenario expansion and event materialisation.

A scenario is a list of compact `ScenarioEvent`s. Expansion turns `repeat`/`every` bursts into
individual events and fills `{i}` templates; materialisation renders each into the normalised
event columns (via services.telemetry) at absolute timestamps.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from cyberforge.content.schemas import ScenarioEvent
from cyberforge.services import telemetry

_TEMPLATE = re.compile(r"\{i(?:([+*])(\d+))?\}")


def _fill(value: Any, i: int) -> Any:
    if isinstance(value, str):
        whole = _TEMPLATE.fullmatch(value)
        if whole:
            return _apply(whole, i)
        return _TEMPLATE.sub(lambda m: str(_apply(m, i)), value)
    if isinstance(value, list):
        return [_fill(v, i) for v in value]
    if isinstance(value, dict):
        return {k: _fill(v, i) for k, v in value.items()}
    return value


def _apply(match: re.Match[str], i: int) -> int:
    op, operand = match.group(1), match.group(2)
    if op == "+":
        return i + int(operand)
    if op == "*":
        return i * int(operand)
    return i


def expand(events: Iterable[ScenarioEvent]) -> list[tuple[float, ScenarioEvent]]:
    """Return (offset_seconds, concrete_event) pairs sorted by offset."""
    out: list[tuple[float, ScenarioEvent]] = []
    for ev in events:
        for i in range(ev.repeat):
            concrete = ev.model_copy(
                update={
                    "repeat": 1,
                    "host": _fill(ev.host, i),
                    "user": _fill(ev.user, i),
                    "fields": _fill(ev.fields, i),
                    "note": _fill(ev.note, i),
                }
            )
            out.append((ev.t + i * ev.every, concrete))
    out.sort(key=lambda pair: pair[0])
    return out


def span_seconds(events: Iterable[ScenarioEvent]) -> float:
    pairs = expand(events)
    return pairs[-1][0] if pairs else 0.0


def materialize(events: Iterable[ScenarioEvent], start: datetime) -> list[dict[str, Any]]:
    """Expand and normalise into Event column dicts (including `note`), in time order."""
    rows: list[dict[str, Any]] = []
    for offset, ev in expand(events):
        ts = start + timedelta(seconds=offset)
        row = telemetry.normalize(
            ev.category, ts, ev.host, ev.user, ev.fields, action=ev.action, outcome=ev.outcome
        )
        row["note"] = ev.note
        rows.append(row)
    return rows
