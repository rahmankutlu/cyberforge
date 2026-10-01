"""MITRE coverage that comes from repository files: stories, rule tests and platform domains.

`services.coverage` counts what is in the database (labs, enabled rules, alerts). This module adds
what only the content files know: which techniques a *story* teaches, which mapped rules have real
tests, and which platform domain (Windows, Linux, Network, Web, Cloud, AI Security) a technique
belongs to. Everything is derived, never typed in.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from cyberforge.content.loader import ContentBundle
from cyberforge.services.rule_tests import RunSummary

DOMAINS = ["Windows", "Linux", "Network", "Web", "Cloud", "AI Security"]

# ATT&CK platforms -> a domain. macOS, ESXi and PRE have no domain here.
_PLATFORM_DOMAIN = {
    "Windows": "Windows",
    "Linux": "Linux",
    "Network Devices": "Network",
    "IaaS": "Cloud",
    "SaaS": "Cloud",
    "Identity Provider": "Cloud",
    "Office Suite": "Cloud",
    "Containers": "Cloud",
}
_LAB_DOMAIN = {
    "web": "Web",
    "api": "Web",
    "linux": "Linux",
    "windows-sim": "Windows",
    "network": "Network",
    "cloud": "Cloud",
    "ai-security": "AI Security",
}
_STORY_DOMAIN = {
    "endpoint": "Windows",
    "identity": "Windows",
    "web": "Web",
    "network": "Network",
    "cloud": "Cloud",
    "ai-security": "AI Security",
}


@dataclass
class ContentCoverage:
    stories: set[str] = field(default_factory=set)
    tested_rules: set[str] = field(default_factory=set)
    domains: set[str] = field(default_factory=set)


def _rule_domain(logsource: dict[str, str]) -> str | None:
    product, category, service = (logsource.get(k) for k in ("product", "category", "service"))
    if service == "ai_gateway":
        return "AI Security"
    if category == "webserver":
        return "Web"
    if category in ("dns", "firewall"):
        return "Network"
    if product == "windows":
        return "Windows"
    if product == "linux":
        return "Linux"
    if product in ("aws", "docker"):
        return "Cloud"
    return None


def compute(bundle: ContentBundle, tests: RunSummary) -> dict[str, ContentCoverage]:
    """Coverage per technique id, with sub-techniques rolled up into their parent."""
    parents = {t["id"]: t.get("parent") for t in bundle.mitre_techniques}
    out: dict[str, ContentCoverage] = {t["id"]: ContentCoverage() for t in bundle.mitre_techniques}

    def add(technique: str, story: str | None = None, rule: str | None = None, domain: str | None = None) -> None:
        chain = [technique, parents.get(technique)]
        for tid in chain:
            if tid is None or tid not in out:
                continue
            if story:
                out[tid].stories.add(story)
            if rule:
                out[tid].tested_rules.add(rule)
            if domain:
                out[tid].domains.add(domain)

    for tech in bundle.mitre_techniques:
        if tech["framework"] == "atlas":
            add(tech["id"], domain="AI Security")
            continue
        for platform in tech.get("platforms", []):
            if platform in _PLATFORM_DOMAIN:
                add(tech["id"], domain=_PLATFORM_DOMAIN[platform])
    for lab in bundle.labs:
        for tid in lab.doc.mitre:
            add(tid, domain=_LAB_DOMAIN.get(lab.doc.domain))
    for story in bundle.stories:
        for tid in story.techniques():
            add(tid, story=story.slug, domain=_STORY_DOMAIN.get(story.domain))
    for rule in bundle.rules:
        report = tests.report_for(rule.slug) if rule.format == "sigma" else None
        tested = bool(report and report.is_tested and report.passed)
        for tid in rule.technique_ids:
            add(tid, rule=rule.slug if tested else None, domain=_rule_domain(rule.logsource))
    return out
