---
name: graph-deploy
description: DEPLOY phase — DORA release health, deploy gate (7 checks), CI pipeline, post-release validation
trigger: /graph-deploy
tools_used: [agf forecast, agf gate deploy, agf snapshot create, agf export]
tokens: ~500
---

<!-- shared:phases,gates,principles,errors,harness -->

# graph-deploy

CI pipeline, release validation, DORA health, post-release verification — all via `agf`.

## When

- After HANDOFF (PR + docs ready)
- CI green → release
- `_lifecycle.phase === DEPLOY`

## Flow

```
agf forecast → agf gate deploy → [CI/merge] → agf snapshot create → agf gate deploy → agf phase
```

## Steps

### 1. DORA Release Health

`agf forecast` — deploy frequency, lead time, change fail rate, MTTR. Target: on-demand deploys, lead time < 1h, CFR < 15%, MTTR < 1h.

### 2. Release Check

`agf gate deploy` — 5 required (CI passed, PR merged, all tests green, snapshot created, all tasks done) + 2 recommended (harness ≥ 70, no open critical bugs).

### 3. CI Pipeline

Monitor: lint → typecheck → unit → integration → build. Fail → fix → re-run.

### 4. Merge & Deploy

PR merge → deploy. Post-deploy: smoke tests, monitoring alerts.

### 5. Post-Release Snapshot

`agf snapshot create` — capture post-release baseline.

### 6. Deploy Ready Gate

`agf gate deploy` — all 7 checks pass. Harness ≥ 70 mandatory for release.

## Exit

- [ ] CI green (lint + typecheck + tests + build)
- [ ] PR merged, release deployed
- [ ] `agf gate deploy` all checks pass
- [ ] `agf phase`

Loop: deployed → next: graph-listening.

## Economy

Token economy is part of the loop: run `agf savings` / `agf metrics --economy-report` after each task, then feed savings → `agf learning` to calibrate the next turn (spiral, not circle).
