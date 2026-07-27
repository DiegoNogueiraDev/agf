/**
 * scenario-expectation.test.ts — letting a scenario declare what it expects.
 *
 * The oracle grades a pass by whether the run proved WHERE it arrived
 * (expectedIdentity vs observedIdentity) and WHAT it changed (expectsEffect +
 * crossCheck). Both fields were read and nothing ever wrote them: the plan had no
 * way to express an expectation, so through the only production path every pass
 * came back `corroboration: 'none'` — a scenario that navigates somewhere and
 * screenshots anything scored exactly like one that proved its control worked.
 *
 * An expectation is not a step: it is an assertion about where the run ends, so it
 * belongs to the plan and is stamped onto the terminal result, not dispatched as a
 * browser action.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileScenario } from '../plugins/browser/nl-scenario-compiler.js'
import { executeScenario } from '../plugins/browser/scenario-executor.js'
import { evaluateScenario } from '../plugins/browser/scenario-oracle.js'
import type { BrowserActions } from '../plugins/browser/actions/index.js'

function actionsLanding(url: string): BrowserActions {
  const ok = async () => ({ ok: true as const })
  return {
    navigate: async () => ({ ok: true as const, url }),
    click: ok,
    type: ok,
    pressKey: ok,
    screenshot: async () => ({ ok: true as const, data: 'pixels' }),
    jsEval: async () => ({ ok: true as const, value: null }),
    pageInfo: async () => ({ ok: true as const, url, title: 'agf' }),
    getCookies: async () => ({ ok: true as const, cookies: [] }),
    setCookie: ok,
    clearCookies: ok,
    getAuthState: async () => ({ ok: true as const, authenticated: false }),
    networkLog: async () => ({ ok: true as const, entries: [] }),
    consoleMessages: async () => ({ ok: true as const, messages: [] }),
  } as BrowserActions
}

describe('compileScenario — expectations are plan-level, not steps', () => {
  it('extracts the expected identity from a declaration line', () => {
    const plan = compileScenario('navegue para http://x/app\nespero estar em /app\ntirar screenshot')
    expect(plan.expectation?.identity).toBe('/app')
  })

  it('does NOT turn the declaration into a browser step', () => {
    // Dispatching it would try to run a tool named after prose and fail the run.
    const plan = compileScenario('navegue para http://x/app\nespero estar em /app\ntirar screenshot')
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps.map((s) => s.tool)).toEqual(['browser_navigate', 'browser_screenshot'])
  })

  it('does not count a declaration as unresolved — it is understood, just not a tool', () => {
    const plan = compileScenario('navegue para http://x/app\nespero estar em /app')
    expect(plan.unresolved).toBe(0)
  })

  it('leaves expectation absent when the scenario declares nothing (backward compatible)', () => {
    const plan = compileScenario('navegue para http://x/app\ntirar screenshot')
    expect(plan.expectation).toBeUndefined()
  })
})

describe('the declared expectation reaches the oracle', () => {
  it('a run that lands where it said turns a hollow pass into corroboration: identity', async () => {
    const plan = compileScenario('navegue para http://x/app\nespero estar em http://x/app\ntirar screenshot')
    const verdict = evaluateScenario(await executeScenario(plan, actionsLanding('http://x/app')))
    expect(verdict.verdict).toBe('passed')
    expect(verdict.corroboration).toBe('identity')
  })

  it('the SAME scenario without the declaration is still only a hollow pass', async () => {
    // The counter-proof: one line is the whole difference between proving arrival
    // and merely arriving.
    const plan = compileScenario('navegue para http://x/app\ntirar screenshot')
    const verdict = evaluateScenario(await executeScenario(plan, actionsLanding('http://x/app')))
    expect(verdict.verdict).toBe('passed')
    expect(verdict.corroboration).toBe('none')
  })

  it('ERRO/LIMITE: landing somewhere else is inconclusive, never passed', async () => {
    const plan = compileScenario('navegue para http://x/app\nespero estar em http://x/app\ntirar screenshot')
    const verdict = evaluateScenario(await executeScenario(plan, actionsLanding('http://x/login')))
    expect(verdict.verdict).toBe('inconclusive')
    expect(verdict.verdict).not.toBe('passed')
  })
})

// ── Corpus (node_a65b6c47e1ac) ────────────────────────────────────────
//
// A fixture proves the sentence you imagined; the corpus catches the one you did
// not. This compiler is regex over prose, so its failure mode is silent — an
// unrecognised line becomes an unresolved step and the scenario still "runs",
// proving less than its author believed. Every file under corpus/scenarios is
// compiled and held to invariants that must survive any new phrasing.

const CORPUS_DIR = join(process.cwd(), 'corpus', 'scenarios')

describe('compileScenario over the real scenario corpus', () => {
  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.txt'))

  it('the corpus is actually there — an empty sweep would pass every assertion below', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s: every line is understood — none falls through as unresolved', (file) => {
    const plan = compileScenario(readFileSync(join(CORPUS_DIR, file), 'utf8'))
    const unrecognised = plan.steps.filter((s) => s.needsDelegation).map((s) => s.raw)
    expect(unrecognised, `unrecognised in ${file}`).toEqual([])
  })

  it.each(files)('%s: no expectation line is dispatched as a browser step', (file) => {
    const text = readFileSync(join(CORPUS_DIR, file), 'utf8')
    const plan = compileScenario(text)
    const declared = text.split('\n').filter((l) => /espero estar em|expect to be at/i.test(l))
    for (const line of declared) {
      expect(
        plan.steps.map((s) => s.raw),
        `${file} dispatched a declaration`,
      ).not.toContain(line.trim())
    }
    if (declared.length > 0) expect(plan.expectation?.identity, `${file} lost its expectation`).toBeTruthy()
  })

  it('strips trailing punctuation from a declared identity, as it does for urls', () => {
    // Real prose ends sentences with a period; an identity carrying it would never
    // match the observed route, turning every such scenario inconclusive.
    const plan = compileScenario(readFileSync(join(CORPUS_DIR, 'trailing-punctuation.txt'), 'utf8'))
    expect(plan.expectation?.identity).toBe('https://example.com/app')
  })
})
