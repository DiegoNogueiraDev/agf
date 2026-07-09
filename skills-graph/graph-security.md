---
name: graph-security
description: Security + dependency audit — OWASP Top 10, STRIDE, npm audit, secrets, SBOM, license, supply chain
trigger: /graph-security
tools_used: [insights, quality, memory]
tokens: ~800
---

<!-- shared:principles,errors -->

# graph-security

Security + dependency audit. OWASP Top 10, STRIDE, secrets scan, SBOM, license, supply chain.

## When

- Before DEPLOY — security gate mandatory
- After IMPLEMENT for auth, input handling, file I/O features
- `$graph-security` or "security audit", "check vulnerabilities", "dependency audit"

## Flow

```
npm audit → OWASP → secrets scan → STRIDE → input validation → path traversal → [deps: license → freshness → SBOM → supply chain] → report → agf memory write
```

## Steps

### 1. Dependency Vuln Scan

`npm audit --audit-level=high` — count CVEs by severity; flag no-fix packages.

### 2. OWASP Top 10

| #   | Category               | Check                                |
| --- | ---------------------- | ------------------------------------ |
| A01 | Broken Access Control  | Auth guards on all routes?           |
| A02 | Cryptographic Failures | Sensitive data in plaintext?         |
| A03 | Injection              | SQL/string interpolation in queries? |
| A04 | Insecure Design        | Threat model? Input validation?      |
| A05 | Misconfiguration       | Security headers? Debug off?         |
| A06 | Vulnerable Components  | npm audit passed?                    |
| A07 | Auth Failures          | Password strength? Rate limiting?    |
| A08 | Integrity Failures     | CI/CD supply chain? Checksums?       |
| A09 | Logging & Monitoring   | Audit trail? Alerts?                 |
| A10 | SSRF                   | URL fetching validates hosts?        |

### 3. Secrets Scanning

Find: API keys, tokens, private keys, hardcoded passwords, connection strings. Patterns: `[A-Za-z0-9+/]{40,}`, `(sk-|pk-|ghp_|gho_)`, `BEGIN.*PRIVATE KEY`.

### 4. STRIDE Threat Model

| Threat                 | Property        | Check                                |
| ---------------------- | --------------- | ------------------------------------ |
| Spoofing               | Authentication  | How is identity verified?            |
| Tampering              | Integrity       | Data mutable in transit?             |
| Repudiation            | Non-repudiation | Audit trail covers critical actions? |
| Info Disclosure        | Confidentiality | Data exposed in logs/errors?         |
| Denial of Service      | Availability    | Rate limiting? Timeouts?             |
| Elevation of Privilege | Authorization   | Privilege escalation possible?       |

### 5. Input Validation

User input sanitization, XSS (escaping), SQL injection (parameterized queries), file upload (type/size/path traversal).

### 6. Path Traversal

Grep `path.join`, `path.resolve`, `fs.readFile` with user input. Flag vulns.

### 7. License Compliance

`npx license-checker --summary`. Allow: MIT, Apache-2.0, ISC, BSD-2/3. Deny: GPL (if incompatible), unlicensed, unauthorized proprietary.

### 8. Dependency Freshness

Score: latest 100, 1 major behind 70, 2+ behind 20, unmaintained 0. Target avg ≥ 70.

### 9. SBOM

`agf insights` — SPDX or CycloneDX. Include package, version, license, deps.

### 10. Supply Chain

Check: typosquatting, dependency confusion (private names on public npm), maintainer risk (1 maintainer, no 2FA).

## Exit

- [ ] npm audit no critical/high CVEs (or remediation plan)
- [ ] OWASP Top 10 checklist complete
- [ ] 0 exposed secrets
- [ ] SBOM generated
- [ ] Findings consolidated in quality gate (`agf quality`)
- [ ] Report saved via `agf memory write`

Loop: security clean → next: graph-review.
