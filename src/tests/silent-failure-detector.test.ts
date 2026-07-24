/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Detector estático de falha silenciosa (node_5a3fb7203795, épico node_b94dd6f2df50).
 * A classe DOMINANTE de defeito dos artigos okr-sbst: a tela lê um shape/campo que o
 * backend não entrega e degrada p/ vazio SEM crashar (fallback mascarante). Função PURA
 * — recebe o conteúdo, não lê disco (zero mock de fs).
 */
import { describe, it, expect } from 'vitest'
import { scanSilentFailures, buildSilentFailurePayload } from '../core/analyzer/silent-failure-detector.js'

describe('scanSilentFailures (node_5a3fb7203795)', () => {
  it("AC1: 'const rows = data.items || []' → ≥1 Finding pattern '|| []' na linha correta", () => {
    const src = ['const a = 1', 'const rows = data.items || []', 'const b = 2'].join('\n')
    const findings = scanSilentFailures(src, 'x.ts')
    expect(findings.length).toBeGreaterThanOrEqual(1)
    const f = findings.find((x) => x.pattern === '|| []')
    expect(f).toBeDefined()
    expect(f?.line).toBe(2)
    expect(f?.file).toBe('x.ts')
  })

  it("AC2: catch block vazio 'catch (e) {}' → 1 Finding pattern 'empty_catch'", () => {
    const src = 'try { foo() } catch (e) {}'
    const findings = scanSilentFailures(src, 'y.ts')
    const f = findings.filter((x) => x.pattern === 'empty_catch')
    expect(f).toHaveLength(1)
  })

  it("também pega 'catch {}' sem parâmetro (TS4+)", () => {
    const findings = scanSilentFailures('try { foo() } catch {}', 'z.ts')
    expect(findings.some((x) => x.pattern === 'empty_catch')).toBe(true)
  })

  it("pega \"|| ''\" e '@ts-expect-error'", () => {
    const src = ["const name = user.nome || ''", '// @ts-expect-error legacy'].join('\n')
    const findings = scanSilentFailures(src, 'w.ts')
    expect(findings.some((x) => x.pattern === "|| ''")).toBe(true)
    expect(findings.some((x) => x.pattern === 'ts_expect_error')).toBe(true)
  })

  it('AC3: código limpo sem nenhum dos 4 padrões → [] (zero falso-positivo)', () => {
    const src = ['function add(a: number, b: number) {', '  return a + b', '}'].join('\n')
    expect(scanSilentFailures(src, 'clean.ts')).toEqual([])
  })

  it('catch COM corpo (não vazio) NÃO é flagged (evita falso-positivo)', () => {
    const src = 'try { foo() } catch (e) { log.warn(e) }'
    expect(scanSilentFailures(src, 'ok.ts').some((x) => x.pattern === 'empty_catch')).toBe(false)
  })
})

describe('buildSilentFailurePayload — agregado do CLI (node_e7807a63a61d)', () => {
  it('AC1: 1 arquivo com |1| [] → findings ≥1 nomeando arquivo:linha, ok true', () => {
    const p = buildSilentFailurePayload([{ path: 'a.ts', content: 'const r = x.items || []' }])
    expect(p.ok).toBe(true)
    expect(p.findings.length).toBeGreaterThanOrEqual(1)
    expect(p.findings[0].file).toBe('a.ts')
    expect(p.findings[0].line).toBe(1)
    expect(p.checkedFiles).toBe(1)
  })

  it('AC2: diretório 100% limpo → findings===[] e ok true (não erra, não inventa)', () => {
    const p = buildSilentFailurePayload([
      { path: 'a.ts', content: 'export const add = (a: number, b: number) => a + b' },
      { path: 'b.ts', content: 'export const ok = true' },
    ])
    expect(p.ok).toBe(true)
    expect(p.findings).toEqual([])
    expect(p.checkedFiles).toBe(2)
  })

  it('agrega findings de múltiplos arquivos', () => {
    const p = buildSilentFailurePayload([
      { path: 'a.ts', content: "const n = u.nome || ''" },
      { path: 'b.ts', content: 'try { f() } catch {}' },
    ])
    expect(p.findings.map((f) => f.file).sort()).toEqual(['a.ts', 'b.ts'])
  })
})
