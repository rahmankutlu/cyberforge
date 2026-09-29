"""Suricata rule breakdown and a content-match preview.

Suricata is a network engine; CyberForge does not run it. This module does two honest things:

1. **Explains a rule** by splitting it into header and options, so learners can read
   `alert http any any -> $HOME_NET any (…)` piece by piece.
2. **Previews content matching** against synthetic HTTP and DNS telemetry. A Suricata rule is
   evaluated on *sticky buffers* (`http.uri`, `http.user_agent`, `dns.query`, `http.request_body`,
   `http.method`). Where the telemetry carries the same data (a web-access log has a URI and a
   user agent, a DNS log has a query), `content`, `nocase`, `startswith`, `endswith` and `pcre`
   are evaluated for real. Options that need packets or state (`flags`, `threshold`, `flow`,
   byte tests) are listed as *not evaluated* and the verdict says so.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from cyberforge.content.loader import _SURICATA

# Telemetry field -> Suricata sticky buffer. First non-empty source wins.
BUFFERS = {
    "http.uri": ("cs-uri-stem", "cs-uri-query"),
    "http.user_agent": ("cs-user-agent",),
    "http.method": ("cs-method",),
    "http.request_body": ("request_body",),
    "dns.query": ("query",),
}
_NOT_EVALUATED = ("flags", "threshold", "flow", "detection_filter", "byte_test", "byte_jump", "dsize", "itype")
_KEYWORD_PROTOCOLS = {"http": "http", "dns": "dns"}


class SuricataError(ValueError):
    pass


@dataclass
class Check:
    label: str
    buffer: str
    kind: str  # content | pcre
    pattern: str
    modifiers: list[str]
    matched: bool
    actual: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label, "buffer": self.buffer, "kind": self.kind, "pattern": self.pattern,
            "modifiers": self.modifiers, "matched": self.matched, "actual": self.actual,
        }  # fmt: skip


@dataclass
class SuricataExplanation:
    action: str
    protocol: str
    source: str
    direction: str
    destination: str
    msg: str
    sid: str
    classtype: str | None
    metadata: str | None
    options: list[dict[str, str]]  # every option in order, for the breakdown
    checks: list[Check] = field(default_factory=list)
    not_evaluated: list[str] = field(default_factory=list)
    matched: bool | None = None  # None: nothing evaluable against this event
    summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action, "protocol": self.protocol, "source": self.source,
            "direction": self.direction, "destination": self.destination, "msg": self.msg,
            "sid": self.sid, "classtype": self.classtype, "metadata": self.metadata,
            "options": self.options, "checks": [c.to_dict() for c in self.checks],
            "not_evaluated": self.not_evaluated, "matched": self.matched, "summary": self.summary,
        }  # fmt: skip


def _options(body: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for token in re.findall(r'(?:[^;"\\]|\\.|"(?:[^"\\]|\\.)*")+', body):
        key, _, value = token.strip().partition(":")
        if key.strip():
            out.append((key.strip(), value.strip()))
    return out


def parse(rule: str) -> SuricataExplanation:
    line = next(
        (ln.strip() for ln in rule.splitlines() if ln.strip() and not ln.lstrip().startswith("#")), ""
    )
    match = _SURICATA.match(line)
    if not match:
        raise SuricataError("Not a Suricata rule. Expected: action proto src -> dst (options;)")
    header = re.match(r"^(\w+)\s+(\S+)\s+(.+?)\s+->\s+(.+?)\s+\(", line)
    assert header
    action, proto, source, destination = header.groups()
    opts = _options(match.group(5))
    first = dict(reversed(opts))
    return SuricataExplanation(
        action=action, protocol=proto, source=source, direction="->", destination=destination,
        msg=first.get("msg", "").strip('"'), sid=first.get("sid", ""), classtype=first.get("classtype"),
        metadata=first.get("metadata"), options=[{"name": k, "value": v} for k, v in opts],
    )  # fmt: skip


def buffers_from_fields(fields: dict[str, Any]) -> dict[str, str]:
    """Sticky buffers derivable from a telemetry event's fields."""
    out: dict[str, str] = {}
    uri_stem, uri_query = fields.get("cs-uri-stem"), fields.get("cs-uri-query")
    if uri_stem:
        out["http.uri"] = str(uri_stem) + (f"?{uri_query}" if uri_query else "")
    for buffer, sources in BUFFERS.items():
        if buffer == "http.uri":
            continue
        for src in sources:
            if fields.get(src):
                out[buffer] = str(fields[src])
                break
    return out


def _unquote(value: str) -> str:
    text = value.strip()
    negated = text.startswith("!")
    text = text.lstrip("!").strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1]
    return ("!" if negated else "") + text.replace('\\"', '"').replace("\\;", ";").replace("\\\\", "\\")


def _content_check(needle: str, haystack: str, mods: list[str]) -> bool:
    negate = needle.startswith("!")
    needle = needle.lstrip("!")
    hay, pat = (haystack.lower(), needle.lower()) if "nocase" in mods else (haystack, needle)
    if "startswith" in mods and "endswith" in mods:
        found = hay == pat
    elif "startswith" in mods:
        found = hay.startswith(pat)
    elif "endswith" in mods:
        found = hay.endswith(pat)
    else:
        found = pat in hay
    return (not found) if negate else found


def _pcre_check(spec: str, haystack: str) -> bool:
    m = re.match(r"^/(.*)/([a-zA-Z]*)$", spec, re.DOTALL)
    if not m:
        raise SuricataError(f"unsupported pcre: {spec}")
    body, flag_text = m.groups()
    flags = 0
    if "i" in flag_text:
        flags |= re.IGNORECASE
    if "s" in flag_text:
        flags |= re.DOTALL
    if "m" in flag_text:
        flags |= re.MULTILINE
    return bool(re.search(body.replace("\\/", "/"), haystack, flags))


def evaluate(rule: str, fields: dict[str, Any]) -> SuricataExplanation:
    """Preview a rule against one telemetry event (a dict of Sigma-vocabulary fields)."""
    exp = parse(rule)
    buffers = buffers_from_fields(fields)
    current: str | None = None
    pending: dict[str, Any] | None = None  # the last content/pcre, so trailing modifiers attach
    for opt in exp.options:
        name, raw = opt["name"], opt["value"]
        if name in BUFFERS:
            current, pending = name, None
        elif name in ("content", "pcre"):
            pending = {"kind": name, "pattern": _unquote(raw), "buffer": current or "payload", "mods": []}
            exp.checks.append(
                Check(f"{pending['buffer']} {name}", pending["buffer"], name, pending["pattern"], pending["mods"], False, None)
            )
        elif name in ("nocase", "startswith", "endswith") and pending is not None:
            pending["mods"].append(name)
        elif name in _NOT_EVALUATED:
            exp.not_evaluated.append(f"{name}:{raw}" if raw else name)
    for check in exp.checks:
        haystack = buffers.get(check.buffer)
        check.actual = haystack
        if haystack is None:
            check.matched = False
            continue
        check.matched = (
            _pcre_check(check.pattern, haystack)
            if check.kind == "pcre"
            else _content_check(check.pattern, haystack, check.modifiers)
        )

    evaluable = [c for c in exp.checks if c.actual is not None]
    if not exp.checks:
        exp.matched, exp.summary = None, "This rule has no content or pcre to preview."
    elif not evaluable:
        want = ", ".join(sorted({c.buffer for c in exp.checks}))
        exp.matched, exp.summary = None, f"This event has no {want} data, so the rule is not applicable."
    else:
        exp.matched = all(c.matched for c in exp.checks)
        exp.summary = (
            "Every content/pcre check matched." if exp.matched else "At least one content/pcre check did not match."
        )
        if exp.not_evaluated and exp.matched:
            exp.summary += " Options that need packets or state were not evaluated: " + ", ".join(exp.not_evaluated) + "."
    return exp
