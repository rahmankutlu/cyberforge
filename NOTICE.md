# Notices

## CyberForge

Copyright (c) 2026 Abdurrahman Kutlu ([rahmankutlu.com](https://rahmankutlu.com), [info@rahmankutlu.com](mailto:info@rahmankutlu.com)). Contributors keep the copyright in their contributions and license them under the same terms (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Third-party notices

CyberForge is released under the [MIT License](LICENSE). It builds on the work of others, and some content carries its own terms.

## MITRE ATT&CK® and MITRE ATLAS™

`mitre/attack.json` and `mitre/atlas.json` contain names, descriptions, identifiers and relationships derived from **MITRE ATT&CK®** (Enterprise, STIX data) and **MITRE ATLAS™**.

- © The MITRE Corporation. ATT&CK® is a registered trademark and ATLAS™ is a trademark of The MITRE Corporation.
- ATT&CK content is used under the [ATT&CK Terms of Use](https://attack.mitre.org/resources/terms-of-use/), which grant a royalty-free license to use, copy, and distribute it for research, development and commercial purposes provided the copyright notice and license are reproduced.
- ATLAS data is from the [`mitre-atlas/atlas-data`](https://github.com/mitre-atlas/atlas-data) repository.
- CyberForge is an independent project. It is not affiliated with, endorsed by, or sponsored by MITRE.

## Contributor Covenant

[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) is adapted from the [Contributor Covenant](https://www.contributor-covenant.org), version 2.1, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## EICAR test string

The EICAR anti-malware test string used in `detections/yara/eicar_test_file.yar` and as a threat-intel indicator is the standard, harmless test file published by [EICAR](https://www.eicar.org/).

## Sigma

Detection rules are written in the [Sigma](https://github.com/SigmaHQ/sigma) format. Rules in this repository are original works authored for CyberForge (they follow public Sigma conventions and reference public ATT&CK behaviours) and are provided under the MIT License. Sigma parsing and translation use [pySigma](https://github.com/SigmaHQ/pySigma) and its backends (LGPL-2.1 / MIT, see each package), installed as dependencies and not redistributed here.

## Software dependencies

Runtime dependencies are declared in `apps/api/pyproject.toml`, `pnpm-lock.yaml` and the package manifests, each under its own license. Notable ones: FastAPI, Pydantic, SQLAlchemy, Alembic (MIT/BSD-style); Next.js, React, Tailwind CSS, Radix UI, TanStack Query, Recharts, cmdk, Sonner, Lucide (MIT/ISC); pySigma and its backends; plyara (Apache-2.0); Geist fonts (SIL Open Font License 1.1).

## Synthetic data

All telemetry, incidents, indicators and analysts in this repository are fictional. Addresses come from RFC 1918 and the RFC 5737 documentation ranges, autonomous system numbers from the RFC 5398 documentation range, domains from reserved `.example` names, and account identifiers such as `123456789012` are placeholders. The CVE identifiers in the threat-intel seed are real, public vulnerabilities included as reference items only.
