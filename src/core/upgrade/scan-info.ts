/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * scan-info — pure aggregation of the SCANINFO.json release-trust artifact (no I/O).
 * Given per-asset facts (sha256, signature, optional VirusTotal), derive the overall
 * verdict the landing badge shows before a download. The daily scan job (a separate
 * script) collects the facts and injects the ISO timestamp; this stays deterministic.
 *
 * Verdict precedence — a detected virus is NEVER hidden: flagged > unknown > clean.
 *   flagged: some asset has virustotal.flagged > 0 (a security alarm dominates).
 *   unknown: a sha256 is missing (integrity can't even be verified).
 *   clean:   every asset has sha256 and (no VirusTotal, or 0 flagged).
 *
 * Owning contract: node_d9371aff3aaf. Schema/type source: schemas/scan-info.ts.
 */
import type { ScanAsset, ScanInfo, ScanVerdict } from '../../schemas/scan-info.js'

export interface BuildScanInfoInput {
  version: string
  /** Injected ISO8601 timestamp — keeps this function pure/testable. */
  scannedAt: string
  assets: ScanAsset[]
}

/** Derive the overall verdict from the per-asset scan facts (flagged > unknown > clean). */
export function deriveVerdict(assets: readonly ScanAsset[]): ScanVerdict {
  if (assets.some((a) => a.virustotal !== null && a.virustotal.flagged > 0)) return 'flagged'
  if (assets.some((a) => !a.sha256)) return 'unknown'
  return 'clean'
}

/** Assemble the SCANINFO.json payload — pure, ready to serialize next to BUILDINFO. */
export function buildScanInfo(input: BuildScanInfoInput): ScanInfo {
  return {
    version: input.version,
    scannedAt: input.scannedAt,
    assets: input.assets,
    verdict: deriveVerdict(input.assets),
  }
}
