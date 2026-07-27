/*!
 * Tests for model-downloader.ts — ChecksumMismatchError and DownloadError classes.
 *
 * Both are pure typed Error subclasses with constructor parameters stored
 * as public properties. No FS, no network, no DB dependency.
 *
 * Covers: error name, instanceof, public properties (url/expected/actual),
 * message format including truncated hash slice, and that both extend Error.
 */

import { describe, it, expect } from 'vitest'
import { ChecksumMismatchError, DownloadError } from '../core/rag/model-downloader.js'

const FAKE_URL = 'https://models.example.com/tokenizer.bin'
const SHA_EXPECTED = 'a'.repeat(64) // 64-char hex SHA256
const SHA_ACTUAL = 'b'.repeat(64)

// ── ChecksumMismatchError ─────────────────────────────────────────────────────

describe('ChecksumMismatchError', () => {
  it('has name "ChecksumMismatchError"', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err.name).toBe('ChecksumMismatchError')
  })

  it('is an instance of Error', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of ChecksumMismatchError', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err).toBeInstanceOf(ChecksumMismatchError)
  })

  it('stores url as public property', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err.url).toBe(FAKE_URL)
  })

  it('stores expected hash as public property', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err.expected).toBe(SHA_EXPECTED)
  })

  it('stores actual hash as public property', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err.actual).toBe(SHA_ACTUAL)
  })

  it('includes the URL in the message', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err.message).toContain(FAKE_URL)
  })

  it('includes truncated expected hash (first 12 chars) in message', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err.message).toContain(SHA_EXPECTED.slice(0, 12))
  })

  it('includes truncated actual hash (first 12 chars) in message', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err.message).toContain(SHA_ACTUAL.slice(0, 12))
  })

  it('message contains "SHA256 mismatch"', () => {
    const err = new ChecksumMismatchError(FAKE_URL, SHA_EXPECTED, SHA_ACTUAL)
    expect(err.message).toContain('SHA256 mismatch')
  })

  it('different expected and actual hashes produce distinct truncated prefixes in message', () => {
    const expected = '1234567890abcdef' + 'x'.repeat(48)
    const actual = 'fedcba0987654321' + 'x'.repeat(48)
    const err = new ChecksumMismatchError(FAKE_URL, expected, actual)
    expect(err.message).toContain('1234567890ab')
    expect(err.message).toContain('fedcba098765')
  })
})

// ── DownloadError ─────────────────────────────────────────────────────────────

describe('DownloadError', () => {
  it('has name "DownloadError"', () => {
    const err = new DownloadError(FAKE_URL, 'HTTP 404 for resource')
    expect(err.name).toBe('DownloadError')
  })

  it('is an instance of Error', () => {
    const err = new DownloadError(FAKE_URL, 'connection refused')
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of DownloadError', () => {
    const err = new DownloadError(FAKE_URL, 'timeout')
    expect(err).toBeInstanceOf(DownloadError)
  })

  it('stores url as public property', () => {
    const err = new DownloadError(FAKE_URL, 'some error')
    expect(err.url).toBe(FAKE_URL)
  })

  it('message is the provided message string', () => {
    const msg = 'HTTP 503 for https://models.example.com/tokenizer.bin'
    const err = new DownloadError(FAKE_URL, msg)
    expect(err.message).toBe(msg)
  })

  it('different URLs produce different url property values', () => {
    const url1 = 'https://cdn.example.com/file-a.bin'
    const url2 = 'https://cdn.example.com/file-b.bin'
    const err1 = new DownloadError(url1, 'err')
    const err2 = new DownloadError(url2, 'err')
    expect(err1.url).not.toBe(err2.url)
  })
})
