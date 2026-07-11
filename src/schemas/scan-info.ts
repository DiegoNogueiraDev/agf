/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * scan-info schema — the SCANINFO.json artifact published next to BUILDINFO on the
 * release channel (github.com/DiegoNogueiraDev/agf/releases). It is the trust signal a reader checks
 * before running an installer: per-asset checksum + signature + optional VirusTotal
 * multi-engine verdict. Consumers: the landing badge and `agf upgrade` (may log verdict).
 * Owning contract node: node_d9371aff3aaf. Bump schemaVersion on any breaking change.
 */
import { z } from 'zod'

/** How the published binary is signed (darwin adhoc; windows Authenticode when present). */
export const signatureStatusSchema = z
  .enum(['signed', 'unsigned', 'adhoc'])
  .describe('Code-signing status of the published binary')

/** VirusTotal multi-engine result for one asset; null when the scan was unavailable. */
export const virusTotalSchema = z
  .object({
    flagged: z.number().int().min(0).describe('Engines that flagged the binary (0 = clean)'),
    total: z.number().int().min(0).describe('Total engines that scanned it'),
    permalink: z.string().describe('Public VirusTotal report URL'),
  })
  .describe('VirusTotal aggregate for one asset')

export const scanAssetSchema = z
  .object({
    name: z.string().describe('Fixed asset filename, e.g. agf-windows-x64.exe'),
    sha256: z.string().describe('SHA-256 of the published binary'),
    signature: signatureStatusSchema,
    virustotal: virusTotalSchema.nullable().describe('null = VirusTotal scan unavailable'),
  })
  .describe('Scan result for a single published channel')

export const scanVerdictSchema = z
  .enum(['clean', 'flagged', 'unknown'])
  .describe(
    'clean = all assets sha256-present and 0 flagged; flagged = a virus was detected; unknown = a sha256 is missing',
  )

export const scanInfoSchema = z
  .object({
    version: z.string().describe('= BUILDINFO.version'),
    scannedAt: z.string().describe('ISO8601 UTC of the scan job'),
    assets: z.array(scanAssetSchema),
    verdict: scanVerdictSchema,
  })
  .describe('SCANINFO.json — release trust artifact')

export type SignatureStatus = z.infer<typeof signatureStatusSchema>
export type VirusTotalResult = z.infer<typeof virusTotalSchema>
export type ScanAsset = z.infer<typeof scanAssetSchema>
export type ScanVerdict = z.infer<typeof scanVerdictSchema>
export type ScanInfo = z.infer<typeof scanInfoSchema>
