---
name: graph-dependency
description: Dependency management audit using SBOM generation, license compliance, supply chain security, and freshness scoring
triggers:
  - graph-dependency
version: 2.0.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-dependency

Dependency management audit using SBOM generation, license compliance, supply chain security, and freshness scoring. Identifies vulnerabilities, license risks, outdated packages, and supply chain attack vectors across all project dependencies.

> Cross-references: [[swe-at-google]] ch21 (Dependency Management), ch18 (Build Systems); [[humble-continuous-delivery]] ch14 (Advanced Version Control)

## When to Use

- Before DEPLOY phase
- Monthly maintenance cycles
- When adding new dependencies
- During security reviews
- After npm audit findings

## Mandatory Flow

```
npm audit → license scan → one-version check → diamond detection → freshness check → SBOM generation → supply chain analysis → upgrade plan → report → write_memory
```

## Workflow

### Step 1: Dependency Audit

Run `npm audit --json` for full vulnerability report. Categorize by severity (critical/high/medium/low). Check both production and dev dependencies. Flag critical/high CVEs as DEPLOY blockers.

- Count vulnerabilities by severity: critical, high, moderate, low
- Separate findings into production vs dev dependencies
- Check for `npm audit fix` auto-fixable issues vs manual resolution
- Compare with previous audit memory to identify new vs recurring CVEs

### Step 2: One-Version Rule Check

**SWE@Google principle**: enforce exactly one version of every third-party dependency across the project. Multiple versions of the same package create hidden diamond conflicts and inflate bundle size.

```bash
# Find packages with multiple installed versions
npm ls --json --all 2>/dev/null | node -e "
  const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const seen={};
  function walk(deps,name){
    if(!deps) return;
    Object.entries(deps).forEach(([k,v])=>{
      seen[k]=seen[k]||new Set();
      seen[k].add(v.version);
      walk(v.dependencies,k);
    });
  }
  walk(d.dependencies);
  Object.entries(seen).filter(([k,v])=>v.size>1)
    .forEach(([k,v])=>console.log(k+': '+[...v].join(', ')));
"
```

Flag each duplicate version as a **One-Version Violation**. Target state: zero violations.

### Step 3: Diamond Dependency Detection

**Diamond problem**: `app → libA@1.x` and `app → libB@2.x` both depend on `libbase` at incompatible versions. Types and APIs passed across version boundaries break silently.

```bash
# Detect diamond conflicts: packages with 2+ versions in the tree
npm ls --json --all 2>/dev/null | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const versions = {};
  function collect(deps) {
    if (!deps) return;
    for (const [name, info] of Object.entries(deps)) {
      if (!versions[name]) versions[name] = [];
      versions[name].push(info.version);
      collect(info.dependencies);
    }
  }
  collect(data.dependencies);
  Object.entries(versions)
    .filter(([,v]) => new Set(v).size > 1)
    .forEach(([name, v]) => console.log('DIAMOND:', name, [...new Set(v)].join(' vs ')));
"
```

For each diamond: identify which consumers pin the conflicting versions and assess resolution path (upgrade one, dedup, or replace).

### Step 4: License Compliance

Check all dependency licenses via `npm ls --json`. Flag incompatible licenses.

- Allowlist: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0
- Denylist (in MIT project): GPL-2.0-only, GPL-3.0-only, AGPL-3.0, SSPL-1.0
- Flag unknown licenses: `UNLICENSED`, `SEE LICENSE IN`, missing license field

### Step 5: Freshness Scoring

Each major version behind represents months of accumulated unpatched CVEs, community drift, and API churn. Freshness is a security signal, not just a hygiene score.

Run `npm outdated --json` and score each production dependency:

| State                    | Score | Security Implication                   |
| ------------------------ | ----- | -------------------------------------- |
| Latest installed         | 100   | Baseline                               |
| 1 minor behind           | 80    | Minor CVE exposure window              |
| 2+ minor behind          | 60    | Moderate unpatched surface             |
| 1 major behind           | 50    | ~6–12 months CVE lag                   |
| 2+ major behind          | 20    | 1+ year unpatched, likely breaking API |
| No release in 12+ months | 0     | Unmaintained — supply chain risk       |

Calculate average freshness. List bottom 10 as priority update targets.

### Step 6: SBOM Generation

Generate Software Bill of Materials in CycloneDX format (NIST/CISA mandated for supply chain transparency). Pin all deps with cryptographic hashes — the build must fail if a downloaded artifact doesn't match.

```bash
npm sbom --sbom-format cyclonedx > sbom.json
```

Verify SBOM completeness: total components must match `npm ls --all` count. Validate `package-lock.json` integrity hashes are present for every dependency.

### Step 7: Supply Chain Analysis

- Check for typosquatting: 1–2 char differences from popular package names
- Check for dependency confusion: internal package names must not collide with public npm
- Flag packages with <100 weekly downloads or single maintainer (bus factor = 1)
- Check for recent ownership transfers in the last 6 months
- Verify no `extraneous` or `missing` packages in `npm ls` output

### Step 8: Upgrade Automation Checklist

**SWE@Google principle**: upgrades that are not automated simply do not happen. Manual upgrade policies accumulate as compounding debt.

- [ ] Automated PRs: Dependabot or Renovate configured to open upgrade PRs
- [ ] Test gate: CI must pass before any automated PR can merge
- [ ] Rollback plan: `package-lock.json` committed and pinned — one revert recovers the prior state
- [ ] Pin after update: use exact versions (`"1.2.3"`) not ranges (`"^1.2.3"`) for critical deps
- [ ] Changelog review: automate fetching changelogs (Renovate release notes) — do not skip reading breaking changes

### Step 9: Dependency Report

Score 0-100 (audit 30%, licenses 20%, freshness 25%, supply chain 25%).

```bash
agf scan-binaries                     # shipped binaries: provenance, unexpected executables
agf memory write dependency-audit-<date> --content "<report>"
```

Every unresolved CVE or license conflict becomes a node — `agf node add --type risk` — or it is not tracked.

**Grading:**

- **A (90-100):** Zero critical/high CVEs, all licenses compliant, freshness > 80%, zero One-Version violations
- **B (75-89):** No critical CVEs, minor license issues, freshness > 65%, ≤2 diamond conflicts
- **C (60-74):** Some high CVEs with fix available, freshness > 50%, One-Version violations present
- **D (45-59):** Critical CVEs, license violations, freshness < 50%, diamond conflicts unresolved
- **F (< 45):** Multiple critical CVEs unfixed, GPL blockers, widespread outdated deps, active supply chain risks

## Anti-Patterns

- Do NOT add dependencies without checking license compatibility — one GPL dep can relicense your project
- Do NOT use version ranges (`^`, `~`, `1.+`) for critical deps — breaks reproducibility and rollbacks
- Do NOT skip One-Version checks — silent type mismatches from diamond conflicts surface at runtime, not build time
- Do NOT rely on SemVer patch-safety guarantees at scale — Hyrum's Law means patch changes break observable behavior
- Do NOT delay security updates — critical CVEs need immediate action
- Do NOT import a dependency without a clear owner and update plan — it becomes unmaintained infrastructure

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
