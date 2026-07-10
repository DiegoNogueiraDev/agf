/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_9fc226e84607 — renderProgressHtml: página vanilla de progresso (sem
 * React, sem libs externas). Pura.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { renderProgressHtml } from '../core/web/progress-html.js'

describe('renderProgressHtml — página vanilla (#W2)', () => {
  const html = renderProgressHtml()

  it('é um documento HTML que faz polling das APIs', () => {
    expect(html).toContain('<html')
    expect(html).toContain('/api/progress')
    expect(html).toContain('/api/logs')
  })

  it('contém os containers de nodes, tokens e logs', () => {
    expect(html).toContain('id="nodes"')
    expect(html).toContain('id="tokens"')
    expect(html).toContain('id="logs"')
  })

  it('é vanilla — sem React nem libs externas (sem <script src>)', () => {
    expect(html.toLowerCase()).not.toContain('react')
    expect(html).not.toMatch(/<script\s+src=/i)
  })
})

describe('renderProgressHtml — shell em abas + design tokens (node_13d205534cc8)', () => {
  const html = renderProgressHtml()

  it('renderiza 3 abas: progresso, economia, grafo', () => {
    expect(html).toContain(`data-tab="progresso"`)
    expect(html).toContain(`data-tab="economia"`)
    expect(html).toContain(`data-tab="grafo"`)
  })

  it('aplica os design tokens do graph-flow (Inter + accent #4263eb)', () => {
    expect(html).toContain('Inter')
    expect(html).toContain('#4263eb')
  })

  it('abas são focáveis via teclado (botões com role=tab)', () => {
    const tabButtons = html.match(/<button[^>]*role="tab"[^>]*>/g) ?? []
    expect(tabButtons.length).toBe(3)
  })

  it('a aba progresso preserva os ids existentes (sem regressão)', () => {
    for (const id of ['project', 'phase', 'model', 'tokens', 'nodes', 'logs']) {
      expect(html).toContain(`id="${id}"`)
    }
  })

  it('preserva o polling das 3 APIs de progresso', () => {
    expect(html).toContain('/api/progress')
    expect(html).toContain('/api/logs')
    expect(html).toContain('/api/colony-health')
  })

  it('mantém progress-html.ts abaixo de 800 linhas', () => {
    const src = readFileSync(fileURLToPath(new URL('../core/web/progress-html.ts', import.meta.url)), 'utf-8')
    expect(src.split('\n').length).toBeLessThan(800)
  })
})

describe('renderProgressHtml — abas economia/grafo wiradas (node_ba497e9a9fb5)', () => {
  const html = renderProgressHtml()

  it('não deixa mais placeholders "em breve"', () => {
    expect(html).not.toContain('em breve')
  })

  it('a aba economia consome /api/economy com containers de saved/rate/levers', () => {
    expect(html).toContain('/api/economy')
    expect(html).toContain('id="economia-saved"')
    expect(html).toContain('id="economia-rate"')
    expect(html).toContain('id="economia-levers"')
  })

  it('injeta a seção de grafo server-rendered (dormant graph-view) quando fornecida', () => {
    const out = renderProgressHtml('<section class="panel" id="panel-grafo">GRAPH_FRAGMENT</section>')
    expect(out).toContain('GRAPH_FRAGMENT')
    expect(out).toContain('id="panel-grafo"')
  })

  it('sem fragmento, a aba grafo mostra um estado de carregamento (não "em breve")', () => {
    const out = renderProgressHtml()
    expect(out).toContain('carregando grafo')
    expect(out).not.toContain('em breve')
  })
})
