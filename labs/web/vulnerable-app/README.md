# Acme Portal (intentionally vulnerable)

The target application for labs 01–07. **It is deliberately insecure. Never deploy it, never expose it.**

| Flaw | Where | Lab |
| --- | --- | --- |
| No login lockout, throttling or MFA | `POST /login` | 01 Broken Authentication |
| SQL injection (string-built query, verbose errors) | `GET /search?q=` | 02 SQL Injection |
| Reflected XSS | `GET /search?q=`, `GET /profile?name=` | 03 Cross-Site Scripting |
| IDOR (no ownership check) | `GET /api/invoices/{id}` | 04 IDOR |
| JWT verifier accepts `alg: none`, weak HMAC secret | `GET /api/admin/users` | 05 JWT |
| Secrets served from the web root | `/.env`, `/.git/config` | 06 Secrets Exposure |
| No rate limiting | `POST /api/v1/coupons/redeem` | 07 Rate Limits |

## Safety by design

- All data is fake and lives in an in-memory SQLite database.
- No file access, no shell, no outbound requests except shipping its own access log to the CyberForge API.
- Runs read-only, as a non-root user, with every Linux capability dropped, on an **internal Docker network with no internet**.
- Reachable from your machine only through `lab-gateway`, bound to `127.0.0.1:8081`.

```bash
docker compose --profile labs up -d lab-vuln-web lab-gateway
open http://127.0.0.1:8081
```

Each request is sent to CyberForge as a web-access event, so the Sigma rules for these flaws fire on
real lab activity. Start with the lab's simulation if you just want to see the detections.
