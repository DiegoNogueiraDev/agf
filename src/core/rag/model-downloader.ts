/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-17.T01 — Model downloader with optional SHA256 verification.
 *
 * Extracts the existing `downloadFile` logic from `onnx-embeddings.ts` and
 * augments it with content-integrity checks. When an `expectedSha256` is
 * supplied, a mismatch removes the partial file and throws a typed error so
 * callers can react (retry, fail loudly, etc).
 *
 * Why this matters: ensureModelFiles() in onnx-embeddings.ts only validates
 * size > 1KB and JSON parsability — a corrupted-but-large binary with valid
 * magic bytes would silently pass and break inference. This module closes
 * that gap without breaking the existing API.
 */

import { writeFileSync, existsSync, unlinkSync, statSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createLogger } from '../utils/logger.js'
import { withRetry } from '../utils/retry-executor.js'

const log = createLogger({ layer: 'core', source: 'model-downloader.ts' })

const DOWNLOAD_TIMEOUT_MS = 90_000

export interface DownloadResult {
  /** Hex-encoded SHA256 of the file as written. */
  sha256: string
  /** Whether the hash matched the caller-supplied expected value. */
  verified: boolean
  /** Size of the downloaded artifact in bytes. */
  sizeBytes: number
}

export class ChecksumMismatchError extends Error {
  constructor(
    public readonly url: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`SHA256 mismatch for ${url}: expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…`)
    this.name = 'ChecksumMismatchError'
  }
}

export class DownloadError extends Error {
  constructor(
    public readonly url: string,
    message: string,
  ) {
    super(message)
    this.name = 'DownloadError'
  }
}

/** Compute the SHA256 of a file synchronously. Hex-encoded output. */
export function computeFileSha256(path: string): string {
  const hash = createHash('sha256')
  hash.update(readFileSync(path))
  return hash.digest('hex')
}

/**
 * Download a URL to a destination path with optional SHA256 verification.
 *
 * - If `expectedSha256` is omitted, the file is downloaded and the computed
 *   hash is returned in the result with `verified: false`. This is useful
 *   for the first-download case where the canonical hash is captured for
 *   future pinning.
 * - If `expectedSha256` is provided and matches, returns `verified: true`.
 * - If `expectedSha256` is provided and mismatches, the partial file is
 *   removed and `ChecksumMismatchError` is thrown — preventing reuse of a
 *   corrupted artifact on the next process start.
 */
export async function downloadFileWithVerify(
  url: string,
  destPath: string,
  expectedSha256?: string,
): Promise<DownloadResult> {
  log.info('model-downloader:start', { url, dest: destPath, hasExpectedHash: !!expectedSha256 })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new DownloadError(url, `Download timeout (${DOWNLOAD_TIMEOUT_MS}ms): ${url}`)
    }
    throw new DownloadError(url, err instanceof Error ? err.message : String(err))
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw new DownloadError(url, `HTTP ${response.status} for ${url}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(destPath, buffer)

  const actualSha = computeFileSha256(destPath)
  const sizeBytes = statSync(destPath).size

  if (expectedSha256 && actualSha !== expectedSha256) {
    if (existsSync(destPath)) unlinkSync(destPath)
    log.warn('model-downloader:checksum-mismatch', { url, expected: expectedSha256, actual: actualSha })
    throw new ChecksumMismatchError(url, expectedSha256, actualSha)
  }

  const verified = expectedSha256 != null && actualSha === expectedSha256
  log.info('model-downloader:ok', { dest: destPath, sizeBytes, sha256: actualSha, verified })

  return { sha256: actualSha, verified, sizeBytes }
}

/**
 * Download only if dest is missing or its hash mismatches expectedSha256.
 * Idempotent: re-running with the same expected hash is a no-op when the
 * file is already present and verified. On any download error, removes
 * the partial file so the next call can resume cleanly.
 *
 * Returns `cached:true` when the existing file matched and no network
 * call was issued.
 */
export async function downloadIfMissing(
  url: string,
  destPath: string,
  expectedSha256?: string,
): Promise<DownloadResult & { cached: boolean }> {
  if (existsSync(destPath)) {
    const actualSha = computeFileSha256(destPath)
    const sizeBytes = statSync(destPath).size
    if (!expectedSha256 || actualSha === expectedSha256) {
      log.info('model-downloader:cache-hit', { dest: destPath, sha256: actualSha, sizeBytes })
      return { sha256: actualSha, verified: actualSha === expectedSha256, sizeBytes, cached: true }
    }
    // Stale cached file with wrong hash — delete and re-download.
    log.warn('model-downloader:cache-stale', { dest: destPath, expected: expectedSha256, actual: actualSha })
    unlinkSync(destPath)
  }
  try {
    // Transient network/timeout failures are retried automatically; a checksum
    // mismatch or non-2xx HTTP response is not (classifyError marks them non-retryable).
    const resultValue = await withRetry(() => downloadFileWithVerify(url, destPath, expectedSha256), {
      maxAttempts: 3,
    })
    return { ...resultValue, cached: false }
  } catch (err) {
    // Partial-fail: leave nothing on disk so a retry can resume cleanly.
    if (existsSync(destPath)) {
      try {
        unlinkSync(destPath)
      } catch (err) {
        log.debug('intentional-swallow', { error: String(err), reason: 'best-effort cleanup' })
      }
    }
    throw err
  }
}
