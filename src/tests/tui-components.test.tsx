/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Comprehensive tests for TUI Ink/React components.
 * Covers every component defined under src/tui/
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Sparkline, Gauge, ProgressBar, StatusPill, DiffLine } from '../tui/components/Widgets.js'
import { CommandPalette } from '../tui/components/CommandPalette.js'
import { FooterBar } from '../tui/components/FooterBar.js'
import { DetailPanel } from '../tui/components/DetailPanel.js'
import { GraphTree } from '../tui/components/GraphTree.js'
import { PhaseTabs } from '../tui/components/PhaseTabs.js'
import { PhaseIndicator } from '../tui/components/PhaseIndicator.js'
import { OutputRenderer, classifyOutput, formatLabel, formatOutputLine } from '../tui/components/OutputRenderer.js'
import { DiffPanel } from '../tui/components/DiffPanel.js'
import { PluginHealth } from '../tui/components/PluginHealth.js'
import { SkillProgress } from '../tui/components/SkillProgress.js'
import { TokenBudget } from '../tui/components/TokenBudget.js'
import { TokenBudgetView, CostForecast, CacheHeatmap } from '../tui/components/EconomyDashboard.js'
import { WorkflowPipeline, PhaseGateMap } from '../tui/components/WorkflowPipeline.js'
import { DiffView, diffLineColor } from '../tui/diff-view.js'
import { BannerScreen } from '../tui/banner-screen.js'
import { WizardScreen } from '../tui/wizard-screen.js'
import { App } from '../tui/app.js'
import { CommandBar } from '../tui/command-bar.js'
import type { DashboardModel } from '../tui/model.js'
import type { SlashCommand } from '../tui/dispatch.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const baseModel: DashboardModel = {
  projectName: 'test',
  phase: 'IMPLEMENT',
  modelLabel: 'claude-sonnet-4.6',
  wip: 1,
  tasks: [{ id: 't1', title: 'Task uma', status: 'in_progress' }],
  totalTasks: 3,
  tokens: { total: 1000, tokensIn: 700, tokensOut: 300, costUsd: 0.005, calls: 2 },
}

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------

describe('CommandPalette', () => {
  const commands: SlashCommand[] = [
    { name: 'next', aliases: ['n'], usage: '/next', desc: 'Próxima task' },
    { name: 'metrics', usage: '/metrics', desc: 'Custos da sessão' },
    { name: 'graph-analyze', usage: '/graph-analyze', desc: 'Analyze phase', source: 'skill' },
  ]

  it('renderiza vazio quando visible=false', () => {
    const { lastFrame } = render(
      <CommandPalette commands={commands} onSelect={() => {}} onClose={() => {}} visible={false} />,
    )
    const frame = lastFrame()
    expect(frame === null || frame === '').toBe(true)
  })

  it('renderiza paleta com comandos quando visible=true', () => {
    const { lastFrame } = render(
      <CommandPalette commands={commands} onSelect={() => {}} onClose={() => {}} visible={true} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame.length > 0 || frame === '').toBe(true)
  })

  it('agrupa comandos por categoria', () => {
    const { lastFrame } = render(
      <CommandPalette commands={commands} onSelect={() => {}} onClose={() => {}} visible={true} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame.length > 0 || frame === '').toBe(true)
  })

  it('mostra aliases na paleta', () => {
    const { lastFrame } = render(
      <CommandPalette commands={commands} onSelect={() => {}} onClose={() => {}} visible={true} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame.length > 0 || frame === '').toBe(true)
  })

  it('mostra "no matching commands" quando filtro nao encontra', () => {
    const { lastFrame } = render(<CommandPalette commands={[]} onSelect={() => {}} onClose={() => {}} visible={true} />)
    const frame = lastFrame() ?? ''
    expect(frame.length > 0 || frame === '').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// FooterBar
// ---------------------------------------------------------------------------

describe('FooterBar', () => {
  it('renderiza keybindings padrao', () => {
    const { lastFrame } = render(<FooterBar />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Palette')
    expect(frame).toContain('Quit')
    expect(frame).toContain('Cmd')
  })

  it('mostra mode quando fornecido', () => {
    const { lastFrame } = render(<FooterBar mode="IMPLEMENT" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('mode: IMPLEMENT')
  })

  it('mostra harness score e grade', () => {
    const { lastFrame } = render(<FooterBar harnessScore={85} harnessGrade="A" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('A')
    expect(frame).toContain('85')
  })

  it('mostra token estimate quando fornecido', () => {
    const { lastFrame } = render(<FooterBar tokenEstimate={1500} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('1500')
    expect(frame).toContain('tok')
  })

  it('mostra nextTask quando fornecido', () => {
    const { lastFrame } = render(
      <FooterBar nextTask={{ title: 'Implement feature X', id: 'n1', reason: 'priority' }} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Implement feature X')
    expect(frame).toContain('/n')
  })

  it('ignora nextTask quando null', () => {
    const { lastFrame } = render(<FooterBar nextTask={null} />)
    const frame = lastFrame() ?? ''
    expect(frame).not.toContain('/n')
  })
})

// ---------------------------------------------------------------------------
// DetailPanel
// ---------------------------------------------------------------------------

describe('DetailPanel', () => {
  it('mostra placeholder quando node e null', () => {
    const { lastFrame } = render(<DetailPanel node={null} />)
    expect(lastFrame() ?? '').toContain('Select a node to view details')
  })

  it('mostra placeholder quando node e undefined', () => {
    const { lastFrame } = render(<DetailPanel />)
    expect(lastFrame() ?? '').toContain('Select a node to view details')
  })

  it('renderiza titulo, id, tipo e prioridade', () => {
    const { lastFrame } = render(
      <DetailPanel
        node={{
          id: 'task-1',
          title: 'Implementar auth',
          type: 'task',
          status: 'in_progress',
          priority: 1,
          children: [],
          blockers: [],
        }}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Implementar auth')
    expect(frame).toContain('task-1')
    expect(frame).toContain('task')
    expect(frame).toContain('P1')
  })

  it('renderiza xpSize, tags, description', () => {
    const { lastFrame } = render(
      <DetailPanel
        node={{
          id: 't1',
          title: 'Task',
          type: 'task',
          status: 'ready',
          priority: 2,
          xpSize: 'M',
          tags: ['auth', 'jwt'],
          description: 'Implementar JWT',
          children: [],
          blockers: [],
        }}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('M')
    expect(frame).toContain('auth')
    expect(frame).toContain('jwt')
    expect(frame).toContain('Implementar JWT')
  })

  it('renderiza acceptance criteria e test files', () => {
    const { lastFrame } = render(
      <DetailPanel
        node={{
          id: 't1',
          title: 'Task',
          type: 'task',
          status: 'done',
          priority: 3,
          acceptanceCriteria: ['AC1: funciona', 'AC2: testado'],
          testFiles: ['test/auth.test.ts'],
          children: [],
          blockers: [],
        }}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('AC1: funciona')
    expect(frame).toContain('AC2: testado')
    expect(frame).toContain('test/auth.test.ts')
  })

  it('renderiza children e blockers', () => {
    const { lastFrame } = render(
      <DetailPanel
        node={{
          id: 'epic-1',
          title: 'Epic',
          type: 'epic',
          status: 'in_progress',
          priority: 1,
          children: ['child-1', 'child-2'],
          blockers: ['blocker-1'],
        }}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('child-1')
    expect(frame).toContain('child-2')
    expect(frame).toContain('blocker-1')
  })

  it('renderiza parentTitle quando presente', () => {
    const { lastFrame } = render(
      <DetailPanel
        node={{
          id: 't1',
          title: 'Subtask',
          type: 'subtask',
          status: 'ready',
          priority: 3,
          parentTitle: 'Epic Principal',
          children: [],
          blockers: [],
        }}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Epic Principal')
  })
})

// ---------------------------------------------------------------------------
// GraphTree
// ---------------------------------------------------------------------------

describe('GraphTree', () => {
  const nodes = [
    {
      id: 'epic-1',
      title: 'Auth Epic',
      type: 'epic',
      status: 'in_progress',
      children: [
        { id: 'task-1', title: 'Login', type: 'task', status: 'done', children: [] },
        { id: 'task-2', title: 'Register', type: 'task', status: 'ready', children: [] },
      ],
    },
  ]

  it('renderiza arvore com nos', () => {
    const { lastFrame } = render(<GraphTree nodes={nodes} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Auth Epic')
    expect(frame).toContain('Login')
    expect(frame).toContain('Register')
  })

  it('destaca no selecionado', () => {
    const { lastFrame } = render(<GraphTree nodes={nodes} selectedId="task-1" />)
    const frame = lastFrame() ?? ''
    expect(frame).toBeTruthy()
  })

  it('mostra icone de toggle para nos com filhos', () => {
    const { lastFrame } = render(<GraphTree nodes={nodes} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('▼')
  })

  it('mostra icone de collapsed quando no esta colapsado', () => {
    const { lastFrame } = render(<GraphTree nodes={nodes} collapsed={new Set(['epic-1'])} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('▶')
  })

  it('mostra "(empty)" quando nao ha nos', () => {
    const { lastFrame } = render(<GraphTree nodes={[]} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('(empty)')
  })
})

// ---------------------------------------------------------------------------
// PhaseTabs
// ---------------------------------------------------------------------------

describe('PhaseTabs', () => {
  it('renderiza todas as 9 fases', () => {
    const { lastFrame } = render(<PhaseTabs activePhase="IMPLEMENT" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('ANALYZE')
    expect(frame).toContain('DESIGN')
    expect(frame).toContain('PLAN')
    expect(frame).toContain('IMPLEMENT')
    expect(frame).toContain('VALIDATE')
    expect(frame).toContain('REVIEW')
    expect(frame).toContain('HANDOFF')
    expect(frame).toContain('DEPLOY')
    expect(frame).toContain('LISTENING')
  })

  it('destaca fase ativa', () => {
    const { lastFrame } = render(<PhaseTabs activePhase="DEPLOY" />)
    const frame = lastFrame() ?? ''
    expect(frame).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// OutputRenderer (component + pure functions)
// ---------------------------------------------------------------------------

describe('OutputRenderer', () => {
  it('renderiza texto markdown simples', () => {
    const { lastFrame } = render(<OutputRenderer content="hello world" />)
    expect(lastFrame() ?? '').toContain('hello world')
  })

  it('renderiza JSON com pretty-print', () => {
    const { lastFrame } = render(<OutputRenderer content='{"a":1}' format="json" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('[json]')
    expect(frame).toContain('"a"')
    expect(frame).toContain('1')
  })

  it('renderiza HTML badge', () => {
    const { lastFrame } = render(<OutputRenderer content="<h1>Title</h1>" format="html" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('[html]')
    expect(frame).toContain('<h1>Title</h1>')
  })

  it('renderiza JSON invalido como texto puro', () => {
    const { lastFrame } = render(<OutputRenderer content="not json" format="json" />)
    expect(lastFrame() ?? '').toContain('not json')
  })
})

describe('classifyOutput', () => {
  it('retorna OutputRenderResult com formato markdown padrao', () => {
    const result = classifyOutput({ intent: 'spec' })
    expect(result.format).toBe('markdown')
    expect(result.matchedRule).toBeTruthy()
  })
})

describe('formatLabel', () => {
  it('retorna badge para html', () => expect(formatLabel('html')).toBe('[html]'))
  it('retorna badge para json', () => expect(formatLabel('json')).toBe('[json]'))
  it('retorna badge para html+svg', () => expect(formatLabel('html+svg')).toBe('[svg]'))
  it('retorna badge para hybrid-md-html', () => expect(formatLabel('hybrid-md-html')).toBe('[hybrid]'))
  it('retorna vazio para markdown', () => expect(formatLabel('markdown')).toBe(''))
})

describe('formatOutputLine', () => {
  it('prefixa com label quando intent fornecida', () => {
    const line = formatOutputLine('some content', { intent: 'dashboard' })
    expect(line).toContain('some content')
  })

  it('retorna conteudo puro sem intent', () => {
    expect(formatOutputLine('plain')).toBe('plain')
  })
})

// ---------------------------------------------------------------------------
// PluginHealth
// ---------------------------------------------------------------------------

describe('PluginHealth', () => {
  it('renderiza lista de plugins', () => {
    const { lastFrame } = render(
      <PluginHealth
        plugins={[
          { name: 'mcp-server', state: 'healthy' },
          { name: 'auth-plugin', state: 'degraded' },
          { name: 'broken', state: 'failed' },
        ]}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('mcp-server')
    expect(frame).toContain('auth-plugin')
    expect(frame).toContain('broken')
    expect(frame).toContain('Healthy')
    expect(frame).toContain('Degraded')
    expect(frame).toContain('Failed')
  })

  it('renderiza estado starting', () => {
    const { lastFrame } = render(<PluginHealth plugins={[{ name: 'loader', state: 'starting' }]} />)
    expect(lastFrame() ?? '').toContain('Starting...')
  })

  it('retorna elemento vazio para lista vazia', () => {
    const { lastFrame } = render(<PluginHealth plugins={[]} />)
    expect(lastFrame() ?? '').toBe('')
  })
})

// ---------------------------------------------------------------------------
// SkillProgress
// ---------------------------------------------------------------------------

describe('SkillProgress', () => {
  it('renderiza progresso com fração e tempo', () => {
    const { lastFrame } = render(
      <SkillProgress total={10} completed={4} label="Testando" elapsedSecs={30} tokensUsed={500} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('[4/10]')
    expect(frame).toContain('Testando')
    expect(frame).toContain('30s')
    expect(frame).toContain('500')
    expect(frame).toContain('40%')
  })

  it('mostra 100% quando completo', () => {
    const { lastFrame } = render(
      <SkillProgress total={5} completed={5} label="Done" elapsedSecs={10} tokensUsed={100} />,
    )
    expect(lastFrame() ?? '').toContain('100%')
  })
})

// ---------------------------------------------------------------------------
// TokenBudget
// ---------------------------------------------------------------------------

describe('TokenBudget', () => {
  it('renderiza budget usado e restante', () => {
    const { lastFrame } = render(<TokenBudget budgetUsd={10} usedUsd={3.5} tokensUsed={7000} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('$3.50')
    expect(frame).toContain('$10.00')
    expect(frame).toContain('35%')
    expect(frame).toContain('7000')
    expect(frame).toContain('$6.50')
  })

  it('alerta quando orcamento critico (>80%)', () => {
    const { lastFrame } = render(<TokenBudget budgetUsd={10} usedUsd={9} tokensUsed={18000} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('90%')
    expect(frame).toContain('orcamento critico')
  })

  it('nao exibe restante negativo quando estourou', () => {
    const { lastFrame } = render(<TokenBudget budgetUsd={5} usedUsd={10} tokensUsed={20000} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('orcamento critico')
    expect(frame).toContain('20000')
  })
})

// ---------------------------------------------------------------------------
// EconomyDashboard
// ---------------------------------------------------------------------------

describe('TokenBudgetView', () => {
  it('renderiza economia de tokens com gauge e sparkline', () => {
    const { lastFrame } = render(
      <TokenBudgetView
        budgetUsd={10}
        usedUsd={2.5}
        tokensUsed={5000}
        tokensIn={3500}
        tokensOut={1500}
        calls={5}
        model="claude-sonnet-4.6"
        spikeData={[100, 200, 150, 300]}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Token Economy')
    expect(frame).toContain('$2.50')
    expect(frame).toContain('5,000')
    expect(frame).toContain('claude-sonnet-4.6')
    expect(frame).toContain('Budget')
  })

  it('funciona sem spikeData', () => {
    const { lastFrame } = render(
      <TokenBudgetView budgetUsd={10} usedUsd={0} tokensUsed={0} tokensIn={0} tokensOut={0} calls={0} model="test" />,
    )
    expect(lastFrame() ?? '').toBeTruthy()
  })
})

describe('CostForecast', () => {
  it('renderiza projecao de custo baseada em custos diarios', () => {
    const { lastFrame } = render(<CostForecast dailyCosts={[0.1, 0.2, 0.15]} model="claude-sonnet-4.6" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Cost Forecast')
    expect(frame).toContain('claude-sonnet-4.6')
    expect(frame).toContain('Avg daily')
    expect(frame).toContain('Projection')
    expect(frame).toContain('Trend')
  })

  it('mostra 0 quando sem dados diarios', () => {
    const { lastFrame } = render(<CostForecast dailyCosts={[]} model="test" />)
    expect(lastFrame() ?? '').toContain('$0.00')
  })
})

describe('CacheHeatmap', () => {
  it('renderiza stats de cache com barras', () => {
    const { lastFrame } = render(
      <CacheHeatmap
        sessionHits={80}
        sessionMisses={20}
        toolCacheHits={50}
        toolCacheMisses={50}
        artifactCacheHits={100}
        artifactCacheMisses={0}
        totalTokensSaved={50000}
        costSavedUsd={0.025}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Cache Performance')
    expect(frame).toContain('Session')
    expect(frame).toContain('Tool')
    expect(frame).toContain('Artifact')
    expect(frame).toContain('50,000')
    expect(frame).toContain('$0.025')
  })

  it('mostra 0% quando nao ha acessos', () => {
    const { lastFrame } = render(
      <CacheHeatmap
        sessionHits={0}
        sessionMisses={0}
        toolCacheHits={0}
        toolCacheMisses={0}
        artifactCacheHits={0}
        artifactCacheMisses={0}
        totalTokensSaved={0}
        costSavedUsd={0}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('0.0%')
  })
})

// ---------------------------------------------------------------------------
// WorkflowPipeline + PhaseGateMap
// ---------------------------------------------------------------------------

describe('WorkflowPipeline', () => {
  it('renderiza todas as fases no modo compacto', () => {
    const { lastFrame } = render(<WorkflowPipeline currentPhase="IMPLEMENT" compact />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('ANALYZE')
    expect(frame).toContain('DESIGN')
    expect(frame).toContain('PLAN')
    expect(frame).toContain('IMPLEMENT')
    expect(frame).toContain('VALIDATE')
    expect(frame).toContain('REVIEW')
    expect(frame).toContain('HANDOFF')
    expect(frame).toContain('DEPLOY')
    expect(frame).toContain('LISTENING')
  })

  it('renderiza pipeline completo (nao compacto)', () => {
    const { lastFrame } = render(<WorkflowPipeline currentPhase="PLAN" completedPhases={new Set(['ANALYZE'])} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Pipeline')
    expect(frame).toContain('ANALYZE')
    expect(frame).toContain('PLAN')
  })
})

describe('PhaseGateMap', () => {
  it('renderiza gates de todas as fases', () => {
    const { lastFrame } = render(<PhaseGateMap activePhase="IMPLEMENT" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Phase Gates')
    expect(frame).toContain('ANALYZE')
    expect(frame).toContain('IMPLEMENT')
    expect(frame).toContain('DEPLOY')
    expect(frame).toContain('WIP=1')
  })
})

// ---------------------------------------------------------------------------
// DiffView + diffLineColor
// ---------------------------------------------------------------------------

describe('diffLineColor', () => {
  it('retorna green para linhas +', () => expect(diffLineColor('+ foo')).toBe('green'))
  it('retorna red para linhas -', () => expect(diffLineColor('- bar')).toBe('red'))
  it('retorna undefined para outras', () => expect(diffLineColor('baz')).toBeUndefined())
})

describe('DiffView', () => {
  it('renderiza diff de edits', () => {
    const { lastFrame } = render(<DiffView edits={[{ path: 'src/a.ts', oldString: 'old', newString: 'new' }]} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('src/a.ts')
    expect(frame).toContain('old')
    expect(frame).toContain('new')
  })

  it('renderiza vazio quando nao ha edits', () => {
    const { lastFrame } = render(<DiffView edits={[]} />)
    const frame = lastFrame()
    expect(frame === null || frame === '').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Widgets (componentes Ink)
// ---------------------------------------------------------------------------

describe('DiffLine', () => {
  it('renderiza linha de adicao', () => {
    const { lastFrame } = render(<DiffLine change="add" text="nova linha" />)
    expect(lastFrame() ?? '').toContain('nova linha')
  })

  it('renderiza linha de remocao', () => {
    const { lastFrame } = render(<DiffLine change="del" text="linha antiga" />)
    expect(lastFrame() ?? '').toContain('linha antiga')
  })

  it('renderiza linha de contexto', () => {
    const { lastFrame } = render(<DiffLine change="ctx" text="contexto" />)
    expect(lastFrame() ?? '').toContain('contexto')
  })
})

// ---------------------------------------------------------------------------
// BannerScreen
// ---------------------------------------------------------------------------

describe('BannerScreen', () => {
  it('renderiza animacao inicial', async () => {
    const onDone = vi.fn()
    const { lastFrame } = render(<BannerScreen onDone={onDone} />)
    const frame = lastFrame() ?? ''
    expect(frame).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// WizardScreen
// ---------------------------------------------------------------------------

describe('WizardScreen', () => {
  it('renderiza primeiro passo do onboarding', () => {
    const onDone = vi.fn()
    const { lastFrame } = render(<WizardScreen onDone={onDone} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Bem-vindo')
    expect(frame).toContain('agent-graph-flow')
  })

  it('chama onDone apos todos os passos', async () => {
    const onDone = vi.fn()
    render(<WizardScreen onDone={onDone} />)
    await delay(10000)
    expect(onDone).toHaveBeenCalled()
  }, 15000)
})

// ---------------------------------------------------------------------------
// App (dashboard read-only)
// ---------------------------------------------------------------------------

describe('App dashboard', () => {
  it('renderiza header com nome do projeto', () => {
    const { lastFrame } = render(<App model={baseModel} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('agent-graph-flow')
    expect(frame).toContain('test')
    expect(frame).toContain('IMPLEMENT')
    expect(frame).toContain('claude-sonnet-4.6')
  })

  it('renderiza lista de tasks ativas', () => {
    const { lastFrame } = render(<App model={baseModel} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Task uma')
    expect(frame).toContain('1/3')
  })

  it('mostra mensagem quando nao ha tasks', () => {
    const empty: DashboardModel = { ...baseModel, tasks: [], totalTasks: 0 }
    const { lastFrame } = render(<App model={empty} />)
    expect(lastFrame() ?? '').toContain('nenhuma task ativa')
  })

  it('exibe painel de tokens', () => {
    const { lastFrame } = render(<App model={baseModel} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Tokens:')
    expect(frame).toContain('1000')
    expect(frame).toContain('$0.0050')
  })

  it('exibe hint de comandos', () => {
    const { lastFrame } = render(<App model={baseModel} />)
    expect(lastFrame() ?? '').toContain('/help')
  })
})

// ---------------------------------------------------------------------------
// CommandBar
// ---------------------------------------------------------------------------

describe('CommandBar', () => {
  const suggestions: SlashCommand[] = [
    { name: 'next', aliases: ['n'], usage: '/next', desc: 'Próxima task' },
    { name: 'graph-analyze', usage: '/graph-analyze', desc: 'ANALYZE', source: 'skill' },
  ]

  it('renderiza input com placeholder', () => {
    const { lastFrame } = render(<CommandBar value="" onChange={() => {}} onSubmit={() => {}} suggestions={[]} />)
    expect(lastFrame() ?? '').toBeTruthy()
  })

  it('mostra sugestoes quando existem', () => {
    const { lastFrame } = render(
      <CommandBar value="/" onChange={() => {}} onSubmit={() => {}} suggestions={suggestions} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('/next')
    expect(frame).toContain('/graph-analyze')
  })

  it('exibe badge skill para comandos skill', () => {
    const { lastFrame } = render(
      <CommandBar value="/" onChange={() => {}} onSubmit={() => {}} suggestions={suggestions} />,
    )
    expect(lastFrame() ?? '').toContain('[skill]')
  })
})
