/*!
 * TDD: STORE_NOT_FOUND classification (node_f1b41383d42d).
 *
 * The bug: openStoreOrFail(dir, {requireExisting:true}) called
 * log.error + process.exit(1) directly when workflow-graph/graph.db was
 * missing. Under piped/redirected stdio, --quiet auto-activates and
 * swallows the log.error, so a caller sees zero output on stdout AND
 * stderr — indistinguishable from a hang. These tests pin the fix: the
 * missing-store case must throw a classifiable error and surface as
 * code:'STORE_NOT_FOUND' via the fatal envelope, mirroring the
 * STORE_LOCKED fix in core/store/lock-error.ts.
 *
 * AC1: GIVEN graph.db absent + requireExisting=true WHEN openStoreOrFail
 *      runs THEN it throws a classifiable error (no direct process.exit).
 * AC2: GIVEN that error WHEN buildFatalEnvelope receives it THEN the
 *      envelope has code=STORE_NOT_FOUND.
 * AC3: GIVEN an unrelated error WHEN classified THEN it is NOT flagged as
 *      STORE_NOT_FOUND (no false positive).
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isStoreNotFoundError, StoreNotFoundError, STORE_NOT_FOUND_CODE } from '../core/store/store-not-found-error.js'
import { buildFatalEnvelope } from '../cli/fatal.js'
import { openStoreOrFail } from '../cli/open-store.js'

describe('isStoreNotFoundError — classifies the missing-store error', () => {
  it('returns true for a StoreNotFoundError instance', () => {
    expect(isStoreNotFoundError(new StoreNotFoundError('no project here'))).toBe(true)
  })

  it('returns false for an unrelated error', () => {
    expect(isStoreNotFoundError(new Error('boom'))).toBe(false)
  })

  it('returns false for a plain non-error value', () => {
    expect(isStoreNotFoundError('nope')).toBe(false)
    expect(isStoreNotFoundError(undefined)).toBe(false)
  })
})

describe('buildFatalEnvelope — a missing store surfaces as STORE_NOT_FOUND, not UNCAUGHT', () => {
  it('maps a StoreNotFoundError to code STORE_NOT_FOUND', () => {
    const env = buildFatalEnvelope(new StoreNotFoundError('No agent-graph-flow project at /tmp/x'))
    expect(env.ok).toBe(false)
    expect(env.code).toBe(STORE_NOT_FOUND_CODE)
  })

  it('leaves an unrelated error as UNCAUGHT (no false positive)', () => {
    const env = buildFatalEnvelope(new Error('boom'))
    expect(env.code).toBe('UNCAUGHT')
  })
})

describe('AC1: openStoreOrFail throws instead of exiting when the store is missing', () => {
  it('throws a StoreNotFoundError for a dir with no workflow-graph/graph.db', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-store-missing-'))
    try {
      expect(() => openStoreOrFail(dir, { requireExisting: true })).toThrow(StoreNotFoundError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the thrown error round-trips through buildFatalEnvelope as STORE_NOT_FOUND', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-store-missing-'))
    try {
      let caught: unknown
      try {
        openStoreOrFail(dir, { requireExisting: true })
      } catch (err) {
        caught = err
      }
      expect(isStoreNotFoundError(caught)).toBe(true)
      expect(buildFatalEnvelope(caught).code).toBe(STORE_NOT_FOUND_CODE)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
