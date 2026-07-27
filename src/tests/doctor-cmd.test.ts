/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/doctor-cmd.ts — doctorCommand factory wiring.
 */

import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { doctorCommand } from '../cli/commands/doctor-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GateBaseline } from '../core/integrations/sentrux-gate.js'

describe('doctorCommand', () => {
  it('builds the "doctor" command with a description', () => {
    const cmd = doctorCommand()
    expect(cmd.name()).toBe('doctor')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = doctorCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf doctor --config-sync reports project config drift (node_wire_ff662205dd9d)', () => {
  it('reports inSync:false with non-empty drift for a fresh directory missing config files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-config-sync-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--config-sync', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { inSync: boolean; drift: unknown[] }
      expect(envelope.ok).toBe(true)
      expect(data.inSync).toBe(false)
      expect(data.drift.length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports inSync:true with empty drift once the directory is synced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-config-sync-synced-'))
    try {
      const { syncConfigs } = await import('../core/init/sync-configs.js')
      syncConfigs(dir)

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--config-sync', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { inSync: boolean; drift: unknown[] }
      expect(envelope.ok).toBe(true)
      expect(data.inSync).toBe(true)
      expect(data.drift).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf doctor --mcp-deps reports MCP dependency availability (node_wire_5c2d1dede619)', () => {
  it('reports a result entry for each MCP dependency (npx, uvx, docker)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-mcp-deps-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--mcp-deps', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { mcpDeps: Array<{ name: string; status: string }> }
      expect(envelope.ok).toBe(true)
      expect(data.mcpDeps.map((r) => r.name).sort()).toEqual(['docker', 'npx', 'uvx'])
      for (const result of data.mcpDeps) {
        expect(['installed', 'already_available', 'failed', 'skipped']).toContain(result.status)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf doctor --mcp-config prints the mcpServers block for opt-in client wiring (node_wire_f745c0b37c65)', () => {
  it('reports an mcpServers object with a graph-flow entry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-mcp-config-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--mcp-config', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { mcpConfig: { mcpServers: Record<string, { command: string; args: string[] }> } }
      expect(envelope.ok).toBe(true)
      expect(data.mcpConfig.mcpServers).toHaveProperty('graph-flow')
      expect(typeof data.mcpConfig.mcpServers['graph-flow'].command).toBe('string')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf doctor --graph-invariants mutation-tests the graph consistency checks (node_wire_d48e2d8353a7)', () => {
  it('reports passed:true with every built-in mutation caught on a healthy store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-invariants-'))
    try {
      const store = SqliteStore.open(dir)
      store.initProject('invariants-test')
      store.close()

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--graph-invariants', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { passed: boolean; mutationsCaught: number; mutationsApplied: number }
      expect(envelope.ok).toBe(true)
      expect(data.passed).toBe(true)
      expect(data.mutationsCaught).toBe(data.mutationsApplied)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function makeGateBaseline(overrides: Partial<GateBaseline> = {}): GateBaseline {
  return {
    timestamp: 1000,
    quality_signal: 0.8,
    coupling_score: 0.4,
    cycle_count: 2,
    god_file_count: 3,
    hotspot_count: 5,
    complex_fn_count: 10,
    max_depth: 4,
    total_import_edges: 50,
    cross_module_edges: 15,
    ...overrides,
  }
}

describe('agf doctor --sentrux-gate compares .sentrux/baseline.json to a current snapshot (node_wire_daba2045291b)', () => {
  it('fails with SENTRUX_GATE_NO_BASELINE when .sentrux/baseline.json is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-sentrux-gate-'))
    try {
      const currentPath = join(dir, 'current.json')
      writeFileSync(currentPath, JSON.stringify(makeGateBaseline()))

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--sentrux-gate', currentPath, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe('SENTRUX_GATE_NO_BASELINE')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails with SENTRUX_GATE_NO_CURRENT when the current snapshot file is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-sentrux-gate-'))
    try {
      mkdirSync(join(dir, '.sentrux'), { recursive: true })
      writeFileSync(join(dir, '.sentrux', 'baseline.json'), JSON.stringify(makeGateBaseline()))

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--sentrux-gate', join(dir, 'missing-current.json'), '-d', dir], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe('SENTRUX_GATE_NO_CURRENT')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports ok with status pass when quality holds steady', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-sentrux-gate-'))
    try {
      mkdirSync(join(dir, '.sentrux'), { recursive: true })
      writeFileSync(join(dir, '.sentrux', 'baseline.json'), JSON.stringify(makeGateBaseline()))
      const currentPath = join(dir, 'current.json')
      writeFileSync(currentPath, JSON.stringify(makeGateBaseline({ quality_signal: 0.85 })))

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--sentrux-gate', currentPath, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { status: string }
      expect(envelope.ok).toBe(true)
      expect(data.status).toBe('pass')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails with SENTRUX_GATE_REGRESSION and reasons when quality regresses', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-sentrux-gate-'))
    try {
      mkdirSync(join(dir, '.sentrux'), { recursive: true })
      writeFileSync(join(dir, '.sentrux', 'baseline.json'), JSON.stringify(makeGateBaseline({ quality_signal: 0.9 })))
      const currentPath = join(dir, 'current.json')
      writeFileSync(currentPath, JSON.stringify(makeGateBaseline({ quality_signal: 0.7 })))

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--sentrux-gate', currentPath, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { reasons?: string[] }
      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe('SENTRUX_GATE_REGRESSION')
      expect(data.reasons?.some((r) => r.includes('quality_signal'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf doctor --store reports which graph database would be resolved (node_wire_3db7cb93316b)', () => {
  it('reports mode:local with the local dbPath when workflow-graph/graph.db exists in the target dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-store-local-'))
    try {
      SqliteStore.open(dir).close()

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--store', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { mode: string; dbPath: string; memoriesPath: string }
      expect(envelope.ok).toBe(true)
      expect(data.mode).toBe('local')
      expect(data.dbPath).toBe(join(dir, 'workflow-graph', 'graph.db'))
      expect(data.memoriesPath).toBe(join(dir, 'workflow-graph', 'memories'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports mode:explicit with the MCP_GRAPH_DB path when the env var is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-store-explicit-'))
    const explicitDb = join(dir, 'custom', 'graph.db')
    const prevEnv = process.env.MCP_GRAPH_DB
    process.env.MCP_GRAPH_DB = explicitDb
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--store', '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { mode: string; dbPath: string }
      expect(envelope.ok).toBe(true)
      expect(data.mode).toBe('explicit')
      expect(data.dbPath).toBe(explicitDb)
    } finally {
      if (prevEnv === undefined) delete process.env.MCP_GRAPH_DB
      else process.env.MCP_GRAPH_DB = prevEnv
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf doctor --sentrux-mcp-health validates a captured Sentrux MCP health snapshot (node_wire_9ebcb4a20be9)', () => {
  it('fails with SENTRUX_MCP_HEALTH_NO_FILE when the snapshot file is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-sentrux-mcp-health-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--sentrux-mcp-health', join(dir, 'missing.json'), '-d', dir], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe('SENTRUX_MCP_HEALTH_NO_FILE')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports ok with the parsed status when the snapshot is a valid health response', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-sentrux-mcp-health-'))
    try {
      const snapshotPath = join(dir, 'health.json')
      writeFileSync(
        snapshotPath,
        JSON.stringify({ status: 'healthy', checks: [{ name: 'db', status: 'ok' }], latency_ms: 12 }),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--sentrux-mcp-health', snapshotPath, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { status: string; latency_ms: number }
      expect(envelope.ok).toBe(true)
      expect(data.status).toBe('healthy')
      expect(data.latency_ms).toBe(12)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails with SENTRUX_MCP_HEALTH_INVALID when the snapshot does not match the health schema', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-doctor-sentrux-mcp-health-'))
    try {
      const snapshotPath = join(dir, 'health.json')
      writeFileSync(snapshotPath, JSON.stringify({ status: 'not-a-valid-status' }))

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await doctorCommand().parseAsync(['--sentrux-mcp-health', snapshotPath, '-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe('SENTRUX_MCP_HEALTH_INVALID')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agf doctor --heavy-tool reports MemoryGuard pressure for a tool name (node_wire_e43905a2fdfb)', () => {
  it('reports isHeavyTool:false and ok:true for a tool not in HEAVY_TOOLS, even under forced critical pressure', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doctorCommand().parseAsync(['--heavy-tool', 'not-a-heavy-tool', '--reject-threshold-mb', '0'], {
        from: 'user',
      })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { isHeavyTool: boolean; rejected: boolean }
    expect(envelope.ok).toBe(true)
    expect(data.isHeavyTool).toBe(false)
    expect(data.rejected).toBe(false)
  })

  it('reports ok:true and rejected:false for a heavy tool when the reject threshold is far above current heap usage', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doctorCommand().parseAsync(['--heavy-tool', 'metrics', '--reject-threshold-mb', '100000'], {
        from: 'user',
      })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { isHeavyTool: boolean; rejected: boolean; pressureLevel: string }
    expect(envelope.ok).toBe(true)
    expect(data.isHeavyTool).toBe(true)
    expect(data.rejected).toBe(false)
    expect(data.pressureLevel).toBe('ok')
  })

  it('fails with MEMORY_PRESSURE_REJECTED for a heavy tool when the reject threshold is forced to 0', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doctorCommand().parseAsync(['--heavy-tool', 'search', '--reject-threshold-mb', '0'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { isHeavyTool: boolean; rejected: boolean; pressureLevel: string }
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('MEMORY_PRESSURE_REJECTED')
    expect(data.isHeavyTool).toBe(true)
    expect(data.rejected).toBe(true)
    expect(data.pressureLevel).toBe('critical')
  })
})

describe('agf doctor --concurrency-status reports ConcurrentSemaphore admission for a tool name (node_wire_9088484cb91a)', () => {
  it('reports isHeavyTool:false and ok:true for a tool not in HEAVY_TOOLS, even with no concurrency slots', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doctorCommand().parseAsync(
        ['--concurrency-status', 'not-a-heavy-tool', '--max-concurrent', '0', '--max-queued', '0'],
        { from: 'user' },
      )
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { isHeavyTool: boolean; rejected: boolean }
    expect(envelope.ok).toBe(true)
    expect(data.isHeavyTool).toBe(false)
    expect(data.rejected).toBe(false)
  })

  it('reports ok:true and rejected:false for a heavy tool when a concurrency slot is available', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doctorCommand().parseAsync(['--concurrency-status', 'metrics'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { isHeavyTool: boolean; rejected: boolean; active: number; queued: number }
    expect(envelope.ok).toBe(true)
    expect(data.isHeavyTool).toBe(true)
    expect(data.rejected).toBe(false)
    expect(data.active).toBe(0)
    expect(data.queued).toBe(0)
  })

  it('fails with CONCURRENCY_LIMIT_REJECTED for a heavy tool when max-concurrent and max-queued are forced to 0', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doctorCommand().parseAsync(
        ['--concurrency-status', 'search', '--max-concurrent', '0', '--max-queued', '0'],
        { from: 'user' },
      )
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { isHeavyTool: boolean; rejected: boolean }
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('CONCURRENCY_LIMIT_REJECTED')
    expect(data.isHeavyTool).toBe(true)
    expect(data.rejected).toBe(true)
  })
})

describe('agf doctor --memory-health reports a heap health report (node_wire_40d22acfdf9b)', () => {
  it('reports ok:true with heap/thresholds/recommendations under default thresholds', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doctorCommand().parseAsync(['--memory-health'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as {
      heap: { heapUsedMb: number; level: string }
      thresholds: { warnMb: number; rejectMb: number }
      recommendations: string[]
    }
    expect(envelope.ok).toBe(true)
    expect(data.thresholds.warnMb).toBe(600)
    expect(data.thresholds.rejectMb).toBe(800)
    expect(data.heap).toHaveProperty('heapUsedMb')
    expect(data.heap).toHaveProperty('level')
    expect(Array.isArray(data.recommendations)).toBe(true)
  })

  it('accepts custom thresholds via --warn-threshold-mb / --reject-threshold-mb', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await doctorCommand().parseAsync(
        ['--memory-health', '--warn-threshold-mb', '100', '--reject-threshold-mb', '200'],
        { from: 'user' },
      )
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { thresholds: { warnMb: number; rejectMb: number } }
    expect(envelope.ok).toBe(true)
    expect(data.thresholds.warnMb).toBe(100)
    expect(data.thresholds.rejectMb).toBe(200)
  })
})
