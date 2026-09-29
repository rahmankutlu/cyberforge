"""Safety guardrails for lab simulations.

CyberForge simulations replay *telemetry*; they never send packets. These checks are defence in
depth so that no future "live" mode can be pointed at anything outside the isolated lab:

  * targets must be a lab hostname (``*.lab.internal``), ``localhost``, or a loopback / RFC 1918 address
  * URLs, credentials, paths and ports are rejected outright
  * names are never resolved (no DNS lookups, so no rebinding tricks)
"""

from __future__ import annotations

import ipaddress
import re

LAB_SUFFIX = ".lab.internal"
_HOSTNAME = re.compile(
    r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$"
)
# Anything that could smuggle a scheme, port, credentials, path, query or whitespace.
_FORBIDDEN = re.compile(r"[/\\@:?#%\s\x00]")

PRIVATE_NETS = [
    ipaddress.ip_network(n)
    for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "::1/128")
]


class TargetRejected(ValueError):
    """Raised when a simulation target is not an approved lab destination."""


def validate_target(target: str | None, allowed: list[str] | None = None) -> str | None:
    """Return the normalised target, or None if no target was given.

    ``allowed`` lists extra lab hostnames declared in the lab's own ``lab.yaml`` (all must end
    with ``.lab.internal``).
    """
    if target is None or not target.strip():
        return None
    value = target.strip().lower()

    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        ip = None

    if ip is not None:
        if any(ip in net for net in PRIVATE_NETS):
            return str(ip)
        raise TargetRejected(
            f"{ip} is not a loopback or private (RFC 1918) address. CyberForge never targets external hosts."
        )

    if len(value) > 253 or _FORBIDDEN.search(value):
        raise TargetRejected(
            "Target must be a bare hostname or IP address: URLs, ports, credentials and paths are not accepted."
        )

    if (
        value == "localhost" or value.endswith(LAB_SUFFIX) or value in (allowed or [])
    ) and _HOSTNAME.match(value):
        return value
    raise TargetRejected(
        f"{value!r} is not a CyberForge lab hostname. Allowed: localhost, private IPs, or *{LAB_SUFFIX}."
    )
