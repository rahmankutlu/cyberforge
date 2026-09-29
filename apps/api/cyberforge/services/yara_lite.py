"""A small YARA evaluator for teaching: explain *why* a rule matches a text sample.

CyberForge does not bundle libyara. plyara parses a rule; this module evaluates the subset of
YARA that the shipped and typical learning rules use, against text samples, and reports each
string and each condition term. It is a preview for understanding rules, not a scanner. Anything it
cannot evaluate is reported as unsupported instead of guessed.

Supported
  strings    text (`ascii`, `wide`, `nocase`, `fullword`) and regular expressions (`/…/ nocase`)
  condition  `and` `or` `not`, parentheses, `$name`, `#name <op> N`, `filesize <op> N[KB|MB]`,
             `any|all|N of them`, `any|all|N of ($a, $b)` and `($prefix*)`,
             `uint8|uint16|uint32|…be(offset) == 0x…`
Not supported (reported): hex strings, `for … of`, modules (`pe.`, `math.`), `at`, `in`, `@name`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import plyara

MAX_SAMPLE_BYTES = 256 * 1024
_UNITS = {"KB": 1024, "MB": 1024 * 1024}
_CMP = {
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


class YaraUnsupported(ValueError):
    """The rule uses a construct the preview evaluator does not implement."""


@dataclass
class StringResult:
    name: str
    kind: str  # text | regex
    pattern: str
    modifiers: list[str]
    count: int
    offsets: list[int]
    excerpt: str | None = None

    @property
    def matched(self) -> bool:
        return self.count > 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name, "kind": self.kind, "pattern": self.pattern,
            "modifiers": self.modifiers, "count": self.count, "offsets": self.offsets[:8],
            "excerpt": self.excerpt, "matched": self.matched,
        }  # fmt: skip


@dataclass
class TermResult:
    label: str
    matched: bool
    detail: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"label": self.label, "matched": self.matched, "detail": self.detail}


@dataclass
class YaraExplanation:
    rule: str
    matched: bool
    strings: list[StringResult]
    terms: list[TermResult]
    condition_text: str
    filesize: int
    unsupported: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule": self.rule,
            "matched": self.matched,
            "condition_text": self.condition_text,
            "filesize": self.filesize,
            "strings": [s.to_dict() for s in self.strings],
            "terms": [t.to_dict() for t in self.terms],
            "unsupported": self.unsupported,
        }


def parse(text: str) -> dict[str, Any]:
    rules = plyara.Plyara().parse_string(text)
    if not rules:
        raise ValueError("No YARA rule found")
    return rules[0]


def _compile_string(spec: dict[str, Any]) -> tuple[str, str, str, list[re.Pattern[bytes]]]:
    name = spec["name"]
    value = spec["value"]
    mods = [str(m) for m in spec.get("modifiers", [])]
    flags = re.IGNORECASE if "nocase" in mods else 0
    if spec["type"] == "regex":
        body = value[1 : value.rfind("/")]
        trailing = value[value.rfind("/") + 1 :]
        if "i" in trailing:
            flags |= re.IGNORECASE
        patterns = [re.compile(body.encode("latin-1", "replace"), flags)]
        return name, "regex", body, patterns
    if spec["type"] != "text":
        raise YaraUnsupported(f"{name}: {spec['type']} strings are not supported by the preview")
    raw = value[1:-1] if value.startswith('"') else value
    raw = raw.replace('\\"', '"').replace("\\\\", "\\").replace("\\n", "\n").replace("\\t", "\t")
    encoded = re.escape(raw.encode("latin-1", "replace"))
    if "fullword" in mods:
        encoded = rb"(?<![A-Za-z0-9_])" + encoded + rb"(?![A-Za-z0-9_])"
    patterns = []
    if "wide" not in mods or "ascii" in mods:
        patterns.append(re.compile(encoded, flags))
    if "wide" in mods:
        wide = b"\x00".join(re.escape(bytes([c])) for c in raw.encode("latin-1", "replace"))
        patterns.append(re.compile(wide + rb"\x00?", flags))
    return name, "text", raw, patterns


class _Cond:
    """Recursive-descent evaluator over plyara's `condition_terms`."""

    def __init__(self, terms: list[str], data: bytes, strings: dict[str, StringResult]):
        self.t = terms
        self.i = 0
        self.data = data
        self.strings = strings
        self.log: list[TermResult] = []

    def peek(self) -> str | None:
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self) -> str:
        tok = self.t[self.i]
        self.i += 1
        return tok

    def parse(self) -> bool:
        result = self.or_expr()
        if self.peek() is not None:
            raise YaraUnsupported(f"unexpected token {self.peek()!r} in the condition")
        return result

    def or_expr(self) -> bool:
        left = self.and_expr()
        while self.peek() == "or":
            self.take()
            right = self.and_expr()
            left = left or right
        return left

    def and_expr(self) -> bool:
        left = self.not_expr()
        while self.peek() == "and":
            self.take()
            right = self.not_expr()
            left = left and right
        return left

    def not_expr(self) -> bool:
        if self.peek() == "not":
            self.take()
            value = self.not_expr()
            self.log.append(TermResult("not", not value, "negation"))
            return not value
        return self.atom()

    def atom(self) -> bool:
        tok = self.peek()
        if tok is None:
            raise YaraUnsupported("condition ended unexpectedly")
        if tok == "(":
            self.take()
            value = self.or_expr()
            if self.peek() != ")":
                raise YaraUnsupported("unbalanced parentheses")
            self.take()
            return value
        if tok == "filesize":
            return self.numeric_compare("filesize", len(self.data))
        if tok.startswith("$"):
            self.take()
            res = self.strings.get(tok)
            if res is None:
                raise YaraUnsupported(f"{tok} is not defined")
            self.log.append(TermResult(tok, res.matched, f"{res.count} occurrence(s)"))
            return res.matched
        if tok.startswith("#"):
            name = "$" + tok[1:]
            self.take()
            res = self.strings.get(name)
            if res is None:
                raise YaraUnsupported(f"{name} is not defined")
            return self.compare_after(f"count of {name}", res.count)
        if re.fullmatch(r"u?int(8|16|32)(be)?", tok):
            return self.int_read()
        if tok in ("any", "all") or tok.isdigit():
            return self.of_expr()
        if tok in ("true", "false"):
            self.take()
            return tok == "true"
        raise YaraUnsupported(f"{tok!r} is not supported by the preview evaluator")

    def compare_after(self, label: str, left: int) -> bool:
        op = self.take() if self.peek() in _CMP else None
        if op is None:
            raise YaraUnsupported(f"{label} needs a comparison")
        right = self.number(self.take())
        ok = _CMP[op](left, right)
        self.log.append(TermResult(f"{label} {op} {right}", ok, f"{label} is {left}"))
        return ok

    def numeric_compare(self, label: str, value: int) -> bool:
        self.take()
        return self.compare_after(label, value)

    @staticmethod
    def number(tok: str) -> int:
        for unit, mult in _UNITS.items():
            if tok.upper().endswith(unit):
                return int(tok[: -len(unit)]) * mult
        return int(tok, 0)

    def int_read(self) -> bool:
        fn = self.take()
        if self.take() != "(":
            raise YaraUnsupported("malformed integer read")
        offset = int(self.take(), 0)
        if self.take() != ")":
            raise YaraUnsupported("malformed integer read")
        size = int(re.search(r"(\d+)", fn).group(1)) // 8  # type: ignore[union-attr]
        chunk = self.data[offset : offset + size]
        value = int.from_bytes(chunk, "big" if fn.endswith("be") else "little") if len(chunk) == size else None
        op = self.take()
        wanted = int(self.take(), 0)
        ok = value is not None and _CMP[op](value, wanted)
        shown = f"0x{value:X}" if value is not None else "past the end of the file"
        self.log.append(TermResult(f"{fn}({offset}) {op} 0x{wanted:X}", ok, f"read {shown}"))
        return ok

    def of_expr(self) -> bool:
        quant = self.take()
        if self.take() != "of":
            raise YaraUnsupported("expected `of` after the quantifier")
        target = self.take()
        names: list[str]
        if target == "them":
            names = list(self.strings)
        elif target == "(":
            names = []
            while self.peek() != ")":
                tok = self.take()
                if tok == ",":
                    continue
                if tok.endswith("*"):
                    names += [n for n in self.strings if n.startswith(tok[:-1])]
                else:
                    names.append(tok)
            self.take()
        else:
            raise YaraUnsupported("unsupported `of` set")
        hits = [n for n in names if n in self.strings and self.strings[n].matched]
        need = len(names) if quant == "all" else 1 if quant == "any" else int(quant)
        ok = bool(names) and len(hits) >= need
        label = f"{quant} of {'them' if target == 'them' else '(' + ', '.join(names) + ')'}"
        self.log.append(TermResult(label, ok, f"{len(hits)} of {len(names)} strings matched"))
        return ok


def evaluate(rule_text: str, sample: str | bytes) -> YaraExplanation:
    parsed = parse(rule_text)
    data = sample if isinstance(sample, bytes) else sample.encode("utf-8", "replace")
    data = data[:MAX_SAMPLE_BYTES]
    name = parsed["rule_name"]
    results: dict[str, StringResult] = {}
    for spec in parsed.get("strings", []):
        try:
            sname, kind, pattern, regexes = _compile_string(spec)
        except YaraUnsupported as exc:
            return YaraExplanation(name, False, [], [], "", len(data), unsupported=str(exc))
        offsets: list[int] = []
        excerpt = None
        for rx in regexes:
            for m in rx.finditer(data):
                offsets.append(m.start())
                if excerpt is None:
                    excerpt = data[max(0, m.start() - 12) : m.end() + 12].decode("latin-1", "replace")
        results[sname] = StringResult(
            sname, kind, pattern, [str(m) for m in spec.get("modifiers", [])],
            len(offsets), sorted(offsets), excerpt,
        )  # fmt: skip
    terms = [str(t) for t in parsed.get("condition_terms", [])]
    cond = _Cond(terms, data, results)
    try:
        matched = cond.parse()
    except (YaraUnsupported, ValueError, IndexError) as exc:
        return YaraExplanation(
            name, False, list(results.values()), cond.log, " ".join(terms), len(data), unsupported=str(exc)
        )
    return YaraExplanation(name, matched, list(results.values()), cond.log, " ".join(terms), len(data))

