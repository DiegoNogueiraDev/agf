/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `agf montar-output` answered `recover`, named a scaffold, listed its slots, and claimed a
 * saving of 180 tokens. It never handed over the structure. It could not have: nine of the
 * thirteen `structureRef`s pointed at `templates/*.md` files that had never been written, and the
 * other four named deterministic scaffolders whose bodies `runScaffold()` can produce and nobody
 * ever asked it to. The nine ship in `templates/index.ts` now; the guard below is what keeps a
 * tenth from being promised before it is written.
 *
 * So the ledger holds 4,951 tokens of `rag_out_recovery` and `scaffold_recovery` earned by
 * structure that reached no one. Measuring a baseline on top of that would have been measuring a
 * fiction, precisely and to three decimal places.
 *
 * A saving is the cost of a thing you did not have to write. If the thing does not exist, the
 * cost is zero and the honest answer is `generate`.
 */

import { describe, it, expect } from 'vitest'
import { resolveScaffoldBody, structureTokens } from '../core/rag-out/scaffold-body.js'

describe('resolveScaffoldBody — you cannot reuse a skeleton that was never written', () => {
  it('renders the body of a deterministic scaffolder', () => {
    const body = resolveScaffoldBody('scaffolder:interface')
    expect(body).not.toBeNull()
    expect(body).toContain('export interface')
  })

  it.each(['scaffolder:contract', 'scaffolder:state-machine', 'scaffolder:formula'])(
    'renders %s rather than naming it',
    (ref) => {
      expect(resolveScaffoldBody(ref)?.length ?? 0).toBeGreaterThan(0)
    },
  )

  // `templates/react-component.md` and eight siblings were once exactly this: a promise with no
  // text behind it. They ship in `templates/index.ts` now. The guard has not moved — a reference
  // nobody defined still resolves to nothing, and the gate still refuses to recover it.
  it('returns null for a template reference nobody defined', () => {
    expect(resolveScaffoldBody('templates/never-written.md')).toBeNull()
  })

  it('renders the shipped skeleton for a reference the tool defines', () => {
    expect(resolveScaffoldBody('templates/react-component.md')).toContain('{{componentName}}')
  })

  it('returns null for an unknown scaffolder kind rather than inventing one', () => {
    expect(resolveScaffoldBody('scaffolder:does-not-exist')).toBeNull()
  })

  it('returns null when there is no reference at all', () => {
    expect(resolveScaffoldBody(undefined)).toBeNull()
  })

  it('never throws — a broken scaffolder must not take the command down', () => {
    expect(() => resolveScaffoldBody('scaffolder:formula')).not.toThrow()
  })
})

describe('structureTokens — the baseline is the text, counted', () => {
  it('counts the rendered body, not a constant', () => {
    const tokens = structureTokens('scaffolder:interface')
    expect(tokens).not.toBeNull()
    expect(tokens).toBeGreaterThan(10)
  })

  it('is null when the structure does not exist, so no saving can be claimed for it', () => {
    expect(structureTokens('templates/never-written.md')).toBeNull()
  })

  it('counts a shipped template as the text it is', () => {
    expect(structureTokens('templates/cli-ts.md') ?? 0).toBeGreaterThan(40)
  })
})
