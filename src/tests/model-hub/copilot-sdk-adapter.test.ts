/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.1 AC coverage: copilot-sdk-adapter generate, auth errors, cleanup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CopilotSdkAdapter, ModelAdapterError } from '../../core/model-hub/copilot-sdk-adapter.js'
import type { ModelRequest } from '../../core/model-hub/model-client.js'

// ── Hoisted mock handles (must be defined before vi.mock hoisting) ────────────

const MockCopilotClient = vi.hoisted(() => vi.fn())

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: MockCopilotClient,
  approveAll: null,
}))

// ── Per-test mock instances (plain functions, not arrow) ──────────────────────

let mockSend: ReturnType<typeof vi.fn>
let mockDisconnect: ReturnType<typeof vi.fn>
let mockStop: ReturnType<typeof vi.fn>
let mockStart: ReturnType<typeof vi.fn>
let mockCreateSession: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockSend = vi.fn().mockResolvedValue('Hello from Copilot')
  mockDisconnect = vi.fn().mockResolvedValue(undefined)
  mockStop = vi.fn().mockResolvedValue(undefined)
  mockStart = vi.fn().mockResolvedValue(undefined)
  mockCreateSession = vi.fn().mockResolvedValue({ send: mockSend, disconnect: mockDisconnect })

  // Use regular function (not arrow) for constructor compatibility
  MockCopilotClient.mockImplementation(function () {
    return { start: mockStart, stop: mockStop, createSession: mockCreateSession }
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function req(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return { model: 'gpt-4o', prompt: 'What is 2+2?', ...overrides }
}

// ── AC1: valid token (mock) → returns ModelResponse ───────────────────────────

describe('AC1: valid SDK mock → generate returns text response', () => {
  it('returns text from session.send()', async () => {
    const adapter = new CopilotSdkAdapter()
    const result = await adapter.generate(req())
    expect(result.text).toBe('Hello from Copilot')
    expect(result.model).toBe('gpt-4o')
  })

  it('concatenates system prompt when provided', async () => {
    const adapter = new CopilotSdkAdapter()
    await adapter.generate(req({ system: 'You are a helper', prompt: 'hi' }))
    expect(mockSend).toHaveBeenCalledWith('You are a helper\n\nhi')
  })

  it('passes plain prompt when no system prompt', async () => {
    const adapter = new CopilotSdkAdapter()
    await adapter.generate(req({ prompt: 'standalone' }))
    expect(mockSend).toHaveBeenCalledWith('standalone')
  })

  it('applies modelIdMap to remap model id', async () => {
    const adapter = new CopilotSdkAdapter({ modelIdMap: { 'gpt-4o': 'gpt-4o-ms' } })
    await adapter.generate(req({ model: 'gpt-4o' }))
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o-ms' }))
  })

  it('uses original model id when no mapping defined', async () => {
    const adapter = new CopilotSdkAdapter({})
    await adapter.generate(req({ model: 'claude-3' }))
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-3' }))
  })
})

// ── AC2: auth failure → ModelAdapterError ────────────────────────────────────

describe('AC2: auth failure — client.start() throws → ModelAdapterError', () => {
  it('throws ModelAdapterError when client.start() fails', async () => {
    mockStart.mockRejectedValueOnce(new Error('401 Unauthorized'))
    const adapter = new CopilotSdkAdapter()
    await expect(adapter.generate(req())).rejects.toBeInstanceOf(ModelAdapterError)
  })

  it('error message includes original failure reason', async () => {
    mockStart.mockRejectedValueOnce(new Error('Bad credentials'))
    const adapter = new CopilotSdkAdapter()
    const err = await adapter.generate(req()).catch((e) => e as ModelAdapterError)
    expect(err.message).toMatch(/Bad credentials/)
  })

  it('does NOT call stop() when start() fails — outer finally only wraps createSession', async () => {
    mockStart.mockRejectedValueOnce(new Error('auth failed'))
    const adapter = new CopilotSdkAdapter()
    await adapter.generate(req()).catch(() => {})
    expect(mockStop).not.toHaveBeenCalled()
  })
})

// ── AC3: session cleanup on error ─────────────────────────────────────────────

describe('AC3: session errors — finally blocks always clean up', () => {
  it('calls disconnect when session.send() throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('network timeout'))
    const adapter = new CopilotSdkAdapter()
    await adapter.generate(req()).catch(() => {})
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it('calls stop when session.send() throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('network timeout'))
    const adapter = new CopilotSdkAdapter()
    await adapter.generate(req()).catch(() => {})
    expect(mockStop).toHaveBeenCalledTimes(1)
  })

  it('propagates error after cleanup', async () => {
    mockSend.mockRejectedValueOnce(new Error('fatal'))
    const adapter = new CopilotSdkAdapter()
    await expect(adapter.generate(req())).rejects.toThrow('fatal')
  })
})

// ── AC4: ModelAdapterError metadata ───────────────────────────────────────────

describe('AC4: ModelAdapterError — status and retryAfterMs fields', () => {
  it('stores HTTP status code', () => {
    const err = new ModelAdapterError('rate limited', { status: 429 })
    expect(err.status).toBe(429)
  })

  it('stores retryAfterMs', () => {
    const err = new ModelAdapterError('rate limited', { status: 429, retryAfterMs: 30_000 })
    expect(err.retryAfterMs).toBe(30_000)
  })

  it('has undefined status/retryAfterMs by default', () => {
    const err = new ModelAdapterError('generic')
    expect(err.status).toBeUndefined()
    expect(err.retryAfterMs).toBeUndefined()
  })

  it('inherits from McpGraphError', async () => {
    const { McpGraphError } = await import('../../core/utils/errors.js')
    const err = new ModelAdapterError('test')
    expect(err).toBeInstanceOf(McpGraphError)
    expect(err.name).toBe('ModelAdapterError')
  })
})
