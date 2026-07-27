/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { formatStatus, type StatusReport } from '../../cli/shared/status-report.js'

describe('status-report — formatStatus', () => {
  const base: StatusReport = {
    project: 'meu-projeto',
    mode: 'delegate',
    modeReason: 'delegated-cli:test',
    provider: 'copilot',
    endpoint: null,
    model: 'auto',
    cache: 'on',
    failover: [],
    tokens: { total: 1000, in: 500, out: 500, cached: 100, reasoning: 0 },
    costUsd: 0.005,
    costPerSuccessUsd: null,
    tokensSavedDeterministic: 0,
    levers: [],
    costByTask: [],
    economyConfig: {
      ast_compress: { min_bytes: 512 },
      caveman: { aggressiveness: 'moderate' },
      ccr: { enabled: true },
      rag_in: { threshold: 0.6, k: 3 },
      rag_out: { threshold: 0.6, k: 3 },
      dream: { enabled: false, interval_hours: 24 },
      forage: { enabled: false, min_gain: 0.1 },
      aaa: { enabled: false, knn: 5 },
    },
  }

  it('contém nome do projeto na primeira linha', () => {
    const lines = formatStatus(base)
    expect(lines[0]).toContain('meu-projeto')
  })

  it('exibe modo e motivo', () => {
    const lines = formatStatus(base)
    expect(lines.some((l) => l.includes('delegate') && l.includes('delegated-cli'))).toBe(true)
  })

  it('exibe provider e modelo', () => {
    const lines = formatStatus(base)
    expect(lines.some((l) => l.includes('copilot'))).toBe(true)
    expect(lines.some((l) => l.includes('auto'))).toBe(true)
  })

  it('exibe tokens e custo', () => {
    const lines = formatStatus(base)
    expect(lines.some((l) => l.includes('1000'))).toBe(true)
    expect(lines.some((l) => l.includes('$0.0050'))).toBe(true)
  })

  it('inclui linha de Economy Levers', () => {
    const lines = formatStatus(base)
    expect(lines.some((l) => l.includes('Economy Levers'))).toBe(true)
  })

  it('inclui failover quando presente', () => {
    const withFailover: StatusReport = { ...base, failover: ['openai', 'anthropic'] }
    const lines = formatStatus(withFailover)
    expect(lines.some((l) => l.includes('openai') && l.includes('anthropic'))).toBe(true)
  })

  it('exibe economia quando tokensSavedDeterministic > 0', () => {
    {
      const withSavings: StatusReport = {
        ...base,
        tokensSavedDeterministic: 5000,
        levers: [{ lever: 'caveman', saved: 3000, count: 5 }],
      }
      const lines = formatStatus(withSavings)
      expect(lines.some((l) => l.includes('5000'))).toBe(true)
      expect(lines.some((l) => l.includes('caveman'))).toBe(true)
    }
  })

  it('exibe costByTask quando presente', () => {
    const withCosts: StatusReport = {
      ...base,
      costByTask: [{ nodeId: 'n1', costUsd: 0.001, tokens: 200 }],
    }
    const lines = formatStatus(withCosts)
    expect(lines.some((l) => l.includes('n1'))).toBe(true)
  })

  it('usa placeholder (sem nome) quando project é null', () => {
    const noProject: StatusReport = { ...base, project: null }
    const lines = formatStatus(noProject)
    expect(lines[0]).toContain('(sem nome)')
  })

  it('exibe endpoint quando presente', () => {
    const withEndpoint: StatusReport = { ...base, provider: 'openai', endpoint: 'https://api.openai.com' }
    const lines = formatStatus(withEndpoint)
    expect(lines.some((l) => l.includes('https://api.openai.com'))).toBe(true)
  })
})
