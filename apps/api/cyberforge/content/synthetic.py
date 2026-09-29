"""Guard rail for shipped content: everything must be synthetic.

Stories and datasets may only mention addresses and hosts that cannot belong to a real third party:
private ranges, loopback, and the three RFC 5737 documentation blocks for IPv4; reserved or lab
names for hosts (`*.example`, `*.test`, `*.invalid`, `*.lab.internal`, `example.com/org/net`).
"""

from __future__ import annotations

import ipaddress
import re

_IPV4 = re.compile(r"(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.]*\d)")
_URL_HOST = re.compile(r"https?://([A-Za-z0-9.-]+)", re.IGNORECASE)
_DOCS = [ipaddress.ip_network(n) for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")]
_SAFE_SUFFIXES = (
    ".example", ".test", ".invalid", ".localhost", ".lab.internal", ".internal", ".local",
    ".example.com", ".example.org", ".example.net",
)  # fmt: skip
_SAFE_HOSTS = {"example.com", "example.org", "example.net", "localhost"}
# Identifiers that look like URLs but are constants of the data format, not hosts anyone contacts.
_ALLOWED_HOSTS = {"sqlmap.org", "acs.amazonaws.com", "schemas.microsoft.com", "www.w3.org"}


def _synthetic_ip(text: str) -> bool:
    try:
        addr = ipaddress.ip_address(text)
    except ValueError:
        return True  # not an address (for example a version number)
    return addr.is_private or addr.is_loopback or addr.is_link_local or any(addr in n for n in _DOCS)


def find_non_synthetic(text: str) -> list[str]:
    """Return the offending addresses and hosts found in `text` (empty when all are synthetic)."""
    bad: list[str] = []
    for match in _IPV4.finditer(text):
        if not _synthetic_ip(match.group(1)):
            bad.append(match.group(1))
    for match in _URL_HOST.finditer(text):
        host = match.group(1).lower().rstrip(".")
        if host in _ALLOWED_HOSTS or host in _SAFE_HOSTS or host.endswith(_SAFE_SUFFIXES):
            continue
        if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host):
            continue  # judged by the IPv4 rule above
        bad.append(host)
    return sorted(set(bad))
