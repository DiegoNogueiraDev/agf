# SCANINFO.json — public contract for the landing trust badge

Published next to `BUILDINFO` on the release channel by `agf scan-binaries`
(workflow `scan-binaries.yml`). Any consumer — a landing page, a package index, a
paranoid reader — can fetch it to check a binary's checksum, signature status and
scan verdict before trusting it.

Note that agf itself never fetches this file: nothing in the CLI reads it at
runtime. It exists so a _human_ can verify an artifact, not so the tool can phone
home about one.

- **URL:** `https://graph-flow.cloud/releases/SCANINFO.json`
- **Producer:** `agf scan-binaries` → `src/core/upgrade/scan-info.ts`
- **Schema (single source):** `src/schemas/scan-info.ts` (`scanInfoSchema`)

## Shape

```json
{
  "version": "0.20.5",
  "scannedAt": "2026-07-03T06:00:00.000Z",
  "assets": [
    {
      "name": "agf-darwin-arm64",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "signature": "adhoc",
      "virustotal": { "flagged": 0, "total": 72, "permalink": "https://www.virustotal.com/gui/file/aaaa" }
    },
    {
      "name": "agf-windows-x64.exe",
      "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "signature": "unsigned",
      "virustotal": null
    }
  ],
  "verdict": "clean"
}
```

## Badge rendering rules (by `verdict`)

| `verdict`   | Meaning                                                | Badge                                                                              |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **clean**   | every asset has a checksum and 0 VirusTotal detections | 🟢 green — "verified · 0 detections" + link to each asset's `virustotal.permalink` |
| **flagged** | at least one asset has `virustotal.flagged > 0`        | 🔴 red — "review flagged" + link to the flagged report; never auto-hide            |
| **unknown** | a `sha256` is missing (integrity unverifiable)         | ⚪ grey — "not yet verified" (no green claim)                                      |

Rules:

- `virustotal: null` on an asset means the scan was unavailable (no key / rate limit) —
  render checksum + signature only for that asset, not a red alarm.
- Always show `version` + `scannedAt` so the badge is honest about freshness.
- Never render a green "safe" badge for `flagged` or `unknown` — only `clean` earns green.
