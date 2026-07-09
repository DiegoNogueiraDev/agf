---
name: graph-dependency
description: Dependency audit — SBOM generation, license compliance, supply-chain security, freshness scoring via npm + the `agf` CLI
triggers:
  - graph-dependency
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-dependency

Dependency audit: SBOM, license compliance, supply-chain security, freshness. Finds vulnerabilities, license risks, outdated packages, and attack vectors. Drive via the `agf` CLI (zero MCP).

## When to Use

- Pre-DEPLOY / monthly maintenance
- Adding new dependencies
- Security reviews / after npm audit findings

## Mandatory Flow

```
npm audit → license scan → freshness → SBOM → supply chain → update plan → report → agf memory write
```

## Workflow

### Step 1: Audit

```bash
npm audit --json
```

Count vulns by severity (critical/high/moderate/low); split prod vs dev; flag auto-fixable vs manual; compare with prior audit. Critical/high CVE = DEPLOY blocker.

### Step 2: License Compliance

```bash
npm ls --json --all
```

Check each prod license vs project (MIT). Allowlist: MIT, ISC, BSD-2/3-Clause, Apache-2.0, 0BSD, CC0-1.0. Denylist: GPL-2.0/3.0-only, AGPL-3.0, SSPL-1.0, BSL. Flag unknown/missing (`UNLICENSED`, `SEE LICENSE IN`).

### Step 3: Freshness Scoring

```bash
npm outdated --json
```

Score: latest=100, 1 minor behind=80, 2+ minor=60, 1 major=50, 2+ major=20, no release 12mo (unmaintained)=0. Average across prod deps; list bottom 10 as update targets; flag score=0.

### Step 4: SBOM Generation

```bash
npm sbom --sbom-format cyclonedx
```

Include all prod+dev deps with versions + full transitive tree; record name/version/license/supplier. Output `sbom.json` (CycloneDX). Verify component count matches `npm ls --all`.

### Step 5: Supply Chain Analysis

Check typosquatting (1-2 char diffs from popular pkgs), dependency confusion (internal/public name collision), maintainer takeover (ownership changes <6mo). Flag <100 weekly downloads, single maintainer (bus factor 1). Verify no `extraneous`/`missing`; lockfile integrity hashes present.

### Step 6: Update Plan

Priority: 1) Critical — critical/high CVE security fixes (now); 2) High — moderate CVE (this sprint); 3) Medium — major bumps w/ breaking changes (plan migration); 4) Low — minor/patch (batch). Check changelogs for breaking changes; estimate migration effort; verify test coverage before updating. Track significant updates:

```bash
agf node add --type task --title "update <pkg> to <version>"
```

### Step 7: Report

Score 0-100 (audit 30%, licenses 20%, freshness 25%, supply chain 25%).

```bash
agf memory write dependency-audit-<date>
```

Grades: A(90+) zero crit/high CVE, compliant, freshness>80; B(75+) no crit, minor issues, >65; C(60+) high CVE w/ fix, warnings, >50; D(45+) crit present, violations, <50; F(<45) multiple unfixed crit, blockers, active risks.

## Output Format

```
Phase: DEPENDENCY AUDIT
Vulns: C/H/M/L  License: N incompatible, N unknown
Freshness: N%  SBOM: N components  Supply chain: N findings
Update plan: C/H/M/L  Overall: A-F  Recommendations: top 3
Saved: "Dependency Audit — <date>"
```

> Loop link → DEPLOY (graph-deploy): `agf gate deploy` (harness ≥ 70).

## Anti-Patterns

- Check license compat before adding deps — one GPL dep relicenses the project
- Don't ignore major bumps — assess breaking changes
- Audit dev deps too — build tools get compromised
- Downloads count alone isn't trust — check maintainer history
- Don't delay security updates
- Review package-lock.json diffs — supply-chain attacks hide there

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
