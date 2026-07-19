/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { createDirectMcpProvider, type DirectMcpProvider } from '../core/cli-provider/direct-mcp-provider.js'

describe('createDirectMcpProvider', () => {
  it('returns a provider with mcp-graph id', () => {
    const provider = createDirectMcpProvider()
    expect(provider.id).toBe('mcp-graph')
  })

  it('returns a provider with label DirectMCP', () => {
    const provider = createDirectMcpProvider()
    expect(provider.label).toBe('DirectMCP')
  })

  it('returns a provider that is initially disconnected', () => {
    const provider = createDirectMcpProvider()
    const status = provider.status()
    expect(status.connected).toBe(false)
    expect(status.storeReady).toBe(false)
  })

  it('status includes version info', () => {
    const provider = createDirectMcpProvider()
    const status = provider.status()
    expect(status.version).toBeDefined()
    expect(typeof status.version).toBe('string')
  })

  it('status includes uptime as number', () => {
    const provider = createDirectMcpProvider()
    const status = provider.status()
    expect(typeof status.uptimeMs).toBe('number')
    expect(status.uptimeMs).toBeGreaterThanOrEqual(0)
  })
})

describe('DirectMcpProvider interface', () => {
  it('provider has start method', () => {
    const provider = createDirectMcpProvider()
    expect(typeof provider.start).toBe('function')
  })

  it('provider has stop method', () => {
    const provider = createDirectMcpProvider()
    expect(typeof provider.stop).toBe('function')
  })

  it('provider has status method', () => {
    const provider = createDirectMcpProvider()
    expect(typeof provider.status).toBe('function')
  })

  it('start returns status object', async () => {
    const provider = createDirectMcpProvider()
    const status = await provider.start({ simulate: true })
    expect(status).toBeDefined()
    expect(typeof status.connected).toBe('boolean')
  })
})

describe('DirectMcpProvider in simulate mode', () => {
  it('simulate mode connects without real DB', async () => {
    const provider = createDirectMcpProvider()
    const status = await provider.start({ simulate: true })
    expect(status.connected).toBe(true)
    expect(status.storeReady).toBe(true)
    expect(status.nodeCount).toBe(0)
  })

  it('after simulate start, status shows connected', async () => {
    const provider = createDirectMcpProvider()
    await provider.start({ simulate: true })
    const status = provider.status()
    expect(status.connected).toBe(true)
  })

  it('after stop, status shows disconnected', async () => {
    const provider = createDirectMcpProvider()
    await provider.start({ simulate: true })
    await provider.stop()
    const status = provider.status()
    expect(status.connected).toBe(false)
    expect(status.storeReady).toBe(false)
  })

  it('uptime is 0 before start and after stop', async () => {
    const provider = createDirectMcpProvider()
    expect(provider.status().uptimeMs).toBe(0)
    await provider.start({ simulate: true })
    expect(provider.status().uptimeMs).toBeGreaterThanOrEqual(0)
    await provider.stop()
    expect(provider.status().uptimeMs).toBe(0)
  })
})
