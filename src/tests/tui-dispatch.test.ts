import { describe, it, expect } from 'vitest'
import {
  parseCommand,
  filterCommands,
  fuzzyFilter,
  runReadCommand,
  runAsyncCommand,
  ASYNC_CMDS,
  COMMANDS,
  type CommandPort,
  type SlashCommand,
} from '../tui/dispatch.js'

describe('parseCommand — extrai cmd + args (M1q)', () => {
  it('comando sem args', () => {
    expect(parseCommand('/next')).toEqual({ cmd: 'next', args: '' })
  })
  it('comando com args preserva o restante', () => {
    expect(parseCommand('/run somar dois números')).toEqual({ cmd: 'run', args: 'somar dois números' })
  })
  it("entrada sem '/' → cmd vazio", () => {
    expect(parseCommand('oi')).toEqual({ cmd: '', args: 'oi' })
  })
})

describe('filterCommands — paleta por prefixo', () => {
  it("filtra por prefixo após '/'", () => {
    const names = filterCommands('/me').map((c) => c.name)
    expect(names).toContain('metrics')
    expect(names).not.toContain('next')
  })
  it("'/' sozinho lista todos", () => {
    expect(filterCommands('/')).toHaveLength(COMMANDS.length)
  })
  it("texto sem '/' não abre paleta", () => {
    expect(filterCommands('abc')).toEqual([])
  })
})

describe('fuzzyFilter — paleta por subsequência ordenada (#2a)', () => {
  const cmds: SlashCommand[] = [
    { name: 'metrics', usage: '/metrics', desc: '' },
    { name: 'model', usage: '/model', desc: '' },
    { name: 'next', usage: '/next', desc: '' },
  ]

  it("query 'me' retorna 'metrics' e 'model' (subsequência), exclui 'next', ordenado por relevância", () => {
    const names = fuzzyFilter('me', cmds).map((c) => c.name)
    expect(names).toEqual(['metrics', 'model']) // metrics (contíguo) antes de model
    expect(names).not.toContain('next')
  })

  it('query vazia retorna todos na ordem original', () => {
    expect(fuzzyFilter('', cmds).map((c) => c.name)).toEqual(['metrics', 'model', 'next'])
  })

  it('query sem casamento retorna vazio', () => {
    expect(fuzzyFilter('zzz', cmds)).toEqual([])
  })
})

const fakePort: CommandPort = {
  findNext: () => ({ id: 'n1', title: 'Soma', reason: 'prioridade alta' }),
  stats: () => ({ totalNodes: 5, byStatus: { done: 2, in_progress: 1 } }),
  metrics: () => ({ total: 180, costUsd: 0.0012, calls: 2 }),
  getPhase: () => 'IMPLEMENT',
  getModel: () => 'claude-sonnet-4.6',
  listSkills: () => [{ name: 'wip-one', desc: 'WIP limit', category: 'flow' }],
  getSkill: (name) => (name === 'wip-one' ? { name: 'wip-one', body: 'Keep WIP=1.' } : undefined),
  principles: () => [
    { title: 'Hipofrontalidade: λ_flow', category: 'flow', statement: 'λ_flow = λ_base + (α · Φ(t))' },
  ],
  providers: () => ['copilot', 'groq', 'ollama'],
  providerCurrent: () => 'copilot',
  providerSet: (id: string) => `✓ provider = ${id}`,
  providerSetUrl: (url: string) => (url ? `✓ endpoint = ${url}` : '✓ endpoint limpo'),
  quality: () => ({ testScore: 96, logScore: 97, passed: true, totalModules: 42, darkModules: [] }),
}

describe('runReadCommand — comandos read-only', () => {
  it('/next mostra a próxima task', () => {
    expect(runReadCommand(fakePort, parseCommand('/next'))).toContain('Soma')
  })
  it('/stats mostra contagens', () => {
    const out = runReadCommand(fakePort, parseCommand('/stats'))
    expect(out).toContain('5')
  })
  it('/metrics mostra tokens e custo', () => {
    const out = runReadCommand(fakePort, parseCommand('/metrics'))
    expect(out).toContain('180')
    expect(out).toContain('$0.0012')
  })
  it('/help lista os comandos', () => {
    const out = runReadCommand(fakePort, parseCommand('/help'))
    expect(out).toContain('/next')
    expect(out).toContain('/metrics')
  })
  it('/run e /autopilot sinalizam execução ao vivo (runner)', () => {
    expect(runReadCommand(fakePort, parseCommand('/run x'))).toMatch(/live|runner|vivo|M1r/i)
  })
  it('/phase mostra fase atual', () => {
    expect(runReadCommand(fakePort, parseCommand('/phase'))).toContain('IMPLEMENT')
  })
  it('/model mostra modelo ativo', () => {
    expect(runReadCommand(fakePort, parseCommand('/model'))).toContain('claude')
  })
  it('/skills lista skills', () => {
    expect(runReadCommand(fakePort, parseCommand('/skills'))).toContain('wip-one')
  })
  it('/skill <nome> mostra body', () => {
    expect(runReadCommand(fakePort, parseCommand('/skill wip-one'))).toContain('WIP=1')
  })
  it('comando desconhecido orienta /help', () => {
    expect(runReadCommand(fakePort, parseCommand('/foo'))).toContain('/help')
  })

  it('/principles lista os princípios (inclui λ_flow) (#T1)', () => {
    expect(runReadCommand(fakePort, parseCommand('/principles'))).toContain('λ_flow')
  })

  it('/quality mostra testScore/logScore e veredito (#T1)', () => {
    const out = runReadCommand(fakePort, parseCommand('/quality'))
    expect(out).toContain('96')
    expect(out).toContain('97')
  })
})

function makeMinimalAsyncPort(
  overrides: Partial<import('../tui/dispatch-ports.js').AsyncCommandPort> = {},
): import('../tui/dispatch-ports.js').AsyncCommandPort {
  return {
    check: async () => '',
    decompose: async () => '',
    importPrd: async () => '',
    runDoctor: async () => '',
    build: async () => '',
    generatePrd: async () => '',
    deliver: async () => '',
    gaps: async () => '',
    savings: async () => '',
    preflight: async () => '',
    brief: async () => '',
    submit: async () => '',
    providerConnect: async () => '',
    providers: () => ['copilot', 'groq'],
    providerCurrent: () => 'copilot',
    providerSet: (id: string) => `✓ provider = ${id}`,
    providerSetUrl: (url: string) => (url ? `✓ endpoint = ${url}` : '✓ endpoint limpo'),
    ...overrides,
  }
}

describe('runAsyncCommand — comandos novos (#T1)', () => {
  it('/build e /generate-prd estão em ASYNC_CMDS', () => {
    expect((ASYNC_CMDS as readonly string[]).includes('build')).toBe(true)
    expect((ASYNC_CMDS as readonly string[]).includes('generate-prd')).toBe(true)
  })

  it('/build despacha para port.build()', async () => {
    const port = makeMinimalAsyncPort({ build: async () => 'build-ok' })
    expect(await runAsyncCommand(port, parseCommand('/build'), () => {})).toBe('build-ok')
  })

  it('/generate-prd despacha para port.generatePrd() com a descrição', async () => {
    let seen = ''
    const port = makeMinimalAsyncPort({
      generatePrd: async (d: string) => {
        seen = d
        return 'prd-ok'
      },
    })
    expect(await runAsyncCommand(port, parseCommand('/generate-prd um kanban'), () => {})).toBe('prd-ok')
    expect(seen).toBe('um kanban')
  })

  it('/provider lista os providers via async (copilot, sem anthropic)', async () => {
    const port = makeMinimalAsyncPort({ providers: () => ['copilot', 'groq'], providerCurrent: () => 'copilot' })
    const out = await runAsyncCommand(port, parseCommand('/provider'), () => {})
    expect(out).toContain('copilot')
    expect(out).not.toContain('anthropic')
    expect(out).toContain('Ativo:')
  })

  it('/provider current/use/set-url roteiam para o port async', async () => {
    const port = makeMinimalAsyncPort()
    expect(await runAsyncCommand(port, parseCommand('/provider current'), () => {})).toBe('copilot')
    expect(await runAsyncCommand(port, parseCommand('/provider use groq'), () => {})).toContain('provider = groq')
    expect(await runAsyncCommand(port, parseCommand('/provider set-url http://x:1/v1'), () => {})).toContain(
      'endpoint = http://x:1/v1',
    )
  })

  it('/provider está em ASYNC_CMDS', () => {
    expect((ASYNC_CMDS as readonly string[]).includes('provider')).toBe(true)
  })
})
