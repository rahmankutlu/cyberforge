#!/usr/bin/env python3
"""Give every Sigma document under detections/sigma/ a stable, unique UUID.

New rules can be authored with the placeholder id `00000000-0000-0000-0000-00000000000N`;
this script replaces placeholders with UUIDv5 values derived from the file slug (and the
document position for multi-document correlation files), so IDs are reproducible.
Existing real UUIDs are left untouched.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMESPACE = uuid.UUID(
    "6f0f6a0e-5b7a-4a54-9d3e-8c1c2f9d7a11"
)  # CyberForge rule namespace
PLACEHOLDER = re.compile(
    r"^id:\s*00000000-0000-0000-0000-00000000000\d\s*$", re.MULTILINE
)


def main() -> None:
    changed = 0
    for path in sorted((ROOT / "detections" / "sigma").rglob("*.yml")):
        if path.name == "tests.yml" or path.name.endswith(".tests.yml"):
            continue
        slug = path.parent.name if path.name == "rule.yml" else path.stem
        text = path.read_text(encoding="utf-8")
        counter = iter(range(1000))

        def replace(_: re.Match[str], slug: str = slug, it=counter) -> str:
            return f"id: {uuid.uuid5(NAMESPACE, f'{slug}:{next(it)}')}"

        new = PLACEHOLDER.sub(replace, text)
        if new != text:
            path.write_text(new, encoding="utf-8", newline="\n")
            changed += 1
    print(f"assigned ids in {changed} file(s)")


if __name__ == "__main__":
    main()
