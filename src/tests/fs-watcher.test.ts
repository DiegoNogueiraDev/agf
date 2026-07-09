/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.2 AC coverage: fs-watcher.ts
 *
 * AC1: arquivo modificado → evento 'tool:post-call' emitido exatamente uma vez (debounced)
 * AC2: basePath ausente ou watch() lança → no-op retornado, sem crash
 * AC3: cleanup do watcher → nenhum evento emitido depois (sem listener leak)
 * Coverage: fs-watcher.ts ≥ 90% branch coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, statSync, watch } from 'node:fs'
import { installFsWatcher } from '../core/hooks/fs-watcher.js'
import { getSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import * as hardening from '../core/hooks/fs-watcher-hardening.js'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  watch: vi.fn(),
}))

vi.mock('../core/hooks/shared-hook-bus.js', () => ({
  getSharedHookBus: vi.fn(),
}))

vi.mock('../core/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  })),
}))

// ── Test state ─────────────────────────────────────────────────────────────────

type WatchCb = (event: string, filename: string | null) => void

const BASEPATH = '/test-project'
const mockWatcher = { close: vi.fn() }
let capturedCb: WatchCb | null = null
let hookBusEmit: ReturnType<typeof vi.fn>

function setupWatcher(extraOpts: Partial<Parameters<typeof installFsWatcher>[0]> = {}) {
  return installFsWatcher({ basePath: BASEPATH, debounceMs: 10, ...extraOpts })
}

function fire(event: string, filename: string | null, advance = 20): void {
  if (!capturedCb) throw new Error('Watch callback not captured — watcher may not be installed')
  capturedCb(event, filename)
  vi.advanceTimersByTime(advance)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  capturedCb = null
  mockWatcher.close.mockReset()

  vi.mocked(existsSync).mockReturnValue(true)
  vi.mocked(statSync).mockReturnValue({
    isFile: () => true,
    birthtimeMs: 1000,
  } as ReturnType<typeof statSync>)
  ;(vi.mocked(watch) as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_p: unknown, _opts: unknown, cb: WatchCb) => {
      capturedCb = cb
      return mockWatcher
    },
  )

  hookBusEmit = vi.fn().mockResolvedValue(undefined)
  vi.mocked(getSharedHookBus).mockReturnValue({ emit: hookBusEmit } as ReturnType<typeof getSharedHookBus>)
})

afterEach(() => {
  vi.useRealTimers()
})

// ── AC2: basePath missing → no-op ─────────────────────────────────────────────

describe('AC2: basePath missing → returns no-op, no crash', () => {
  it('returns a no-op cleanup when basePath does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const cleanup = installFsWatcher({ basePath: '/nonexistent', debounceMs: 10 })
    expect(() => cleanup()).not.toThrow()
    expect(vi.mocked(watch)).not.toHaveBeenCalled()
  })

  it('no events emitted when basePath is missing', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const cleanup = installFsWatcher({ basePath: '/nonexistent', debounceMs: 10 })
    vi.advanceTimersByTime(500)
    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })
})

// ── AC2: watch() throws → no-op ───────────────────────────────────────────────

describe('AC2: watch() throws → returns no-op, no crash', () => {
  it('returns a no-op cleanup when watch() throws', () => {
    ;(vi.mocked(watch) as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })
    const cleanup = installFsWatcher({ basePath: BASEPATH, debounceMs: 10 })
    expect(() => cleanup()).not.toThrow()
  })

  it('no events emitted when watch() throws', () => {
    ;(vi.mocked(watch) as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('ENOENT')
    })
    installFsWatcher({ basePath: BASEPATH, debounceMs: 10 })
    vi.advanceTimersByTime(500)
    expect(hookBusEmit).not.toHaveBeenCalled()
  })
})

// ── AC1: file modified → tool:post-call emitted exactly once ──────────────────

describe('AC1: file modified → tool:post-call emitted exactly once (debounced)', () => {
  it('emits tool:post-call after debounce fires (AC1)', () => {
    const cleanup = setupWatcher()
    fire('change', 'src/app.ts')

    expect(hookBusEmit).toHaveBeenCalledOnce()
    expect(hookBusEmit.mock.calls[0][0]).toMatchObject({
      channel: 'tool:post-call',
      payload: {
        toolName: 'Edit',
        filePath: 'src/app.ts',
        agentSource: 'unknown',
        _fromFsWatcher: true,
      },
    })
    cleanup()
  })

  it('does NOT emit before debounce window closes', () => {
    const cleanup = setupWatcher()
    capturedCb!('change', 'src/app.ts')
    vi.advanceTimersByTime(5) // less than debounceMs=10
    expect(hookBusEmit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10)
    expect(hookBusEmit).toHaveBeenCalledOnce()
    cleanup()
  })

  it('multiple rapid events for same file → coalesced to one emit', () => {
    const cleanup = setupWatcher()
    capturedCb!('change', 'src/foo.ts')
    capturedCb!('change', 'src/foo.ts')
    capturedCb!('change', 'src/foo.ts')
    vi.advanceTimersByTime(20)
    expect(hookBusEmit).toHaveBeenCalledOnce()
    cleanup()
  })

  it('events for different files each produce one emit', () => {
    const cleanup = setupWatcher()
    capturedCb!('change', 'src/a.ts')
    capturedCb!('change', 'src/b.ts')
    vi.advanceTimersByTime(20)
    expect(hookBusEmit).toHaveBeenCalledTimes(2)
    cleanup()
  })

  it('same file with different eventType → two separate debounce keys → two emits', () => {
    const cleanup = setupWatcher()
    capturedCb!('change', 'src/a.ts')
    capturedCb!('rename', 'src/a.ts')
    vi.advanceTimersByTime(20)
    expect(hookBusEmit).toHaveBeenCalledTimes(2)
    cleanup()
  })
})

// ── AC3: cleanup cancels pending events ───────────────────────────────────────

describe('AC3: watcher destroyed → no events after cleanup', () => {
  it('cancels pending debounce timer on cleanup (AC3)', () => {
    const cleanup = setupWatcher()
    capturedCb!('change', 'src/app.ts')
    cleanup() // destroy BEFORE debounce fires
    vi.advanceTimersByTime(50)
    expect(hookBusEmit).not.toHaveBeenCalled()
  })

  it('closes the underlying FSWatcher on cleanup (AC3)', () => {
    const cleanup = setupWatcher()
    cleanup()
    expect(mockWatcher.close).toHaveBeenCalledOnce()
  })

  it('calling cleanup twice does not throw', () => {
    const cleanup = setupWatcher()
    expect(() => {
      cleanup()
      cleanup()
    }).not.toThrow()
  })
})

// ── Ignore patterns ────────────────────────────────────────────────────────────

describe('ignorePatterns: default OS/build noise is filtered', () => {
  it('ignores node_modules by default', () => {
    const cleanup = setupWatcher()
    fire('change', 'node_modules/lodash/index.js')
    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })

  it('ignores .git by default', () => {
    const cleanup = setupWatcher()
    fire('change', '.git/HEAD')
    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })

  it('ignores dist by default', () => {
    const cleanup = setupWatcher()
    fire('change', 'dist/bundle.js')
    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })

  it('ignores .tsbuildinfo files by default', () => {
    const cleanup = setupWatcher()
    fire('change', 'tsconfig.tsbuildinfo')
    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })

  it('ignores .log files by default', () => {
    const cleanup = setupWatcher()
    fire('change', 'debug.log')
    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })

  it('does NOT ignore regular source files', () => {
    const cleanup = setupWatcher()
    fire('change', 'src/index.ts')
    expect(hookBusEmit).toHaveBeenCalledOnce()
    cleanup()
  })

  it('custom ignorePatterns are merged with defaults', () => {
    const cleanup = setupWatcher({ ignorePatterns: [/\.test\.ts$/] })
    fire('change', 'src/app.test.ts')
    expect(hookBusEmit).not.toHaveBeenCalled()
    fire('change', 'src/app.ts')
    expect(hookBusEmit).toHaveBeenCalledOnce()
    cleanup()
  })
})

// ── Hardening delegation (node_wire_7dbe60747c69) ─────────────────────────────
// fs-watcher-hardening.ts shipped shouldIgnorePath/DEFAULT_IGNORE_PATTERNS to
// harden this watcher but was never imported (harness --dormant: no-surface).
// installFsWatcher must delegate to it instead of a duplicated inline check.

describe('hardening delegation: ignore-check routes through fs-watcher-hardening.ts', () => {
  it('calls shouldIgnorePath (not a duplicated inline regex check) to filter paths', () => {
    const spy = vi.spyOn(hardening, 'shouldIgnorePath')
    const cleanup = setupWatcher()
    fire('change', 'node_modules/lodash/index.js')

    expect(spy).toHaveBeenCalled()
    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })

  it('uses DEFAULT_IGNORE_PATTERNS from fs-watcher-hardening.ts as the base ignore list', () => {
    const cleanup = setupWatcher()
    for (const sample of ['node_modules/x.js', '.git/HEAD', 'dist/y.js', 'z.tsbuildinfo', 'a.log']) {
      expect(hardening.shouldIgnorePath(sample, hardening.DEFAULT_IGNORE_PATTERNS)).toBe(true)
    }
    cleanup()
  })
})

// ── Null filename ──────────────────────────────────────────────────────────────

describe('null filename edge case', () => {
  it('null filename is ignored without crash or emit', () => {
    const cleanup = setupWatcher()
    capturedCb!('change', null)
    vi.advanceTimersByTime(20)
    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })
})

// ── dispatchChange: toolName detection ────────────────────────────────────────

describe('dispatchChange: toolName detection branches', () => {
  it('Delete when file does not exist after event fires', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => (p as string) === BASEPATH)
    const cleanup = setupWatcher()
    fire('change', 'src/deleted.ts')

    expect(hookBusEmit).toHaveBeenCalledOnce()
    expect(hookBusEmit.mock.calls[0][0].payload.toolName).toBe('Delete')
    cleanup()
  })

  it('Edit for an old file (birthtimeMs far in the past)', () => {
    vi.mocked(statSync).mockReturnValue({
      isFile: () => true,
      birthtimeMs: 1000,
    } as ReturnType<typeof statSync>)
    const cleanup = setupWatcher()
    fire('change', 'src/app.ts')

    expect(hookBusEmit.mock.calls[0][0].payload.toolName).toBe('Edit')
    cleanup()
  })

  it('Write for a newly created file (birthtimeMs recent)', () => {
    const fakeNow = Date.now()
    vi.mocked(statSync).mockReturnValue({
      isFile: () => true,
      birthtimeMs: fakeNow,
    } as ReturnType<typeof statSync>)
    const cleanup = setupWatcher()
    fire('change', 'src/new-file.ts')

    // After 10ms debounce, age = ~10ms < 500ms → Write
    expect(hookBusEmit.mock.calls[0][0].payload.toolName).toBe('Write')
    cleanup()
  })

  it('skips directories (stat.isFile() = false) → no emit', () => {
    vi.mocked(statSync).mockReturnValue({
      isFile: () => false,
      birthtimeMs: 1000,
    } as ReturnType<typeof statSync>)
    const cleanup = setupWatcher()
    fire('change', 'src/some-dir')

    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })

  it('skips gracefully when statSync throws (race condition) → no emit', () => {
    vi.mocked(statSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })
    const cleanup = setupWatcher()
    fire('change', 'src/gone.ts')

    expect(hookBusEmit).not.toHaveBeenCalled()
    cleanup()
  })
})

// ── Dedup store ────────────────────────────────────────────────────────────────

describe('dedup store: shouldEmit gate', () => {
  it('suppresses emit when dedupStore.shouldEmit returns false', () => {
    const dedupStore = { shouldEmit: vi.fn().mockReturnValue(false) }
    const cleanup = setupWatcher({ dedupStore } as Parameters<typeof installFsWatcher>[0])
    fire('change', 'src/app.ts')

    expect(hookBusEmit).not.toHaveBeenCalled()
    expect(dedupStore.shouldEmit).toHaveBeenCalledOnce()
    cleanup()
  })

  it('allows emit when dedupStore.shouldEmit returns true', () => {
    const dedupStore = { shouldEmit: vi.fn().mockReturnValue(true) }
    const cleanup = setupWatcher({ dedupStore } as Parameters<typeof installFsWatcher>[0])
    fire('change', 'src/app.ts')

    expect(hookBusEmit).toHaveBeenCalledOnce()
    cleanup()
  })

  it('emits without restriction when no dedupStore provided', () => {
    const cleanup = setupWatcher()
    fire('change', 'src/app.ts')
    expect(hookBusEmit).toHaveBeenCalledOnce()
    cleanup()
  })

  it('dedupKey format is agentSource:filePath:toolName', () => {
    const dedupStore = { shouldEmit: vi.fn().mockReturnValue(true) }
    const inferAgentSource = vi
      .fn()
      .mockReturnValue(
        'cursor' as Parameters<typeof installFsWatcher>[0]['inferAgentSource'] extends (p: string) => infer R
          ? R
          : never,
      )
    const cleanup = setupWatcher({
      dedupStore,
      inferAgentSource,
    } as Parameters<typeof installFsWatcher>[0])
    fire('change', 'src/app.ts')

    expect(dedupStore.shouldEmit).toHaveBeenCalledWith('cursor:src/app.ts:Edit')
    cleanup()
  })
})

// ── inferAgentSource ──────────────────────────────────────────────────────────

describe('inferAgentSource: agent resolution', () => {
  it('defaults to "unknown" when inferAgentSource is not provided', () => {
    const cleanup = setupWatcher()
    fire('change', 'src/app.ts')
    expect(hookBusEmit.mock.calls[0][0].payload.agentSource).toBe('unknown')
    cleanup()
  })

  it('calls custom inferAgentSource with the relative filePath', () => {
    const inferAgentSource = vi
      .fn()
      .mockReturnValue(
        'cursor' as Parameters<typeof installFsWatcher>[0]['inferAgentSource'] extends (p: string) => infer R
          ? R
          : never,
      )
    const cleanup = setupWatcher({ inferAgentSource } as Parameters<typeof installFsWatcher>[0])
    fire('change', 'src/app.ts')

    expect(inferAgentSource).toHaveBeenCalledWith('src/app.ts')
    expect(hookBusEmit.mock.calls[0][0].payload.agentSource).toBe('cursor')
    cleanup()
  })
})

// ── Emitted event shape ────────────────────────────────────────────────────────

describe('emitted event structure', () => {
  it('event has channel, timestamp, and payload with _fromFsWatcher=true', () => {
    const cleanup = setupWatcher()
    fire('change', 'src/app.ts')

    const event = hookBusEmit.mock.calls[0][0]
    expect(event).toHaveProperty('channel', 'tool:post-call')
    expect(event).toHaveProperty('timestamp')
    expect(event.payload).toHaveProperty('toolName')
    expect(event.payload).toHaveProperty('filePath')
    expect(event.payload).toHaveProperty('agentSource')
    expect(event.payload).toHaveProperty('_fromFsWatcher', true)
    cleanup()
  })

  it('filePath in payload is relative to basePath', () => {
    const cleanup = setupWatcher()
    fire('change', 'src/deep/path/file.ts')

    expect(hookBusEmit.mock.calls[0][0].payload.filePath).toBe('src/deep/path/file.ts')
    cleanup()
  })
})
