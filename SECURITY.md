# Security Policy

CyberForge is a local cybersecurity lab. It ships an _intentionally_ vulnerable practice application, so it matters to be clear about what is a vulnerability in CyberForge and what is the exercise.

## Supported Versions

| Version       | Supported |
| ------------- | --------- |
| 1.x (current) | Yes       |
| 0.1.x         | No        |

Security fixes are released as patch versions of the latest 1.x release. What 1.x keeps stable is described in [docs/versioning.md](docs/versioning.md).

## Reporting a Vulnerability

Please do not open a public issue for a security problem.

Report it privately with GitHub's **Private Vulnerability Reporting**: go to the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/rahmankutlu/cyberforge/security/advisories/new)).

Helpful details: what you found, the impact, steps to reproduce, the affected version or commit, and a suggested fix if you have one. This is a volunteer-maintained project, so responses are best-effort, but every report is read. Reporters are credited in the advisory unless they prefer otherwise.

## Security Scope

In scope:

- The API (`apps/api`), the web app (`apps/web`), the container and Compose configuration, CI workflows and the content loaders.
- Bypasses of the simulation-target guardrails, the Origin check, the ingest token, the rate limiter or the production start-up checks.
- Injection, XSS, SSRF, path traversal, unsafe deserialisation or secret exposure in CyberForge's own code.
- Ways to make the optional AI analyst execute an action or send data anywhere other than the configured provider.

Out of scope:

- The deliberate flaws in the practice application (`labs/web/vulnerable-app`): SQL injection, XSS, IDOR, `alg: none` JWTs, an exposed `.env` and so on are the exercise. A way to use them to leave the container _is_ in scope.
- The absence of authentication in 1.x. CyberForge is a single-user local tool and must not be exposed to untrusted networks. See [docs/security-model.md](docs/security-model.md).
- Findings that need an already-compromised host or Docker daemon.
- Denial of service against a local instance by a local user.
- Vulnerabilities in third-party dependencies with no demonstrated impact on CyberForge; report those upstream.

## Lab Isolation

- Simulations replay telemetry. They never send packets, and targets are validated to be `localhost`, RFC 1918 addresses or `*.lab.internal` names. Public hosts, URLs, ports and credentials are rejected.
- The vulnerable practice application only starts with the `labs` Compose profile. It sits on an internal network with no route to the internet and is reachable only through a gateway bound to `127.0.0.1`.
- All published ports bind to `127.0.0.1` by default. Do not publish the database, Redis or the lab containers on other interfaces.

## Responsible Usage

CyberForge is for learning and defence. Use it only on systems you own or are authorised to test, and run the `labs` profile on a machine or VM you are comfortable running vulnerable software on.

If you run a shared instance, set `CYBERFORGE_ENV=production` and generate real values for `POSTGRES_PASSWORD` and `CYBERFORGE_LAB_INGEST_TOKEN` (for example `openssl rand -hex 24`); the API refuses to start in production with the development defaults. If you enable an AI provider, an alert's telemetry is sent to it when you click **Analyze**.
