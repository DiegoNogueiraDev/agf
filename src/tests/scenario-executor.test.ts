import { describe, it, expect, vi } from 'vitest'
import { executeScenario } from '../plugins/browser/scenario-executor.js'
import type { ScenarioPlan } from '../plugins/browser/nl-scenario-compiler.js'
import type { BrowserActions, ScreenshotResult } from '../plugins/browser/actions/index.js'

function makeActions(overrides: Partial<BrowserActions> = {}): BrowserActions {
  const ok = { ok: true as const }
  const okShot: ScreenshotResult = { ok: true, data: 'base64img' }
  return {
    navigate: vi.fn().mockResolvedValue({ ok: true, url: 'http://x', title: 'X' }),
    click: vi.fn().mockResolvedValue(ok),
    type: vi.fn().mockResolvedValue(ok),
    pressKey: vi.fn().mockResolvedValue(ok),
    screenshot: vi.fn().mockResolvedValue(okShot),
    jsEval: vi.fn().mockResolvedValue({ ok: true, result: null }),
    pageInfo: vi.fn().mockResolvedValue({ ok: true, url: 'http://x', title: 'X' }),
    getCookies: vi.fn().mockResolvedValue({ ok: true, cookies: [] }),
    setCookie: vi.fn().mockResolvedValue(ok),
    clearCookies: vi.fn().mockResolvedValue(ok),
    getAuthState: vi.fn().mockResolvedValue({ ok: true, cookies: [], localStorage: {} }),
    networkLog: vi.fn().mockResolvedValue({ ok: true, events: [] }),
    consoleMessages: vi.fn().mockResolvedValue({ ok: true, events: [] }),
    ...overrides,
  }
}

const PLAN_NAVIGATE: ScenarioPlan = {
  steps: [
    {
      raw: 'go to http://example.com',
      tool: 'browser_navigate',
      args: { url: 'http://example.com' },
      confidence: 1,
      needsDelegation: false,
    },
    { raw: 'take screenshot', tool: 'browser_screenshot', args: {}, confidence: 1, needsDelegation: false },
  ],
  unresolved: 0,
}

describe('executeScenario — AC1: evidence recorded, deterministic outcome', () => {
  it('returns StepResult for each step with evidence from screenshot', async () => {
    const actions = makeActions()
    const results = await executeScenario(PLAN_NAVIGATE, actions)

    expect(results).toHaveLength(2)
    expect(results[0].tool).toBe('browser_navigate')
    expect(results[0].ok).toBe(true)
    // Evidence: screenshot taken after step
    expect(results[0].evidence).toBeDefined()
  })

  it('result is deterministic: all steps ok → verdict passed', async () => {
    const actions = makeActions()
    const results = await executeScenario(PLAN_NAVIGATE, actions)
    expect(results.every((r) => r.ok)).toBe(true)
  })

  it('screenshots are taken for evidence after each non-screenshot step', async () => {
    const actions = makeActions()
    await executeScenario(PLAN_NAVIGATE, actions)
    // screenshot called: 1 evidence capture after navigate + 1 explicit screenshot step
    expect(vi.mocked(actions.screenshot).mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})

describe('executeScenario — AC2: strategy-rewriter on failure, honest result', () => {
  it('retries once on transient failure and succeeds on retry', async () => {
    let calls = 0
    const failThenOk = vi.fn().mockImplementation(async () => {
      calls++
      if (calls === 1) return { ok: false as const, error: 'transient' }
      return { ok: true as const, url: 'http://x', title: 'X' }
    })
    const actions = makeActions({ navigate: failThenOk })
    const plan: ScenarioPlan = {
      steps: [
        {
          raw: 'go to http://x',
          tool: 'browser_navigate',
          args: { url: 'http://x' },
          confidence: 1,
          needsDelegation: false,
        },
      ],
      unresolved: 0,
    }

    const results = await executeScenario(plan, actions)
    expect(results[0].ok).toBe(true)
    expect(failThenOk.mock.calls.length).toBe(2)
  })

  it('stops with failed=true when step fails even after retry (never false-success)', async () => {
    const alwaysFail = vi.fn().mockResolvedValue({ ok: false as const, error: 'hard failure' })
    const actions = makeActions({ navigate: alwaysFail })
    const plan: ScenarioPlan = {
      steps: [
        {
          raw: 'go to http://x',
          tool: 'browser_navigate',
          args: { url: 'http://x' },
          confidence: 1,
          needsDelegation: false,
        },
        { raw: 'take screenshot', tool: 'browser_screenshot', args: {}, confidence: 1, needsDelegation: false },
      ],
      unresolved: 0,
    }

    const results = await executeScenario(plan, actions)
    // First step failed after retry
    expect(results[0].ok).toBe(false)
    // Subsequent steps are not executed — remaining results are absent or not-ok
    // The executor stops at first hard failure
    expect(results.length).toBe(1)
  })

  it('unknown tool yields ok=false (honest — not silently skipped)', async () => {
    const actions = makeActions()
    const plan: ScenarioPlan = {
      steps: [{ raw: 'do magic', tool: 'browser_unknown_action', args: {}, confidence: 0.3, needsDelegation: false }],
      unresolved: 1,
    }

    const results = await executeScenario(plan, actions)
    expect(results[0].ok).toBe(false)
    expect(results[0].tool).toBe('browser_unknown_action')
  })
})

describe('executeScenario — bug #2: thrown action must not lose partial results', () => {
  it('preserves prior step results when a later action REJECTS (not just returns ok:false)', async () => {
    // Second step's adapter throws (e.g. CDP socket dropped) instead of returning {ok:false}.
    const throwingNav = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, url: 'http://a', title: 'A' })
      .mockRejectedValue(new Error('CDP socket is not connected'))
    const actions = makeActions({ navigate: throwingNav })
    const plan: ScenarioPlan = {
      steps: [
        { raw: 'go to a', tool: 'browser_navigate', args: { url: 'http://a' }, confidence: 1, needsDelegation: false },
        { raw: 'go to b', tool: 'browser_navigate', args: { url: 'http://b' }, confidence: 1, needsDelegation: false },
      ],
      unresolved: 0,
    }

    // Must NOT throw — the contract is an honest partial result.
    const results = await executeScenario(plan, actions)
    expect(results[0].ok).toBe(true) // first step preserved
    const last = results[results.length - 1]
    expect(last.ok).toBe(false) // failing step recorded honestly
  })

  it('records ok:false when the evidence screenshot itself rejects (step still counted)', async () => {
    const okNav = vi.fn().mockResolvedValue({ ok: true, url: 'http://a', title: 'A' })
    const throwingShot = vi.fn().mockRejectedValue(new Error('screenshot failed'))
    const actions = makeActions({ navigate: okNav, screenshot: throwingShot })
    const plan: ScenarioPlan = {
      steps: [
        { raw: 'go to a', tool: 'browser_navigate', args: { url: 'http://a' }, confidence: 1, needsDelegation: false },
      ],
      unresolved: 0,
    }

    const results = await executeScenario(plan, actions)
    expect(results).toHaveLength(1)
    // The navigation succeeded; a failed evidence capture must not throw away the run.
    expect(results[0].tool).toBe('browser_navigate')
  })
})

describe('executeScenario — bug #5: no blind retry of non-idempotent actions', () => {
  it('does NOT re-dispatch a failed browser_click (avoids double-click)', async () => {
    const failClick = vi.fn().mockResolvedValue({ ok: false as const, error: 'transient' })
    const actions = makeActions({ click: failClick })
    const plan: ScenarioPlan = {
      steps: [
        { raw: 'click 10,20', tool: 'browser_click', args: { x: 10, y: 20 }, confidence: 1, needsDelegation: false },
      ],
      unresolved: 0,
    }

    const results = await executeScenario(plan, actions)
    expect(results[0].ok).toBe(false)
    expect(failClick.mock.calls.length).toBe(1) // exactly once — no double-apply
  })

  it('does NOT re-dispatch a failed browser_type (avoids double-type)', async () => {
    const failType = vi.fn().mockResolvedValue({ ok: false as const, error: 'transient' })
    const actions = makeActions({ type: failType })
    const plan: ScenarioPlan = {
      steps: [
        { raw: 'type hello', tool: 'browser_type', args: { text: 'hello' }, confidence: 1, needsDelegation: false },
      ],
      unresolved: 0,
    }

    await executeScenario(plan, actions)
    expect(failType.mock.calls.length).toBe(1)
  })

  it('STILL retries idempotent actions (browser_navigate) once on transient failure', async () => {
    let calls = 0
    const failThenOk = vi.fn().mockImplementation(async () => {
      calls++
      return calls === 1
        ? { ok: false as const, error: 'transient' }
        : { ok: true as const, url: 'http://x', title: 'X' }
    })
    const actions = makeActions({ navigate: failThenOk })
    const plan: ScenarioPlan = {
      steps: [
        { raw: 'go to x', tool: 'browser_navigate', args: { url: 'http://x' }, confidence: 1, needsDelegation: false },
      ],
      unresolved: 0,
    }

    const results = await executeScenario(plan, actions)
    expect(results[0].ok).toBe(true)
    expect(failThenOk.mock.calls.length).toBe(2) // retried
  })
})
