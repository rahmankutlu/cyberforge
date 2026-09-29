"""A cheap guard for regular expressions that come from a user-authored rule.

Python's `re` cannot be interrupted, so a pattern such as `(a+)+$` on a long input can pin a worker.
The teaching evaluators (YARA and Suricata previews) refuse the classic culprits up front: patterns
that are very long, and groups that contain a quantifier and are themselves quantified. The check is a
single linear pass (no regular expression), so the guard cannot itself be attacked.
"""

from __future__ import annotations

MAX_PATTERN_CHARS = 512
MAX_HAYSTACK_CHARS = 8192


def has_nested_quantifier(pattern: str) -> bool:
    """True when a group holding `+`, `*` or `{n,}` is itself followed by `+`, `*` or `{`."""
    stack: list[bool] = []  # per open group: does it contain a quantifier?
    escaped = False
    in_class = False
    for i, ch in enumerate(pattern):
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if in_class:
            in_class = ch != "]"
            continue
        if ch == "[":
            in_class = True
        elif ch == "(":
            stack.append(False)
        elif ch in "+*" or (ch == "{" and i + 1 < len(pattern) and pattern[i + 1].isdigit()):
            if stack:
                stack[-1] = True
        elif ch == ")" and stack:
            had_quantifier = stack.pop()
            nxt = pattern[i + 1] if i + 1 < len(pattern) else ""
            if had_quantifier and nxt and nxt in "+*{":
                return True
            if stack and had_quantifier:
                stack[-1] = True  # a quantifier inside a nested group also counts for the parent
    return False


def check_pattern(pattern: str) -> str | None:
    """Return a reason to refuse the pattern, or None if it is acceptable for the previews."""
    if len(pattern) > MAX_PATTERN_CHARS:
        return f"longer than {MAX_PATTERN_CHARS} characters"
    if has_nested_quantifier(pattern):
        return "nested quantifiers can take exponential time"
    return None
