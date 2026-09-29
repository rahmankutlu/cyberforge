## What and why

<!-- One or two sentences. Link the issue: Fixes #123 -->

## Type

- [ ] Bug fix
- [ ] Feature / UI / API
- [ ] New or changed lab
- [ ] New or changed detection rule
- [ ] Docs
- [ ] Tooling / CI

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:api` pass
- [ ] `pnpm test` passes (added tests for new behaviour)
- [ ] `pnpm validate:content` passes (if content or docs changed)
- [ ] `pnpm test:e2e` passes (if a user-facing flow changed)
- [ ] Docs, `.env.example` and CHANGELOG updated where relevant
- [ ] Screenshots attached for UI changes (dark and light)

## Safety

- [ ] No real credentials, personal data, or real-world targets
- [ ] Offensive behaviour is telemetry-only or confined to the isolated lab container
- [ ] No exploit code for real software

## Notes for the reviewer

<!-- Trade-offs, follow-ups, anything surprising. -->
