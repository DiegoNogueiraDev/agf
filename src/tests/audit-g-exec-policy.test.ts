/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug-audit regression — AUDIT-059 (HIGH).
 * src/core/autonomy/exec-policy.ts — allow rule must not bypass built-in deny,
 * and prefix matching must respect word boundaries.
 */
import { describe, it, expect } from 'vitest'
import { evaluateExecPolicy, type ExecRule } from '../core/autonomy/exec-policy.js'

describe('AUDIT-059 — deny wins over an explicit allow rule', () => {
  it('git push --force is denied even when a broad `git` allow rule matches', () => {
    const rules: ExecRule[] = [{ match: 'git', effect: 'allow' }]
    const d = evaluateExecPolicy('git push --force origin main', rules)
    expect(d.effect).toBe('deny')
    expect(d.builtin).toBe(true)
  })

  it('sudo is denied even under a broad allow rule that matches', () => {
    const rules: ExecRule[] = [{ match: 'sudo', effect: 'allow' }]
    expect(evaluateExecPolicy('sudo rm -rf /', rules).effect).toBe('deny')
  })

  it('a safe command under the same allow rule still resolves to allow', () => {
    const rules: ExecRule[] = [{ match: 'git', effect: 'allow' }]
    expect(evaluateExecPolicy('git status', rules).effect).toBe('allow')
  })
})

describe('AUDIT-059 — prefix matching requires a word boundary', () => {
  it('rule `git` does not over-match `gitfoo`', () => {
    const rules: ExecRule[] = [{ match: 'git', effect: 'allow' }]
    // `gitfoo` is unrelated → must not inherit the `git` allow rule.
    expect(evaluateExecPolicy('gitfoo --bar', rules, 'ask').effect).toBe('ask')
  })

  it('exact match and `match + space` still match', () => {
    const rules: ExecRule[] = [{ match: 'npm', effect: 'allow' }]
    expect(evaluateExecPolicy('npm', rules).effect).toBe('allow')
    expect(evaluateExecPolicy('npm test', rules).effect).toBe('allow')
  })

  it('longest explicit match still wins (npm allow vs npm publish deny)', () => {
    const rules: ExecRule[] = [
      { match: 'npm', effect: 'allow' },
      { match: 'npm publish', effect: 'deny' },
    ]
    expect(evaluateExecPolicy('npm publish --tag latest', rules).effect).toBe('deny')
    expect(evaluateExecPolicy('npm test', rules).effect).toBe('allow')
  })
})
