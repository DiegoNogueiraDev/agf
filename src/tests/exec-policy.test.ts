/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_fbd1bc7467c3 — exec-policy: allow/deny/ask declarativo para comandos de
 * shell no loop autônomo + cache de aprovação por sessão. Inspirado no
 * `execpolicy` do Codex. Endurece o guardrail do autopilot.
 */
import { describe, it, expect } from 'vitest'
import { evaluateExecPolicy, guardExecRunner, ApprovalCache, type ExecRule } from '../core/autonomy/exec-policy.js'

describe('evaluateExecPolicy — allow/deny/ask por prefixo', () => {
  const rules: ExecRule[] = [
    { match: 'npm', effect: 'allow' },
    { match: 'npm publish', effect: 'deny' },
    { match: 'git status', effect: 'allow' },
  ]

  it('match mais longo vence (npm allow vs npm publish deny)', () => {
    expect(evaluateExecPolicy('npm publish --tag latest', rules).effect).toBe('deny')
    expect(evaluateExecPolicy('npm test', rules).effect).toBe('allow')
  })

  it("'rm -rf' sem regra explícita → deny (built-in DEFAULT_DENY)", () => {
    const d = evaluateExecPolicy('rm -rf /tmp/x', [])
    expect(d.effect).toBe('deny')
    expect(d.builtin).toBe(true)
  })

  it('comandos perigosos built-in: sudo, git push --force, dd if=', () => {
    expect(evaluateExecPolicy('sudo rm x', []).effect).toBe('deny')
    expect(evaluateExecPolicy('git push --force origin main', []).effect).toBe('deny')
    expect(evaluateExecPolicy('dd if=/dev/zero of=/dev/sda', []).effect).toBe('deny')
  })

  it("nenhum match e default 'ask' → ask", () => {
    expect(evaluateExecPolicy('vitest run', [], 'ask').effect).toBe('ask')
  })

  it('default configurável (allow) quando nada casa e não é perigoso', () => {
    expect(evaluateExecPolicy('vitest run', [], 'allow').effect).toBe('allow')
  })
})

describe('ApprovalCache — aprovação por sessão', () => {
  it('approveForSession torna isApproved true (normaliza espaços)', () => {
    const cache = new ApprovalCache()
    expect(cache.isApproved('npm test')).toBe(false)
    cache.approveForSession('npm test')
    expect(cache.isApproved('npm test')).toBe(true)
    expect(cache.isApproved('npm   test')).toBe(true) // espaços colapsados
  })
})

describe('guardExecRunner — bloqueia deny/ask antes de executar', () => {
  it('allow → chama o runner base', () => {
    let called = false
    const base = (): { exitCode: number; output: string } => {
      called = true
      return { exitCode: 0, output: 'ok' }
    }
    const runner = guardExecRunner(base, { rules: [{ match: 'npm', effect: 'allow' }] })
    const r = runner('npm test', '/tmp')
    expect(called).toBe(true)
    expect(r.exitCode).toBe(0)
  })

  it('deny → NÃO chama o runner base e retorna exitCode != 0', () => {
    let called = false
    const base = (): { exitCode: number; output: string } => {
      called = true
      return { exitCode: 0, output: 'ok' }
    }
    const runner = guardExecRunner(base, { rules: [] })
    const r = runner('rm -rf /', '/tmp')
    expect(called).toBe(false)
    expect(r.exitCode).not.toBe(0)
    expect(r.output.toLowerCase()).toContain('exec-policy')
  })

  it('ask sem aprovação → bloqueia; com aprovação no cache → executa', () => {
    const cache = new ApprovalCache()
    let calls = 0
    const base = (): { exitCode: number; output: string } => {
      calls++
      return { exitCode: 0, output: 'ok' }
    }
    const runner = guardExecRunner(base, { rules: [], defaultEffect: 'ask', cache })
    expect(runner('vitest run', '/tmp').exitCode).not.toBe(0) // bloqueado
    expect(calls).toBe(0)
    cache.approveForSession('vitest run')
    expect(runner('vitest run', '/tmp').exitCode).toBe(0) // aprovado → executa
    expect(calls).toBe(1)
  })
})
