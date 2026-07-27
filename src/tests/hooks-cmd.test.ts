/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { _resetRegisteredHooks, registerHook } from '../core/hooks/register-hook.js'
import { listHooks, discoverUnhandled, testHook, hooksCommand, runToolHookTest } from '../cli/commands/hooks-cmd.js'

describe('agf hooks — Task 3.3 logic helpers', () => {
  beforeEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
  })
  afterEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
  })

  it('listHooks returns all 29 taxonomy points with channel + owner module', () => {
    const list = listHooks()
    expect(list).toHaveLength(29)
    const llm = list.find((h) => h.point === 'pre_llm_call')
    expect(llm).toBeDefined()
    expect(llm?.channel).toBe('llm:pre-call')
    expect(llm?.module).toMatch(/^src\/core\/.+\.ts$/)
    for (const h of list) {
      expect(h.point.length).toBeGreaterThan(0)
      expect(h.channel.length).toBeGreaterThan(0)
      expect(h.module.length).toBeGreaterThan(0)
    }
  })

  it('discoverUnhandled lists channels with no registered handler', () => {
    const before = discoverUnhandled()
    expect(before).toContain('cache:hit')
    registerHook('cache:hit', () => {})
    const after = discoverUnhandled()
    expect(after).not.toContain('cache:hit')
  })

  it('testHook dry-fires the channel and reports how many handlers fired', () => {
    let fired = 0
    registerHook('gate:check', () => {
      fired++
    })
    const result = testHook('gate:check')
    expect(result.channel).toBe('gate:check')
    expect(result.handlersFired).toBe(1)
    expect(fired).toBe(1)
  })

  it('testHook on an unknown channel throws', () => {
    expect(() => testHook('does:not-exist')).toThrow()
  })
})

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf hooks stats (node_wire_7c1539516c86)', () => {
  beforeEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
  })
  afterEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
  })

  it('reports call counts for a fired handler', async () => {
    registerHook('gate:check', () => {}, { id: 'my-gate' })
    testHook('gate:check')

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await hooksCommand().parseAsync(['stats'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { stats: Array<{ handlerId: string; callCount: number }> }
    expect(envelope.ok).toBe(true)
    expect(data.stats.find((s) => s.handlerId === 'my-gate')?.callCount).toBe(1)
  })

  it('returns an empty stats array when no handler has ever fired', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await hooksCommand().parseAsync(['stats'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { stats: unknown[] }
    expect(envelope.ok).toBe(true)
    expect(data.stats).toEqual([])
  })
})

describe('agf hooks import-claude-code (node_wire_4d0a650e1d68)', () => {
  it('imports PreToolUse/SessionEnd blocks from a settings.json fixture into hooks.json', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    const settingsDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-settings-'))
    try {
      const settingsPath = join(settingsDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
            SessionEnd: [{ hooks: [{ type: 'command', command: 'echo end' }] }],
            Notification: [{ hooks: [{ type: 'command', command: 'echo notify' }] }],
          },
        }),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-claude-code', '--source', settingsPath, '-d', projectDir], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; skipped: Array<{ event: string }>; addedCount: number }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(2)
      expect(data.addedCount).toBe(2)
      expect(data.skipped.some((s) => s.event === 'Notification')).toBe(true)

      const configPath = join(projectDir, '.mcp-graph', 'hooks.json')
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(cfg.hooks['tool:pre-call']).toBeDefined()
      expect(cfg.hooks['session:end']).toBeDefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(settingsDir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks import-aider (node_wire_c4b0494e5c76)', () => {
  it('imports lint-cmd/test-cmd from a .aider.conf.yml fixture into hooks.json', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    const settingsDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-settings-'))
    try {
      const settingsPath = join(settingsDir, '.aider.conf.yml')
      writeFileSync(settingsPath, ['lint-cmd: "eslint ."', 'test-cmd: "npm test"', 'auto-commits: true', ''].join('\n'))

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-aider', '--source', settingsPath, '-d', projectDir], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; skipped: Array<{ event: string }>; addedCount: number }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(2)
      expect(data.addedCount).toBe(2)
      expect(data.skipped.some((s) => s.event === 'auto-commits')).toBe(true)

      const configPath = join(projectDir, '.mcp-graph', 'hooks.json')
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(cfg.hooks['tool:post-call']).toBeDefined()
      expect(cfg.hooks['task:post-complete']).toBeDefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(settingsDir, { recursive: true, force: true })
    }
  })

  it('reports a friendly skip when .aider.conf.yml does not exist', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(
          ['import-aider', '--source', join(projectDir, 'does-not-exist.yml'), '-d', projectDir],
          { from: 'user' },
        )
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(0)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks import-cline (node_wire_b2767031063c)', () => {
  it('reports configured MCP server names from a VS Code settings.json fixture', async () => {
    const settingsDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-settings-'))
    try {
      const settingsPath = join(settingsDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          'cline.mcpServers': { github: {}, filesystem: {} },
        }),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-cline', '--source', settingsPath], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; mcpServers: string[]; skipped: Array<{ reason: string }> }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(0)
      expect(data.mcpServers.sort()).toEqual(['filesystem', 'github'])
      expect(data.skipped[0].reason).toContain('no hook lifecycle')
    } finally {
      rmSync(settingsDir, { recursive: true, force: true })
    }
  })

  it('reports a friendly skip when settings.json does not exist', async () => {
    const settingsDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-settings-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-cline', '--source', join(settingsDir, 'does-not-exist.json')], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; mcpServers: string[] }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(0)
      expect(data.mcpServers).toEqual([])
    } finally {
      rmSync(settingsDir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks import-codex (node_wire_d936905aa680)', () => {
  it('imports notify/inspect.prompt/inspect.tool_call from a ~/.codex/config.toml fixture', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    const settingsDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-settings-'))
    try {
      const settingsPath = join(settingsDir, 'config.toml')
      writeFileSync(
        settingsPath,
        [
          '[hooks]',
          'notify = "/path/to/notify.sh"',
          '',
          '[hooks.inspect]',
          'prompt = "/path/to/prompt-inspect.sh"',
          'tool_call = "/path/to/tool-inspect.sh"',
          '',
        ].join('\n'),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-codex', '--source', settingsPath, '-d', projectDir], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; addedCount: number }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(3)
      expect(data.addedCount).toBe(3)

      const configPath = join(projectDir, '.mcp-graph', 'hooks.json')
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(cfg.hooks['task:post-complete']).toBeDefined()
      expect(cfg.hooks['task:pre-execute']).toBeDefined()
      expect(cfg.hooks['tool:pre-call']).toBeDefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(settingsDir, { recursive: true, force: true })
    }
  })

  it('reports a friendly skip when config.toml does not exist', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(
          ['import-codex', '--source', join(projectDir, 'does-not-exist.toml'), '-d', projectDir],
          { from: 'user' },
        )
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(0)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks import-continue (node_wire_76e645dc92cd)', () => {
  it('reports configured MCP server names from a ~/.continue/config.json fixture', async () => {
    const settingsDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-settings-'))
    try {
      const settingsPath = join(settingsDir, 'config.json')
      writeFileSync(settingsPath, JSON.stringify({ mcpServers: { github: {}, postgres: {} } }))

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-continue', '--source', settingsPath], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; mcpServers: string[]; skipped: Array<{ reason: string }> }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(0)
      expect(data.mcpServers.sort()).toEqual(['github', 'postgres'])
      expect(data.skipped[0].reason).toContain('no hook lifecycle')
    } finally {
      rmSync(settingsDir, { recursive: true, force: true })
    }
  })

  it('reports a friendly skip when config.json does not exist', async () => {
    const settingsDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-settings-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-continue', '--source', join(settingsDir, 'does-not-exist.json')], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; mcpServers: string[] }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(0)
      expect(data.mcpServers).toEqual([])
    } finally {
      rmSync(settingsDir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks import-copilot (node_wire_b36b363fe69e)', () => {
  it('imports PreToolUse/PostToolUse blocks from .github/hooks/*.json fixtures', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    const hooksDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-copilot-'))
    try {
      writeFileSync(
        join(hooksDir, 'bash-guard.json'),
        JSON.stringify({ type: 'block', event: 'PreToolUse', matcher: 'Bash', command: './guard.sh' }),
      )
      writeFileSync(
        join(hooksDir, 'post.json'),
        JSON.stringify({ hooks: [{ type: 'inspect', event: 'PostToolUse', command: './log.sh' }] }),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-copilot', '--source', hooksDir, '-d', projectDir], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; addedCount: number }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(2)
      expect(data.addedCount).toBe(2)

      const configPath = join(projectDir, '.mcp-graph', 'hooks.json')
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(cfg.hooks['tool:pre-call']).toBeDefined()
      expect(cfg.hooks['tool:post-call']).toBeDefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(hooksDir, { recursive: true, force: true })
    }
  })

  it('reports a friendly skip when .github/hooks/ does not exist', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(
          ['import-copilot', '--source', join(projectDir, 'does-not-exist'), '-d', projectDir],
          { from: 'user' },
        )
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(0)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks add-shell (node_wire_85cf06ecacc3)', () => {
  it('generates the default shell hooks and merges them into hooks.json', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-add-shell-project-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['add-shell', '-d', projectDir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { generated: number; addedCount: number; provider: string }
      expect(envelope.ok).toBe(true)
      expect(data.generated).toBe(4)
      expect(data.addedCount).toBe(4)
      expect(data.provider).toBe('mcp-graph')

      const configPath = join(projectDir, '.mcp-graph', 'hooks.json')
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(cfg.hooks['session:start']).toBeDefined()
      expect(cfg.hooks['session:start'][0].command).toBe('agf')
      expect(cfg.hooks['tool:pre-call']).toBeDefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it('respects --cli-path, --channels and --agent-source overrides', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-add-shell-project-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(
          [
            'add-shell',
            '-d',
            projectDir,
            '--cli-path',
            '/usr/local/bin/agf',
            '--channels',
            'session:start,session:end',
            '--agent-source',
            'opencode',
          ],
          { from: 'user' },
        )
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { generated: number; addedCount: number }
      expect(envelope.ok).toBe(true)
      expect(data.generated).toBe(2)
      expect(data.addedCount).toBe(2)

      const configPath = join(projectDir, '.mcp-graph', 'hooks.json')
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(cfg.hooks['session:start'][0].command).toBe('/usr/local/bin/agf')
      expect(cfg.hooks['session:start'][0].agentSource).toBe('opencode')
      expect(cfg.hooks['tool:pre-call']).toBeUndefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it('rejects an unknown --agent-source', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-add-shell-project-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['add-shell', '-d', projectDir, '--agent-source', 'not-a-real-cli'], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      expect(envelope.ok).toBe(false)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks import-cursor (node_wire_d8da8d3f6e34)', () => {
  it('persists .cursor/rules content as a cursor-rules memory', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    const cursorDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-cursor-'))
    try {
      const rulesPath = join(cursorDir, 'rules')
      writeFileSync(rulesPath, 'Always use TypeScript strict mode. Never use any.')

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-cursor', '--source', rulesPath, '-d', projectDir], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; memoryName: string | null }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(1)
      expect(data.memoryName).toBe('cursor-rules')

      const memoryPath = join(projectDir, 'workflow-graph', 'memories', 'cursor-rules.md')
      expect(readFileSync(memoryPath, 'utf-8')).toContain('Always use TypeScript strict mode')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(cursorDir, { recursive: true, force: true })
    }
  })

  it('reports imported:0 and writes no memory when .cursor/rules does not exist', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(
          ['import-cursor', '--source', join(projectDir, 'does-not-exist'), '-d', projectDir],
          { from: 'user' },
        )
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; memoryName: string | null }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(0)
      expect(data.memoryName).toBeNull()

      const memoryPath = join(projectDir, 'workflow-graph', 'memories', 'cursor-rules.md')
      expect(existsSync(memoryPath)).toBe(false)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks import-opencode (node_wire_74d99c562228)', () => {
  it('imports pre-tool/post-tool/session.start/session.end blocks from a config.toml fixture', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    const settingsDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-settings-'))
    try {
      const settingsPath = join(settingsDir, 'config.toml')
      writeFileSync(
        settingsPath,
        [
          '[hooks]',
          'pre-tool = "/path/to/pre.sh"',
          'post-tool = "/path/to/post.sh"',
          '',
          '[hooks.session]',
          'start = "/path/to/session-start.sh"',
          'end = "/path/to/session-end.sh"',
          '',
        ].join('\n'),
      )

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(['import-opencode', '--source', settingsPath, '-d', projectDir], {
          from: 'user',
        })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number; addedCount: number; pluginsDiscovered: string[] }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(4)
      expect(data.addedCount).toBe(4)
      // pluginsDiscovered scans the real ~/.config/opencode/plugins + cwd/.opencode/plugins
      // dirs (no CLI override exists yet) — environment-dependent, so only assert the shape.
      expect(Array.isArray(data.pluginsDiscovered)).toBe(true)

      const configPath = join(projectDir, '.mcp-graph', 'hooks.json')
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(cfg.hooks['tool:pre-call']).toBeDefined()
      expect(cfg.hooks['tool:post-call']).toBeDefined()
      expect(cfg.hooks['session:start']).toBeDefined()
      expect(cfg.hooks['session:end']).toBeDefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(settingsDir, { recursive: true, force: true })
    }
  })

  it('reports a friendly skip when config.toml does not exist', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'agf-hooks-import-project-'))
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(
          ['import-opencode', '--source', join(projectDir, 'does-not-exist.toml'), '-d', projectDir],
          { from: 'user' },
        )
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { imported: number }
      expect(envelope.ok).toBe(true)
      expect(data.imported).toBe(0)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})

describe('agf hooks tool-test (node_wire_25b826823356)', () => {
  function writeFixtureScript(body: string): string {
    const scriptPath = join(tmpdir(), `agf-hooks-tool-test-${Math.random().toString(36).slice(2)}.sh`)
    writeFileSync(scriptPath, `#!/bin/sh\n${body}\n`)
    chmodSync(scriptPath, 0o755)
    return scriptPath
  }

  it('runToolHookTest returns allow:true when the registered hook allows', async () => {
    const scriptPath = writeFixtureScript(`echo '{"allow":true}'`)
    try {
      const result = await runToolHookTest({ tool: 'Bash', event: 'PreToolUse', command: scriptPath })
      expect(result.allow).toBe(true)
      expect(result.tool).toBe('Bash')
      expect(result.event).toBe('PreToolUse')
    } finally {
      rmSync(scriptPath, { force: true })
    }
  })

  it('runToolHookTest returns allow:false when the registered hook denies', async () => {
    const scriptPath = writeFixtureScript(`echo '{"allow":false}'`)
    try {
      const result = await runToolHookTest({ tool: 'Bash', event: 'PreToolUse', command: scriptPath })
      expect(result.allow).toBe(false)
    } finally {
      rmSync(scriptPath, { force: true })
    }
  })

  it('runToolHookTest rejects an unknown event', async () => {
    await expect(runToolHookTest({ tool: 'Bash', event: 'NotAnEvent', command: 'echo' })).rejects.toThrow()
  })

  it('agf hooks tool-test dry-fires a PostToolUse hook via the CLI', async () => {
    const scriptPath = writeFixtureScript(`echo '{"allow":true}'`)
    try {
      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await hooksCommand().parseAsync(
          ['tool-test', '--tool', 'Bash', '--event', 'PostToolUse', '--command', scriptPath],
          { from: 'user' },
        )
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { allow: boolean; tool: string; event: string }
      expect(envelope.ok).toBe(true)
      expect(data.allow).toBe(true)
      expect(data.tool).toBe('Bash')
      expect(data.event).toBe('PostToolUse')
    } finally {
      rmSync(scriptPath, { force: true })
    }
  })

  it('agf hooks tool-test reports an error envelope for an invalid --event', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await hooksCommand().parseAsync(['tool-test', '--tool', 'Bash', '--event', 'NotAnEvent', '--command', 'echo'], {
        from: 'user',
      })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(false)
  })
})
