/*!
 * Tests for two injectable integration adapters.
 *
 * integrations/sentrux-adapter.ts:
 *   detectSentrux(exec?) — runs `sentrux --version` via injectable exec.
 *   Returns {available: true, version} on success, {available: false, hint}
 *   on any failure. Never throws.
 *
 * integrations/serena-health.ts:
 *   checkSerenaHealth(baseUrl?) — probes baseUrl/health via fetch.
 *   Returns {connected: false} on any error. Never throws.
 *   DEFAULT_SERENA_URL from env or 'http://localhost:4568'.
 *
 * Tests use vi.fn() for exec injection and vi.spyOn(globalThis, 'fetch')
 * for fetch interception — no real processes or network required.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { detectSentrux } from '../core/integrations/sentrux-adapter.js'
import { checkSerenaHealth, DEFAULT_SERENA_URL } from '../core/integrations/serena-health.js'

afterEach(() => {
  vi.restoreAllMocks()
})

// ── detectSentrux ─────────────────────────────────────────────────────────────

describe('detectSentrux — available', () => {
  it('returns available=true when exec resolves with version string', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'v1.2.3' })
    const result = await detectSentrux(exec)
    expect(result.available).toBe(true)
  })

  it('returns the trimmed stdout as version', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '  2.0.0\n' })
    const result = await detectSentrux(exec)
    if (!result.available) throw new Error('expected available')
    expect(result.version).toBe('2.0.0')
  })

  it('calls exec with "sentrux" and ["--version"]', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'v0.1.0' })
    await detectSentrux(exec)
    expect(exec).toHaveBeenCalledWith('sentrux', ['--version'])
  })

  it('available:true result has no hint property', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'v1.0.0' })
    const result = await detectSentrux(exec)
    expect('hint' in result).toBe(false)
  })
})

describe('detectSentrux — unavailable', () => {
  it('returns available=false when exec rejects', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('command not found'))
    const result = await detectSentrux(exec)
    expect(result.available).toBe(false)
  })

  it('hint contains "sentrux" when unavailable', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('not found'))
    const result = await detectSentrux(exec)
    if (result.available) throw new Error('expected unavailable')
    expect(result.hint.toLowerCase()).toContain('sentrux')
  })

  it('hint contains "install" when unavailable', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('not found'))
    const result = await detectSentrux(exec)
    if (result.available) throw new Error('expected unavailable')
    expect(result.hint.toLowerCase()).toContain('install')
  })

  it('never throws even when exec throws', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('permission denied'))
    await expect(detectSentrux(exec)).resolves.not.toThrow()
  })

  it('available:false result has no version property', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('not found'))
    const result = await detectSentrux(exec)
    expect('version' in result).toBe(false)
  })
})

// ── checkSerenaHealth ─────────────────────────────────────────────────────────

describe('checkSerenaHealth — DEFAULT_SERENA_URL', () => {
  it('is a string starting with http', () => {
    expect(typeof DEFAULT_SERENA_URL).toBe('string')
    expect(DEFAULT_SERENA_URL.startsWith('http')).toBe(true)
  })
})

describe('checkSerenaHealth — fetch failure', () => {
  it('returns connected=false when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await checkSerenaHealth('http://127.0.0.1:59872')
    expect(result.connected).toBe(false)
  })

  it('never throws on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))
    await expect(checkSerenaHealth('http://127.0.0.1:59872')).resolves.not.toThrow()
  })

  it('returns connected=false when response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as unknown as Response)
    const result = await checkSerenaHealth('http://127.0.0.1:59872')
    expect(result.connected).toBe(false)
  })
})

describe('checkSerenaHealth — fetch success', () => {
  it('returns connected=true when response is ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ version: '2.0.0', tools: ['search', 'list'] }),
    } as unknown as Response)
    const result = await checkSerenaHealth('http://127.0.0.1:4568')
    expect(result.connected).toBe(true)
  })

  it('extracts version from response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ version: '3.1.0' }),
    } as unknown as Response)
    const result = await checkSerenaHealth('http://127.0.0.1:4568')
    if (!result.connected) throw new Error('expected connected')
    expect(result.version).toBe('3.1.0')
  })

  it('extracts tools array from response body (tools key)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.0', tools: ['search', 'list', 'update'] }),
    } as unknown as Response)
    const result = await checkSerenaHealth('http://127.0.0.1:4568')
    if (!result.connected) throw new Error('expected connected')
    expect(result.exposedTools).toEqual(['search', 'list', 'update'])
  })

  it('extracts tools from exposedTools key as fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.0', exposedTools: ['tool-a', 'tool-b'] }),
    } as unknown as Response)
    const result = await checkSerenaHealth('http://127.0.0.1:4568')
    if (!result.connected) throw new Error('expected connected')
    expect(result.exposedTools).toEqual(['tool-a', 'tool-b'])
  })

  it('returns empty exposedTools when tools field is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.0' }),
    } as unknown as Response)
    const result = await checkSerenaHealth('http://127.0.0.1:4568')
    if (!result.connected) throw new Error('expected connected')
    expect(result.exposedTools).toEqual([])
  })
})
