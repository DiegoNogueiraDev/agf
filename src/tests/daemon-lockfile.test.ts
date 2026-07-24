import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkLock, acquireLock, releaseLock } from '../core/daemon/daemon-lockfile.js'

describe('checkLock', () => {
  let tmpDir: string
  let pidFile: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lockfile-test-'))
    pidFile = join(tmpDir, 'daemon.pid')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns alive=false when pidfile does not exist', () => {
    const state = checkLock(pidFile)
    expect(state.alive).toBe(false)
    expect(state.pid).toBeUndefined()
  })

  it('returns alive=false and stale=true for invalid pid content', () => {
    writeFileSync(pidFile, 'not-a-number')
    const state = checkLock(pidFile)
    expect(state.alive).toBe(false)
    expect(state.stale).toBe(true)
  })

  it('returns alive=false and stale=true for dead pid', () => {
    writeFileSync(pidFile, '99999999')
    const state = checkLock(pidFile)
    expect(state.alive).toBe(false)
    expect(state.stale).toBe(true)
  })

  it('returns alive=true for current process pid', () => {
    writeFileSync(pidFile, String(process.pid))
    const state = checkLock(pidFile)
    expect(state.alive).toBe(true)
    expect(state.pid).toBe(process.pid)
  })

  it('returns pid number when file has valid content', () => {
    writeFileSync(pidFile, String(process.pid))
    const state = checkLock(pidFile)
    expect(typeof state.pid).toBe('number')
  })
})

describe('acquireLock + releaseLock', () => {
  let tmpDir: string
  let pidFile: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'acquire-lock-test-'))
    pidFile = join(tmpDir, 'daemon.pid')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('acquires lock when pidfile is absent', () => {
    expect(() => acquireLock(pidFile)).not.toThrow()
    const state = checkLock(pidFile)
    expect(state.alive).toBe(true)
    expect(state.pid).toBe(process.pid)
  })

  it('throws if another live process holds the lock', () => {
    writeFileSync(pidFile, String(process.pid))
    expect(() => acquireLock(pidFile)).toThrow()
  })

  it('reclaims stale pidfile', () => {
    writeFileSync(pidFile, '99999999')
    expect(() => acquireLock(pidFile)).not.toThrow()
  })

  it('releaseLock removes pidfile', () => {
    acquireLock(pidFile)
    releaseLock(pidFile)
    const state = checkLock(pidFile)
    expect(state.alive).toBe(false)
  })

  it('releaseLock does not throw when file does not exist', () => {
    expect(() => releaseLock(join(tmpDir, 'nonexistent.pid'))).not.toThrow()
  })
})
