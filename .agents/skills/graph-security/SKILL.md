---
name: graph-security
description: Security audit via the `agf` CLI — OWASP / STRIDE / secrets. Run when a change touches authn/authz, external I/O, or secrets, as a gate parallel to harness, or before deploying sensitive features.
triggers:
  - graph-security
version: 2.0.0
author: auto-generated
date: 2026-06-16
category: REVIEW
phase: REVIEW
tokens: ~578
phases: [REVIEW, DEPLOY]
---

# graph-security

Security audit (OWASP / STRIDE / secrets). Drive via the `agf` CLI — zero MCP. Load context with `agf context <id>` first.

## When to Use

- Change touches authn/authz, external I/O, or secrets
- Gate parallel to harness
- Before deploying sensitive features

## Mandatory Flow

```
agf check <id> → agf scan-repos → agf node add --type risk
```

## Steps

REVIEW-phase `agf` commands:

| Command                    | What it does                           |
| -------------------------- | -------------------------------------- |
| `agf check <id>`           | Includes the per-task security gate    |
| `agf harness`              | Agent-readiness (parallel to security) |
| `agf node add --type risk` | Track security findings as a risk node |
| `agf scan-repos`           | Scan neighbor repos for known vulns    |

## Workflow

1. Per-Task Check — `agf check <id>` (per-task security gate)
2. Repo Scan — `agf scan-repos` (npm audit, secrets grep, Zod boundaries)
3. STRIDE Analysis — threats per category (Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation)
4. Register Findings — `agf node add --type risk`
5. Mitigate — create tasks to fix critical/high findings
6. Validate — no critical secret/vuln remaining

## Exit

- [ ] No critical secret/vuln
- [ ] Findings tracked as risk nodes
- [ ] Security gate pass

## Anti-Patterns

- Don't ignore findings — always track as risk nodes
- Don't assume harness covers security — they're parallel gates
- Don't deploy with critical vulns — fix before DEPLOY
- Don't skip neighbor-repo scan — supply chain matters

## Output Format

```
Phase: SECURITY (REVIEW parallel)
Findings: N risks (K critical, M high, J medium)
Secrets: scan result
Vulns: npm audit result
STRIDE: categories covered
Gate: security pass/fail
Status: Security gate passed
```

## Loop Link

Parallel to REVIEW → DEPLOY. After tasks, `agf savings` / `agf metrics --economy-report` → `agf learning` → calibrate next turn.

## Related Skills

- $graph-review — `agf skill show graph-review`
- $graph-deploy — `agf skill show graph-deploy`

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
