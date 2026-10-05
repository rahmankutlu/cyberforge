"""Export or verify the API's OpenAPI document.

    pnpm openapi                  # print to stdout
    pnpm openapi:write            # refresh docs/api/openapi.json
    pnpm openapi:check            # fail if the committed contract differs from the code

No database or running server is needed: the schema is generated from the route definitions.
The committed document is the 1.x REST contract (see docs/versioning.md): a change to it is
visible in review, and an incompatible change is a major version.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from cyberforge.main import app

CONTRACT = Path(__file__).resolve().parents[1] / "docs" / "api" / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help=f"write {CONTRACT.name} in docs/api")
    mode.add_argument("--check", action="store_true", help="exit 1 if the contract is out of date")
    args = parser.parse_args(argv)

    document = render()
    if not app.openapi().get("paths"):
        print("OpenAPI document has no paths", file=sys.stderr)
        return 1
    if args.write:
        CONTRACT.parent.mkdir(parents=True, exist_ok=True)
        CONTRACT.write_text(document, encoding="utf-8")
        print(f"Wrote {CONTRACT.relative_to(CONTRACT.parents[2])}")
        return 0
    if args.check:
        committed = CONTRACT.read_text(encoding="utf-8") if CONTRACT.exists() else ""
        if committed != document:
            print(
                "docs/api/openapi.json is out of date. Review the API change, then run "
                "`pnpm openapi:write` and commit the result. An incompatible change needs a "
                "major version (docs/versioning.md).",
                file=sys.stderr,
            )
            return 1
        print("OpenAPI contract is up to date.")
        return 0
    sys.stdout.write(document)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
