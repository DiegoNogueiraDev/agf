import { describe, it, expect } from 'vitest'
import { FallbackResolver } from '../core/sandbox/fallback-resolver.js'

function makeResolver() {
  return new FallbackResolver()
}

describe('FallbackResolver.resolveExecutionMode', () => {
  it('chooses docker when docker is available', () => {
    const r = makeResolver()
    const result = r.resolveExecutionMode({ docker: true, podman: false, process: false })
    expect(result.executionMode).toBe('docker')
    expect(result.fallbackChain).toContain('docker')
  })

  it('falls back to podman when docker is unavailable', () => {
    const r = makeResolver()
    const result = r.resolveExecutionMode({ docker: false, podman: true, process: true })
    expect(result.executionMode).toBe('podman')
  })

  it('falls back to process when docker and podman are unavailable', () => {
    const r = makeResolver()
    const result = r.resolveExecutionMode({ docker: false, podman: false, process: true })
    expect(result.executionMode).toBe('process')
  })

  it('returns error mode when nothing is available', () => {
    const r = makeResolver()
    const result = r.resolveExecutionMode({ docker: false, podman: false, process: false })
    expect(result.executionMode).toBe('error')
  })

  it('includes a reason string', () => {
    const r = makeResolver()
    const result = r.resolveExecutionMode({ docker: true, podman: false, process: true })
    expect(typeof result.reason).toBe('string')
    expect(result.reason.length).toBeGreaterThan(0)
  })

  it('includes a timestamp string', () => {
    const r = makeResolver()
    const result = r.resolveExecutionMode({ docker: true, podman: false, process: true })
    expect(() => new Date(result.timestamp)).not.toThrow()
  })
})
