"""Search over repository content: what a query such as `T1059.001` or `credential access` means.

The database search in `api/v1/meta.py` matches text. This module adds the meaning: a technique id
finds everything mapped to it (and to its sub-techniques), a tactic name finds every technique in
that tactic and everything mapped to those, and stories and datasets (which live in files, not in the
database) are searched directly. Everything is derived from the loaded content, nothing is indexed
ahead of time, and the content is small enough that a linear scan is instant.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from cyberforge.content.loader import ContentBundle

TECH_ID = re.compile(r"^(t\d{4}(?:\.\d{3})?|aml\.t\d{4}(?:\.\d{3})?)$", re.IGNORECASE)
FORMATS = {"sigma", "yara", "suricata"}


@dataclass
class ContentHit:
    kind: str
    id: str
    title: str
    subtitle: str
    href: str
    badge: str | None = None
    score: int = 0


@dataclass
class ContentMatches:
    technique_ids: set[str] = field(default_factory=set)  # techniques the query means
    lab_slugs: set[str] = field(default_factory=set)  # labs mapped to those techniques
    rule_slugs: set[str] = field(default_factory=set)  # rules mapped to them
    formats: set[str] = field(default_factory=set)  # sigma / yara / suricata when asked for by name
    stories: list[ContentHit] = field(default_factory=list)
    datasets: list[ContentHit] = field(default_factory=list)


def _covers(query_ids: set[str], mapped: list[str]) -> bool:
    """A mapped technique matches when it is one of the queried ids, or a sub-technique of one."""
    return any(m in query_ids or m.split(".")[0] in query_ids for m in mapped)


def technique_ids_for(bundle: ContentBundle, needle: str) -> set[str]:
    """Techniques a query names: an id (with its sub-techniques) or every technique in a tactic."""
    text = needle.strip().lower()
    ids: set[str] = set()
    if TECH_ID.match(text):
        wanted = text.upper()
        ids |= {
            t["id"]
            for t in bundle.mitre_techniques
            if t["id"] == wanted or t["id"].startswith(wanted + ".")
        }
        return ids
    words = text.replace("-", " ")
    tactics = {
        t["id"]
        for t in bundle.mitre_tactics
        if words in (t["name"].lower(), t["shortname"].replace("-", " "), t["id"].lower())
    }
    if tactics:
        ids |= {t["id"] for t in bundle.mitre_techniques if set(t["tactics"]) & tactics}
    return ids


def search_content(bundle: ContentBundle, needle: str) -> ContentMatches:
    text = needle.strip().lower()
    out = ContentMatches(technique_ids=technique_ids_for(bundle, text))
    if text in FORMATS:
        out.formats.add(text)

    if out.technique_ids:
        out.lab_slugs = {lab.doc.slug for lab in bundle.labs if _covers(out.technique_ids, lab.doc.mitre)}
        out.rule_slugs = {r.slug for r in bundle.rules if _covers(out.technique_ids, r.technique_ids)}

    for story in bundle.stories:
        title = story.title.lower()
        steps = " ".join(s.title.lower() for s in story.steps)
        techniques = story.techniques()
        score = 0
        if text in title:
            score = 3
        elif text in " ".join(story.tags) or text in story.domain or text == story.difficulty or (out.technique_ids and _covers(out.technique_ids, list(techniques))):
            score = 2
        elif text in story.summary.lower() or text in steps or text in story.briefing.lower():
            score = 1
        if score:
            out.stories.append(
                ContentHit(
                    "story", story.slug, story.title,
                    f"Story · {len(story.steps)} steps · {story.difficulty}",
                    f"/stories/{story.slug}", story.domain, score,
                )
            )

    for ds in bundle.playground_datasets:
        score = 0
        if text in ds.name.lower() or text in ds.slug:
            score = 3
        elif text in ds.source_type.lower() or (out.technique_ids and _covers(out.technique_ids, ds.mitre)):
            score = 2
        elif text in ds.description.lower():
            score = 1
        if score:
            count = len(ds.events) if ds.kind == "events" else len(ds.files)
            out.datasets.append(
                ContentHit(
                    "dataset", ds.slug, ds.name, f"Dataset · {count} {ds.kind} · {ds.source_type}",
                    f"/detections/playground?dataset={ds.slug}", ds.kind, score,
                )
            )

    key = lambda h: (-h.score, h.title)  # noqa: E731
    out.stories.sort(key=key)
    out.datasets.sort(key=key)
    return out
