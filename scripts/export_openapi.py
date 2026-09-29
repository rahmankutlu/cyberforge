"""Write the API's OpenAPI document to a file (default: stdout).

    pnpm openapi > openapi.json

No database or running server is needed: the schema is generated from the route definitions.
"""

from __future__ import annotations

import json
import sys

from cyberforge.main import app


def main() -> int:
    spec = app.openapi()
    if not spec.get("paths"):
        print("OpenAPI document has no paths", file=sys.stderr)
        return 1
    json.dump(spec, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
