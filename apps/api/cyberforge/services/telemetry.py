"""Event categories, normalization and raw-log rendering.

Scenario and dataset files describe events in *Sigma field vocabulary* (`Image`,
`CommandLine`, `c-ip`, `eventName`, ...). This module:

  * maps each category to a Sigma logsource so rules only match compatible events,
  * renders a realistic raw log line for the "Raw Event" stage of the lifecycle view,
  * extracts normalized columns (host, user, process, ips, ...) for the "Parsed Event" stage.

Everything generated here is synthetic. IPs come from RFC 1918 and RFC 5737 documentation
ranges; domains use reserved TLDs and example.* names.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class CategorySpec:
    name: str
    source: str
    logsource: dict[str, str]
    render: Callable[[datetime, str | None, str | None, dict[str, Any]], str]
    summarize: Callable[[str | None, str | None, dict[str, Any]], str]
    default_action: str


def _base(path: str | None) -> str:
    if not path:
        return "?"
    return path.replace("\\", "/").rsplit("/", 1)[-1]


def _iso(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ts.microsecond // 1000:03d}Z"


def _json(obj: dict[str, Any]) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def _syslog_ts(ts: datetime) -> str:
    return f"{ts:%b} {ts.day:>2} {ts:%H:%M:%S}"


# --- renderers ----------------------------------------------------------------------------


def _windows_json(
    channel: str, event_id: int
) -> Callable[[datetime, str | None, str | None, dict[str, Any]], str]:
    def render(ts: datetime, host: str | None, user: str | None, f: dict[str, Any]) -> str:
        body: dict[str, Any] = {"EventID": f.get("EventID", event_id), "Channel": channel}
        body["Computer"] = host
        body["TimeCreated"] = _iso(ts)
        if user and "User" not in f:
            body["User"] = user
        body.update({k: v for k, v in f.items() if k != "EventID"})
        return _json(body)

    return render


def _render_linux_auth(ts: datetime, host: str | None, user: str | None, f: dict[str, Any]) -> str:
    program = f.get("Program", "sshd")
    pid = f.get("Pid", 2314)
    return f"{_syslog_ts(ts)} {host or 'localhost'} {program}[{pid}]: {f.get('Message', '')}"


def _render_linux_process(
    ts: datetime, host: str | None, user: str | None, f: dict[str, Any]
) -> str:
    args = f.get("CommandLine", "")
    return (
        f"type=EXECVE msg=audit({int(ts.timestamp())}.{ts.microsecond // 1000:03d}:4102): "
        f'uid={user or "unknown"} exe="{f.get("Image", "")}" ppid_exe="{f.get("ParentImage", "")}" '
        f'cmdline="{args}" host={host}'
    )


def _render_linux_file(ts: datetime, host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return (
        f"type=PATH msg=audit({int(ts.timestamp())}.{ts.microsecond // 1000:03d}:4110): "
        f'op={f.get("Operation", "open")} name="{f.get("TargetFilename", "")}" '
        f'exe="{f.get("Image", "")}" uid={user or "unknown"} host={host}'
    )


def _render_dns(ts: datetime, host: str | None, user: str | None, f: dict[str, Any]) -> str:
    stamp = ts.strftime("%d-%b-%Y %H:%M:%S.") + f"{ts.microsecond // 1000:03d}"
    return (
        f"{stamp} queries: info: client @0x7f2c {f.get('src_ip', '10.20.0.15')}#"
        f"{f.get('src_port', 53211)} ({f.get('query', '')}): query: {f.get('query', '')} IN "
        f"{f.get('record_type', 'A')} + ({f.get('resolver', '10.20.0.2')}) rcode={f.get('rcode', 'NOERROR')}"
    )


def _render_firewall(ts: datetime, host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return (
        f"{_iso(ts)} {host or 'fw-edge-01'} kernel: [FW-{str(f.get('action', 'allow')).upper()}] "
        f"SRC={f.get('src_ip')} DST={f.get('dst_ip')} PROTO={f.get('proto', 'TCP')} "
        f"DPT={f.get('dst_port')} BYTES={f.get('bytes', 60)}"
    )


def _render_web(ts: datetime, host: str | None, user: str | None, f: dict[str, Any]) -> str:
    query = f.get("cs-uri-query")
    target = f"{f.get('cs-uri-stem', '/')}" + (f"?{query}" if query else "")
    stamp = ts.strftime("%d/%b/%Y:%H:%M:%S +0000")
    return (
        f'{f.get("c-ip")} - {user or "-"} [{stamp}] "{f.get("cs-method", "GET")} {target} HTTP/1.1" '
        f'{f.get("sc-status", 200)} {f.get("sc-bytes", 512)} "-" "{f.get("cs-user-agent", "-")}"'
    )


def _render_cloud(ts: datetime, host: str | None, user: str | None, f: dict[str, Any]) -> str:
    nested: dict[str, Any] = {"eventTime": _iso(ts), "eventVersion": "1.09"}
    for key, value in f.items():
        cursor = nested
        parts = key.split(".")
        for part in parts[:-1]:
            cursor = cursor.setdefault(part, {})
        cursor[parts[-1]] = value
    return _json(nested)


def _render_ai(ts: datetime, host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return _json({"ts": _iso(ts), "gateway": "cyberforge-ai-gateway", **f})


def _render_container(ts: datetime, host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return _json({"time": _iso(ts), "host": host, "source": "docker-audit", **f})


# --- summaries ----------------------------------------------------------------------------


def _sum_process(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"{_base(f.get('Image'))} launched by {_base(f.get('ParentImage'))} as {user or f.get('User', '?')}"


def _sum_process_access(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"{_base(f.get('SourceImage'))} opened {_base(f.get('TargetImage'))} (access {f.get('GrantedAccess')})"


def _sum_file(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"{_base(f.get('Image'))} wrote {f.get('TargetFilename')}"


def _sum_registry(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"{_base(f.get('Image'))} set {f.get('TargetObject')}"


def _sum_ps(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    text = str(f.get("ScriptBlockText", ""))
    return f"PowerShell script block: {text[:96]}{'…' if len(text) > 96 else ''}"


_WINSEC_NAMES = {
    4624: "Successful logon",
    4625: "Failed logon",
    4672: "Special privileges assigned",
    4698: "Scheduled task created",
    4720: "User account created",
    4732: "Member added to security-enabled local group",
    1102: "Audit log cleared",
}


def _sum_winsec(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    name = _WINSEC_NAMES.get(int(f.get("EventID", 0)), f"Windows Security event {f.get('EventID')}")
    who = f.get("TargetUserName") or f.get("SubjectUserName") or user or "?"
    ip = f.get("IpAddress")
    return f"{name}: {who}" + (f" from {ip}" if ip else "")


def _sum_winsys(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"Service {f.get('ServiceName')} installed ({f.get('ImagePath')})"


def _sum_linux_auth(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return str(f.get("Message", ""))


def _sum_linux_process(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"{f.get('CommandLine', _base(f.get('Image')))} (uid {user})"


def _sum_linux_file(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"{f.get('Operation', 'access')} {f.get('TargetFilename')} by {_base(f.get('Image'))}"


def _sum_dns(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"{f.get('src_ip')} queried {f.get('query')} ({f.get('record_type', 'A')}, {f.get('rcode', 'NOERROR')})"


def _sum_firewall(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"{str(f.get('action', 'allow')).upper()} {f.get('src_ip')} → {f.get('dst_ip')}:{f.get('dst_port')}"


def _sum_web(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    query = f.get("cs-uri-query")
    target = f"{f.get('cs-uri-stem', '/')}" + (f"?{query}" if query else "")
    return f"{f.get('cs-method', 'GET')} {target} → {f.get('sc-status', 200)} from {f.get('c-ip')}"


def _sum_cloud(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    err = f" ({f['errorCode']})" if f.get("errorCode") else ""
    return f"{f.get('eventSource')} {f.get('eventName')} by {f.get('userIdentity.arn', user)}{err}"


def _sum_ai(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    kind = f.get("event_type", "event")
    if kind == "tool_call":
        return f"agent {f.get('agent')} called tool {f.get('tool_name')}"
    if kind == "user_prompt":
        return f"user prompt to agent {f.get('agent')}"
    if kind == "retrieval":
        return f"agent {f.get('agent')} retrieved content from {f.get('retrieved_source')}"
    if kind == "ingest":
        return f"document ingested into RAG index from {f.get('retrieved_source')}"
    return f"{kind} for agent {f.get('agent')}"


def _sum_container(host: str | None, user: str | None, f: dict[str, Any]) -> str:
    return f"container {f.get('Image')} started (privileged={f.get('Privileged', False)})"


CATEGORIES: dict[str, CategorySpec] = {
    spec.name: spec
    for spec in [
        CategorySpec("process_creation", "sysmon", {"category": "process_creation", "product": "windows"},
                     _windows_json("Microsoft-Windows-Sysmon/Operational", 1), _sum_process, "process_create"),
        CategorySpec("process_access", "sysmon", {"category": "process_access", "product": "windows"},
                     _windows_json("Microsoft-Windows-Sysmon/Operational", 10), _sum_process_access, "process_access"),
        CategorySpec("file_event", "sysmon", {"category": "file_event", "product": "windows"},
                     _windows_json("Microsoft-Windows-Sysmon/Operational", 11), _sum_file, "file_create"),
        CategorySpec("registry_set", "sysmon", {"category": "registry_set", "product": "windows"},
                     _windows_json("Microsoft-Windows-Sysmon/Operational", 13), _sum_registry, "registry_set"),
        CategorySpec("ps_script", "powershell", {"category": "ps_script", "product": "windows"},
                     _windows_json("Microsoft-Windows-PowerShell/Operational", 4104), _sum_ps, "script_block"),
        CategorySpec("windows_security", "windows-security", {"product": "windows", "service": "security"},
                     _windows_json("Security", 4624), _sum_winsec, "windows_security"),
        CategorySpec("windows_system", "windows-system", {"product": "windows", "service": "system"},
                     _windows_json("System", 7045), _sum_winsys, "service_install"),
        CategorySpec("linux_auth", "linux-auth", {"product": "linux", "service": "auth"},
                     _render_linux_auth, _sum_linux_auth, "auth"),
        CategorySpec("linux_process", "auditd", {"category": "process_creation", "product": "linux"},
                     _render_linux_process, _sum_linux_process, "process_create"),
        CategorySpec("linux_file_event", "auditd", {"category": "file_event", "product": "linux"},
                     _render_linux_file, _sum_linux_file, "file_access"),
        CategorySpec("dns_query", "dns", {"category": "dns"}, _render_dns, _sum_dns, "dns_query"),
        CategorySpec("firewall", "firewall", {"category": "firewall"}, _render_firewall, _sum_firewall, "connection"),
        CategorySpec("web_request", "web-access", {"category": "webserver"}, _render_web, _sum_web, "http_request"),
        CategorySpec("cloud_audit", "cloudtrail", {"product": "aws", "service": "cloudtrail"},
                     _render_cloud, _sum_cloud, "api_call"),
        CategorySpec("ai_gateway", "ai-gateway", {"product": "cyberforge", "service": "ai_gateway"},
                     _render_ai, _sum_ai, "ai_event"),
        CategorySpec("container_runtime", "docker-audit", {"product": "docker", "service": "runtime"},
                     _render_container, _sum_container, "container_start"),
    ]
}  # fmt: skip


def known_category(name: str) -> bool:
    return name in CATEGORIES


def _first(fields: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = fields.get(key)
        if value not in (None, ""):
            return value
    return None


def normalize(
    category: str,
    ts: datetime,
    host: str | None,
    user: str | None,
    fields: dict[str, Any],
    action: str | None = None,
    outcome: str | None = None,
) -> dict[str, Any]:
    """Return the column values for an Event row (everything except id / run linkage)."""
    spec = CATEGORIES[category]
    port = _first(fields, "DestinationPort", "dst_port")
    resolved_user = user or _first(
        fields, "TargetUserName", "SubjectUserName", "User", "userIdentity.userName"
    )
    return {
        "timestamp": ts,
        "source": spec.source,
        "category": category,
        "logsource": dict(spec.logsource),
        "host": host,
        "user": resolved_user,
        "action": action or _first(fields, "eventName") or spec.default_action,
        "outcome": outcome,
        "src_ip": _first(
            fields, "SrcIP", "IpAddress", "c-ip", "src_ip", "sourceIPAddress", "SourceIp"
        ),
        "dst_ip": _first(fields, "DestinationIp", "dst_ip"),
        "dst_port": int(port) if isinstance(port, (int, str)) and str(port).isdigit() else None,
        "process": _first(fields, "Image", "Program"),
        "parent_process": _first(fields, "ParentImage"),
        "command_line": _first(fields, "CommandLine", "ScriptBlockText"),
        "message": spec.summarize(host, resolved_user, fields),
        "raw": spec.render(ts, host, user, fields),
        "fields": _with_context(fields, host, resolved_user),
    }


def _with_context(fields: dict[str, Any], host: str | None, user: str | None) -> dict[str, Any]:
    """Sigma rules may reference Computer/User; make sure they exist in the field map."""
    out = dict(fields)
    if host is not None:
        out.setdefault("Computer", host)
    if user is not None:
        out.setdefault("User", user)
    return out
