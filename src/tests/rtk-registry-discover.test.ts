/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  detectFilter,
  autoDetectFilter,
  registerFilter,
  clearCustomFilters,
  listFilters,
} from '../core/tool-compress/registry.js'
import {
  recordMiss,
  topMisses,
  resetDiscover,
  signatureOf,
  persistDiscover,
  loadDiscover,
  formatDiscover,
} from '../core/tool-compress/discover.js'
import {
  compileCustomFilter,
  loadCustomFiltersFromFile,
  _resetCustomFiltersLoaded,
} from '../core/tool-compress/custom-filters.js'

beforeEach(() => {
  clearCustomFilters()
  resetDiscover()
})

describe('registry', () => {
  it('lista os built-ins ordenados e detecta git-diff', () => {
    const names = listFilters().map((f) => f.name)
    expect(names).toContain('git-diff')
    expect(names).toContain('test-runner')
    expect(names).toContain('lint-report')
    const fn = autoDetectFilter('diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b')
    expect((fn as { filterName?: string })?.filterName).toBe('git-diff')
  })

  it('registerFilter adiciona um filtro custom e detectFilter o escolhe por prioridade', () => {
    registerFilter({
      name: 'docker-step',
      priority: 55,
      detect: (ctx) => /^DOCKERSTEP /m.test(ctx.head),
      apply: (t) => t.split('\n')[0],
    })
    const f = detectFilter('DOCKERSTEP 1/5 RUN build\nlots of noise\nmore noise')
    expect(f?.name).toBe('docker-step')
  })
})

describe('discover', () => {
  it('signatureOf agrupa saídas semelhantes (números/hash/path → genérico)', () => {
    const a = signatureOf('Compiled module 12345 at /repo/src/a.ts')
    const b = signatureOf('Compiled module 67 at /repo/src/zzz.ts')
    expect(a).toBe(b)
  })

  it('recordMiss é gated por AGF_COMPRESS_DISCOVER', () => {
    const big = 'weird tool output line\n'.repeat(60)
    recordMiss(big, {}) // desligado
    expect(topMisses()).toHaveLength(0)
    recordMiss(big, { AGF_COMPRESS_DISCOVER: '1' }) // ligado
    expect(topMisses().length).toBe(1)
    expect(topMisses()[0].count).toBe(1)
  })

  it('persiste e relê (merge por assinatura)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'compress-disc-'))
    const file = join(dir, 'd.json')
    recordMiss('mystery output blob\n'.repeat(50), { AGF_COMPRESS_DISCOVER: '1' })
    persistDiscover(file)
    const loaded = loadDiscover(file)
    expect(loaded.length).toBe(1)
    expect(formatDiscover(loaded)).toContain('mystery output blob')
  })
})

describe('custom-filters (declarativos, on-demand)', () => {
  it('compileCustomFilter: detecta, mantém keep, colapsa drop, no-grow', () => {
    const f = compileCustomFilter({
      name: 'kubectl-get',
      detect: ['^NAME\\s+READY\\s+STATUS'],
      keep: ['Error|CrashLoopBackOff|Pending'],
      drop: ['Running'],
    })
    const input = [
      'NAME      READY   STATUS    RESTARTS',
      'pod-a     1/1     Running   0',
      'pod-b     1/1     Running   0',
      'pod-c     0/1     CrashLoopBackOff   5',
      'pod-d     1/1     Running   0',
    ].join('\n')
    expect(f.detect({ head: input, full: input, headLines: input.split('\n'), nonEmpty: input.split('\n') })).toBe(true)
    const out = f.apply(input)
    expect(out).toContain('CrashLoopBackOff') // sinal preservado
    expect(out).toContain('colapsadas') // Running colapsado
    expect(out.length).toBeLessThan(input.length)
  })

  it('regra inválida lança; loadCustomFiltersFromFile ignora as ruins e registra as boas', () => {
    expect(() => compileCustomFilter({ name: 'x', detect: [] })).toThrow()
    const dir = mkdtempSync(join(tmpdir(), 'compress-cf-'))
    const file = join(dir, 'compress-filters.json')
    writeFileSync(
      file,
      JSON.stringify([
        { name: 'good', detect: ['^WIDGET '], drop: ['ok'] },
        { name: 'bad', detect: [] }, // inválida → ignorada
      ]),
      'utf8',
    )
    _resetCustomFiltersLoaded()
    const n = loadCustomFiltersFromFile(file)
    expect(n).toBe(1)
    expect(detectFilter('WIDGET 1\nok\nok\nWIDGET 2')?.name).toBe('good')
  })

  it('os templates de exemplo shipados carregam e roteiam saídas reais', () => {
    const example = join(process.cwd(), 'docs/examples/compress-filters.example.json')
    const n = loadCustomFiltersFromFile(example)
    expect(n).toBe(5) // npm-audit, trivy, docker-build, kubectl-get, terraform-plan
    const kube = `NAME      READY   STATUS    RESTARTS   AGE
pod-a     1/1     Running   0          1d
pod-b     0/1     CrashLoopBackOff   5   2h`
    expect(detectFilter(kube)?.name).toBe('kubectl-get')
    const docker = 'Step 1/5 : FROM node:20\n ---> abc\nStep 2/5 : RUN npm ci\nSuccessfully built deadbeef'
    expect(detectFilter(docker)?.name).toBe('docker-build')
  })
})
