import { describe, it, expect } from 'vitest'
import {
  FORMATS,
  AGENTS,
  generate,
  listFormats,
  listAgents,
  CLI_TARGETS,
  CLI_TARGET_PATHS,
  generateCliContext,
} from '../core/spec-templates/agent-format.js'

describe('agent_format', () => {
  describe('list_formats', () => {
    it('returns all 4 supported formats', () => {
      const formats = listFormats()
      expect(formats.length).toBe(4)
      expect(formats).toContain('markdown')
      expect(formats).toContain('toml')
      expect(formats).toContain('skill.md')
      expect(formats).toContain('json')
    })
  })

  describe('list_agents', () => {
    it('returns 6 agent types', () => {
      const agents = listAgents()
      expect(agents.length).toBe(6)
      expect(agents).toContain('explore')
      expect(agents).toContain('implement')
      expect(agents).toContain('review')
      expect(agents).toContain('test')
    })
  })

  describe('generate (markdown)', () => {
    it('generates markdown instructions for an agent', () => {
      const output = generate('implement', 'markdown', {
        projectName: 'my-app',
        lifecycle: 'IMPLEMENT',
        tools: ['bash', 'edit', 'glob'],
      })

      expect(output).toContain('# implement')
      expect(output).toContain('my-app')
      expect(output).toContain('IMPLEMENT')
      expect(output).toContain('bash')
    })
  })

  describe('generate (json)', () => {
    it('generates JSON instructions', () => {
      const output = generate('review', 'json', {
        projectName: 'my-app',
        lifecycle: 'REVIEW',
        tools: ['grep', 'glob'],
      })

      const parsed = JSON.parse(output)
      expect(parsed.agent).toBe('review')
      expect(parsed.project).toBe('my-app')
      expect(parsed.phase).toBe('REVIEW')
      expect(parsed.tools).toContain('grep')
    })
  })

  describe('generate (toml)', () => {
    it('generates TOML with proper sections', () => {
      const output = generate('plan', 'toml', {
        projectName: 'my-app',
        lifecycle: 'PLAN',
        tools: ['bash'],
      })

      expect(output).toContain('[agent]')
      expect(output).toContain('name = "plan"')
      expect(output).toContain('[tools]')
    })
  })

  describe('generate (skill.md)', () => {
    it('generates skill.md with frontmatter', () => {
      const output = generate('test', 'skill.md', {
        projectName: 'my-app',
        lifecycle: 'VALIDATE',
        tools: ['vitest'],
      })

      expect(output).toContain('---')
      expect(output).toContain('name: test')
      expect(output).toContain('# test')
      expect(output).toContain('my-app')
    })
  })

  describe('generateCliContext (CLI-first, zero MCP)', () => {
    it('emits a context body for every CLI target', () => {
      for (const cli of CLI_TARGETS) {
        const out = generateCliContext(cli, 'my-app')
        expect(out.length).toBeGreaterThan(0)
        expect(out).toContain('agf')
        expect(out).toContain('my-app')
      }
    })

    it('NEVER leaks MCP tool names into any CLI context', () => {
      const mcpVerbs = ['start_task', 'finish_task', 'update_status', 'mcp__mcp-graph', 'node(action', 'analyze(mode']
      for (const cli of CLI_TARGETS) {
        const out = generateCliContext(cli, 'my-app', 'full')
        for (const verb of mcpVerbs) {
          expect(out).not.toContain(verb)
        }
      }
    })

    it('maps each target to a native config path', () => {
      expect(CLI_TARGET_PATHS.claude).toBe('CLAUDE.md')
      expect(CLI_TARGET_PATHS.copilot).toBe('.github/copilot-instructions.md')
      expect(CLI_TARGET_PATHS.codex).toBe('AGENTS.md')
      expect(CLI_TARGET_PATHS.opencode).toBe('AGENTS.md')
      expect(CLI_TARGET_PATHS.cursor).toContain('.cursor')
      expect(CLI_TARGET_PATHS.windsurf).toContain('.windsurf')
      expect(CLI_TARGET_PATHS.gemini).toBe('GEMINI.md')
    })

    it('teaches command discovery (pointers) + OpenRouter economy in every CLI context', () => {
      // The full command catalog is foraged on demand (agf help / agf retrieve-command),
      // not pinned inline — see the graph-context-economy skill. The context must still
      // teach the discovery pointers and the token-economy / OpenRouter doctrine.
      const required = [
        'agf help',
        'agf retrieve-command',
        'agf preflight',
        'OpenRouter',
        'deepseek/deepseek-v4-flash',
        'Custo de token & providers',
      ]
      for (const cli of CLI_TARGETS) {
        const out = generateCliContext(cli, 'my-app', 'lean')
        for (const cmd of required) {
          expect(out, `${cli} context missing "${cmd}"`).toContain(cmd)
        }
      }
    })

    it('throws for an unknown CLI target', () => {
      expect(() => generateCliContext('vim' as never, 'x')).toThrow('Unknown CLI target')
    })
  })

  describe('edge cases', () => {
    it('generates valid output with minimal params', () => {
      const output = generate('explore', 'markdown', {
        projectName: 'min',
        lifecycle: 'ANALYZE',
      })

      expect(output.length).toBeGreaterThan(0)
    })

    it('throws for unsupported format', () => {
      expect(() =>
        generate('implement', 'xml' as any, {
          projectName: 'test',
          lifecycle: 'IMPLEMENT',
        }),
      ).toThrow('Unsupported format')
    })

    it('throws for unknown agent type', () => {
      expect(() =>
        generate('unknown' as any, 'markdown', {
          projectName: 'test',
          lifecycle: 'IMPLEMENT',
        }),
      ).toThrow('Unknown agent')
    })
  })
})
