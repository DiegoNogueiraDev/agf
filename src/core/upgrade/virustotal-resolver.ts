/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * virustotal-resolver — pure orchestration of the VT verdict for one asset (no I/O).
 * VirusTotal only has a report for files it has already SEEN — a fresh release binary
 * returns 404 on GET /files/{sha256}. So: query by hash first (cheap, reused report);
 * only when unknown, UPLOAD the binary and poll the analysis. All HTTP is behind the
 * injected `VtPorts` (DIP) so this stays unit-testable; the CLI wires real fetch calls.
 * Fail-open everywhere — an error or incomplete analysis yields null (checksum-only badge).
 *
 * Fixes node_fe99c479e79f (query-by-hash alone never populated virustotal for our
 * never-submitted binaries). Feeds collectScanAssets → buildScanInfo → SCANINFO.json.
 */
import type { VirusTotalResult } from '../../schemas/scan-info.js'

export interface VtPorts {
  /** GET /files/{sha256}: existing report, `'not-found'` on 404, or null on error. */
  queryByHash(sha256: string): Promise<VirusTotalResult | 'not-found' | null>
  /** Upload the binary at filePath; resolve the analysis id to poll. */
  upload(filePath: string): Promise<string>
  /** Poll GET /analyses/{id} until completed; null if it never completes in time. */
  poll(analysisId: string): Promise<VirusTotalResult | null>
}

export interface ResolveVtInput {
  sha256: string
  filePath: string
}

/** Resolve one asset's VT verdict: reuse an existing report, else upload + poll. */
export async function resolveVtVerdict(input: ResolveVtInput, ports: VtPorts): Promise<VirusTotalResult | null> {
  try {
    const known = await ports.queryByHash(input.sha256)
    if (known !== 'not-found') return known // stats or null (caller treats null as unavailable)

    const analysisId = await ports.upload(input.filePath)
    return await ports.poll(analysisId)
  } catch {
    return null // rate limit / network / oversize → checksum+signature still carry the badge
  }
}
