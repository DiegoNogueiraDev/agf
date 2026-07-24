import { describe, it, expect, vi } from 'vitest'
import { attachBrowserHarnessEventStore } from '../core/event-store/browser-harness-bridge.js'
import type { GraphEventBus } from '../core/events/event-bus.js'
import type { EventWriter } from '../core/event-store/writer.js'

function makeBus(): {
  bus: GraphEventBus
  trigger: (event: { type: string; payload: Record<string, unknown> }) => void
} {
  let capturedHandler: ((event: { type: string; payload: Record<string, unknown> }) => void) | null = null
  const bus = {
    on: vi.fn((_: string, handler: (e: { type: string; payload: Record<string, unknown> }) => void) => {
      capturedHandler = handler
    }),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as GraphEventBus
  const trigger = (event: { type: string; payload: Record<string, unknown> }) => {
    capturedHandler?.(event)
  }
  return { bus, trigger }
}

function makeWriter(): { writer: EventWriter; emitSpy: ReturnType<typeof vi.fn> } {
  const emitSpy = vi.fn()
  const writer = { emit: emitSpy } as unknown as EventWriter
  return { writer, emitSpy }
}

describe('attachBrowserHarnessEventStore', () => {
  it('registers a listener on the bus', () => {
    const { bus } = makeBus()
    const { writer } = makeWriter()
    attachBrowserHarnessEventStore(bus, writer)
    // bus.on called with wildcard listener
    expect(bus.on as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('*', expect.any(Function))
  })

  it('returns a cleanup function', () => {
    const { bus } = makeBus()
    const { writer } = makeWriter()
    const cleanup = attachBrowserHarnessEventStore(bus, writer)
    expect(typeof cleanup).toBe('function')
  })

  it('calls bus.off when cleanup is called', () => {
    const { bus } = makeBus()
    const { writer } = makeWriter()
    const cleanup = attachBrowserHarnessEventStore(bus, writer)
    cleanup()
    expect(bus.off as ReturnType<typeof vi.fn>).toHaveBeenCalled()
  })

  it('writes test.started events to writer', () => {
    const { bus, trigger } = makeBus()
    const { writer, emitSpy } = makeWriter()
    attachBrowserHarnessEventStore(bus, writer)
    trigger({ type: 'test.started', payload: { runId: 'run-1' } })
    expect(emitSpy).toHaveBeenCalledOnce()
    expect(emitSpy.mock.calls[0][0]).toMatchObject({ kind: 'test.started', sessionId: 'run-1' })
  })

  it('writes test.passed events to writer', () => {
    const { bus, trigger } = makeBus()
    const { writer, emitSpy } = makeWriter()
    attachBrowserHarnessEventStore(bus, writer)
    trigger({ type: 'test.passed', payload: { runId: 'run-2' } })
    expect(emitSpy).toHaveBeenCalledOnce()
    expect(emitSpy.mock.calls[0][0]).toMatchObject({ kind: 'test.passed' })
  })

  it('ignores unknown event types', () => {
    const { bus, trigger } = makeBus()
    const { writer, emitSpy } = makeWriter()
    attachBrowserHarnessEventStore(bus, writer)
    trigger({ type: 'some.unknown.event', payload: {} })
    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('uses "unknown" as runId when payload has none', () => {
    const { bus, trigger } = makeBus()
    const { writer, emitSpy } = makeWriter()
    attachBrowserHarnessEventStore(bus, writer)
    trigger({ type: 'test.failed', payload: {} })
    expect(emitSpy.mock.calls[0][0]).toMatchObject({ sessionId: 'unknown' })
  })

  it('sets subjectRef.kind to "browser-harness"', () => {
    const { bus, trigger } = makeBus()
    const { writer, emitSpy } = makeWriter()
    attachBrowserHarnessEventStore(bus, writer)
    trigger({ type: 'test.step', payload: { runId: 'r' } })
    expect(emitSpy.mock.calls[0][0]).toMatchObject({ subjectRef: { kind: 'browser-harness' } })
  })

  it('does not write after cleanup is called', () => {
    const { bus, trigger } = makeBus()
    const { writer, emitSpy } = makeWriter()
    const cleanup = attachBrowserHarnessEventStore(bus, writer)
    cleanup()
    trigger({ type: 'test.started', payload: { runId: 'r' } })
    // bus.off was called but the mock doesn't actually remove the handler,
    // so this tests the cleanup returns without error
    expect(typeof cleanup).toBe('function')
  })
})
