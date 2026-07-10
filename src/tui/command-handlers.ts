/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * command-handlers.ts — the "simple" slash-command branches extracted out of
 * InteractiveApp's `submit` dispatcher (interactive-app.tsx was >800 lines).
 * Each handler receives a `SubmitContext` bundling the setters it needs
 * instead of closing over component state directly. `quit`/`help`/live-run/
 * async-command stay in interactive-app.tsx — they depend on `abortRef` /
 * `liveRunner`, which don't belong in this context.
 */
import type { Dispatch, SetStateAction } from 'react'
import type { ParsedCommand, CommandPort, SlashCommand } from './dispatch.js'
import type { DashboardModel } from './model.js'
import type { KanbanNode, SwimlaneMode } from './components/KanbanBoard.js'
import type { ViewName } from './tab-nav.js'
import type { Severity } from './status-message.js'
import type { PluginRegistry } from '../core/plugins/plugin-registry.js'
import type { SkillRegistry } from './skill-registry.js'
import type { SkillExecutionContext } from './skill-handler-port.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import { cycleMode, listModes, type CollaborationMode } from '../core/agent-driver/collaboration-mode.js'
import { applyPreset, getActivePreset, listPresets } from './presets.js'
import { scaffoldFile } from './scaffold.js'
import { handlePluginsCommand } from './slash/plugins-handler.js'
import { formatWakeUp, createWakeUpHook } from '../core/economy/wake-up-integration.js'
import { buildRecentWorkMemoryItems } from '../cli/commands/start-cmd.js'
import { listHelpers, loadWorkbench } from './workbench.js'
import { buildSkillContext } from './skill-progress-wiring.js'
import type { FormatIntent } from './components/OutputRenderer.js'

/** Maps TUI commands to surface format intents for output rendering. */
export function mapCmdToIntent(cmd: string): FormatIntent | undefined {
  switch (cmd) {
    case 'stats':
    case 'metrics':
      return 'data-extract'
    case 'check':
    case 'quality':
      return 'code-review'
    case 'skills':
    case 'principles':
    case 'help':
    case 'feedback':
      return 'doc'
    case 'build':
    case 'phase':
      return 'report'
    default:
      return undefined
  }
}

/**
 * Everything a "simple" command handler needs, bundled instead of closed over.
 * The `Dispatch<SetStateAction<T>>` fields are the real React setState functions
 * passed through unchanged — same functional-updater semantics as before the move.
 */
export interface SubmitContext {
  port: CommandPort
  dashboard: DashboardModel
  skillCommands: SlashCommand[]
  skillRegistry?: SkillRegistry
  pluginRegistry?: PluginRegistry
  store?: SqliteStore
  dir?: string
  testCmd?: string
  append: (line: string) => void
  pushStatus: (text: string, severity?: Severity) => void
  view: ViewName
  setView: Dispatch<SetStateAction<ViewName>>
  setKanbanNodes: (nodes: KanbanNode[]) => void
  setKanbanSwimlane: (swimlane: SwimlaneMode | undefined) => void
  kanbanSort: 'title' | undefined
  setKanbanSort: Dispatch<SetStateAction<'title' | undefined>>
  kanbanSortDir: 'asc' | 'desc'
  setKanbanSortDir: Dispatch<SetStateAction<'asc' | 'desc'>>
  setKanbanFilter: (filter: string) => void
  showDiff: boolean
  setShowDiff: Dispatch<SetStateAction<boolean>>
  compactMode: boolean
  setCompactMode: Dispatch<SetStateAction<boolean>>
  collabMode: CollaborationMode
  setCollabMode: (mode: CollaborationMode) => void
  setPhase: (phase: 'banner' | 'wizard' | 'dashboard') => void
  replMode: boolean
  setReplMode: Dispatch<SetStateAction<boolean>>
  setRunning: (running: boolean) => void
  setSkillStep: (state: { total: number; completed: number; label: string }) => void
}

function handleKanban(ctx: SubmitContext, parsed: ParsedCommand): void {
  ctx.setKanbanNodes(ctx.port.getGraphNodes())
  if (parsed.args.startsWith('epic:')) {
    ctx.setKanbanSwimlane('epic')
  } else if (parsed.args.startsWith('sprint:')) {
    ctx.setKanbanSwimlane('sprint')
  } else {
    ctx.setKanbanSwimlane(undefined)
  }
  ctx.setView('kanban')
  ctx.append('› /kanban')
}

function handleFilter(ctx: SubmitContext, parsed: ParsedCommand): void {
  ctx.setKanbanFilter(parsed.args.trim())
  if (ctx.view !== 'kanban') {
    ctx.setKanbanNodes(ctx.port.getGraphNodes())
    ctx.setView('kanban')
  }
  ctx.append(`› /filter: "${parsed.args.trim()}"`)
}

function handleSort(ctx: SubmitContext, parsed: ParsedCommand): void {
  const arg = parsed.args.trim().toLowerCase()
  if (arg === 'title' || arg === 't') {
    if (ctx.kanbanSort === 'title') {
      ctx.setKanbanSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      ctx.setKanbanSort('title')
      ctx.setKanbanSortDir('asc')
    }
  } else {
    ctx.setKanbanSort(undefined)
  }
  const mode = ctx.kanbanSort === 'title' ? `title ${ctx.kanbanSortDir === 'asc' ? '↑' : '↓'}` : 'none'
  ctx.append(`› /sort: ${mode}`)
  if (ctx.view !== 'kanban') {
    ctx.setKanbanNodes(ctx.port.getGraphNodes())
    ctx.setView('kanban')
  }
}

function handleDiff(ctx: SubmitContext): void {
  ctx.setShowDiff((prev) => !prev)
  ctx.append(ctx.showDiff ? '› /diff: desligado' : '› /diff: ligado')
}

function handleCompact(ctx: SubmitContext): void {
  ctx.setCompactMode((prev) => !prev)
  const msg = ctx.compactMode ? '› /compact: off' : '› /compact: on (~73% menos tokens)'
  ctx.append(msg)
  ctx.pushStatus(ctx.compactMode ? 'Compact mode off' : 'Compact mode on', 'ok')
}

function handlePreset(ctx: SubmitContext, parsed: ParsedCommand): void {
  const parts = parsed.args.split(' ')
  const action = parts[0]
  const name = parts[1]
  if (action === 'list' || !action) {
    const presets = listPresets()
    ctx.append('› Presets disponiveis:')
    for (const p of presets) {
      ctx.append(`  ${p.name}: WIP=${p.wip} gates=${p.gates} harness>=${p.harnessMinimum}`)
    }
    const active = getActivePreset()
    ctx.append(`  Ativo: ${active.name}`)
  } else if (action === 'apply' && name) {
    applyPreset(name)
    const active = getActivePreset()
    ctx.append(`› Preset alterado para: ${active.name} (WIP=${active.wip}, gates=${active.gates})`)
  } else {
    ctx.append('Uso: /preset list | /preset apply <nome>')
  }
}

function handleCollaborate(ctx: SubmitContext, parsed: ParsedCommand): void {
  const arg = parsed.args.trim().toLowerCase()
  if (arg === 'plan' || arg === 'execute' || arg === 'pair') {
    ctx.setCollabMode(arg)
    ctx.append(`› Modo: ${arg.toUpperCase()} — ${listModes().find((m) => m.id === arg)?.description ?? ''}`)
  } else {
    const next = cycleMode(ctx.collabMode)
    ctx.setCollabMode(next)
    ctx.append(`› Modo alternado: ${ctx.collabMode.toUpperCase()} → ${next.toUpperCase()}`)
  }
}

function handleScaffold(ctx: SubmitContext, parsed: ParsedCommand): void {
  const args = parsed.args.trim()
  if (!args) {
    ctx.append('Uso: /scaffold <nome> [--type class|fn|comp|iface|type] [--dir <path>]')
    return
  }
  const parts = args.split(/\s+/)
  const name = parts[0]
  let scaffoldType: 'class' | 'function' | 'component' | 'interface' | 'type' = 'function'
  let dir = 'src'
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === '--type' && parts[i + 1]) {
      const tVal = parts[i + 1]
      if (['class', 'fn', 'comp', 'iface', 'type'].includes(tVal)) {
        switch (tVal) {
          case 'class':
            scaffoldType = 'class'
            break
          case 'fn':
            scaffoldType = 'function'
            break
          case 'comp':
            scaffoldType = 'component'
            break
          case 'iface':
            scaffoldType = 'interface'
            break
          case 'type':
            scaffoldType = 'type'
            break
        }
      }
      i++
    } else if (parts[i] === '--dir' && parts[i + 1]) {
      dir = parts[i + 1]
      i++
    }
  }
  const code = scaffoldFile(name, dir, scaffoldType)
  ctx.append(`› /scaffold ${name} — ${scaffoldType} em ${dir}/${name}.ts`)
  ctx.append(code)
}

function handleConstitution(ctx: SubmitContext): void {
  const ps = ctx.port.principles()
  ctx.append(`› Principios (${ps.length}):`)
  for (const p of ps) {
    ctx.append(`  [${p.category}] ${p.title} — ${p.statement}`)
  }
}

function handleSurface(ctx: SubmitContext, parsed: ParsedCommand): void {
  import('./surface-decide.js')
    .then(({ decideOutput }) => {
      const intent = (parsed.args.trim() || 'report') as Parameters<typeof decideOutput>[0]
      const { format, rationale } = decideOutput(intent)
      ctx.append(`› surface: ${intent} → ${format} (${rationale})`)
    })
    .catch((err: unknown) => {
      ctx.append(`erro: ${err instanceof Error ? err.message : String(err)}`)
    })
}

function handleWorkbench(ctx: SubmitContext, parsed: ParsedCommand): void {
  const args = parsed.args.trim().split(/\s+/)
  const sub = args[0]
  if (!sub || sub === 'list') {
    const helpers = listHelpers()
    if (helpers.length === 0) {
      ctx.append('› workbench vazio. Salve helpers em .agents/workbench/helpers.ts')
    } else {
      ctx.append(`› Helpers (${helpers.length}):`)
      for (const h of helpers) {
        ctx.append(`  ${h.name} — ${h.path}`)
      }
    }
  } else if (sub === 'show' && args[1]) {
    const body = loadWorkbench()
    ctx.append(`› workbench — .agents/workbench/helpers.ts`)
    ctx.append(body.slice(0, 500))
  }
}

function handleWakeUp(ctx: SubmitContext, parsed: ParsedCommand): void {
  const query = parsed.args.trim()
  const memoryItems = ctx.store ? buildRecentWorkMemoryItems(ctx.store.getNodesByStatus('done')) : []
  const hook = createWakeUpHook({
    identity: ctx.dashboard.projectName || 'agent-graph-flow',
    capabilities: ['graph_read', 'graph_mutate', 'knowledge_search', 'code_intel'],
    constraints: [],
    memoryItems,
    ...(query ? { query } : {}),
  })
  const result = hook()
  const pack = formatWakeUp(result)
  ctx.append('› /wake-up')
  ctx.append(pack.split('\n').slice(0, 20).join('\n'))
  ctx.pushStatus(
    `Wake-up: ${result.metrics.itemsIncluded}/${result.metrics.itemsConsidered} items, ${result.tokenCounts.total} tok`,
    'ok',
  )
}

function handleAudit(ctx: SubmitContext, parsed: ParsedCommand): void {
  const nodeId = parsed.args.trim()
  ctx.append(`› /audit${nodeId ? ` nodeId=${nodeId}` : ''}`)
  ctx.append('Audit log disponivel via event store. Use /audit <nodeId> para filtrar.')
}

function handleRepl(ctx: SubmitContext): void {
  ctx.setReplMode((prev) => !prev)
  ctx.append(ctx.replMode ? '› REPL desativado' : '› REPL ativado — historico persiste entre comandos')
}

function handleFeedback(ctx: SubmitContext): void {
  const stats = ctx.port.stats()
  const pct = stats.totalNodes > 0 ? Math.round(((stats.byStatus.done ?? 0) / stats.totalNodes) * 100) : 0
  const wip = stats.byStatus.in_progress ?? 0
  const blocked = stats.byStatus.blocked ?? 0
  const phase = ctx.port.getPhase()
  ctx.append('› === Feedback da Fase ===')
  ctx.append(`  Fase: ${phase}`)
  ctx.append(`  Tasks: ${stats.byStatus.done ?? 0}/${stats.totalNodes} done (${pct}%)`)
  ctx.append(`  Em progresso: ${wip} | Bloqueadas: ${blocked}`)
  const q = ctx.port.quality()
  ctx.append(`  Qualidade: testes ${q.testScore}% logs ${q.logScore}%`)
}

/** Dispatch to a registered skill (live handler, static body, or "not found"). Returns true if handled. */
function handleRegisteredSkill(ctx: SubmitContext, parsed: ParsedCommand, text: string): boolean {
  const registeredSkill = ctx.skillRegistry?.find(parsed.cmd)
  if (!registeredSkill) return false

  ctx.append(`› ${text}`)
  const missingDep = ctx.skillRegistry?.checkDependsOn(parsed.cmd) ?? null
  if (missingDep !== null) {
    ctx.append(`⚠ Skill "${parsed.cmd}" requer "${missingDep}" mas ela não está registrada.`)
    return true
  }
  if (registeredSkill.handler && ctx.store) {
    ctx.setRunning(true)
    const handlerCtx: SkillExecutionContext = buildSkillContext({
      store: ctx.store,
      dir: ctx.dir ?? process.cwd(),
      testCmd: ctx.testCmd ?? 'npm test',
      onProgressUpdate: (state) => ctx.setSkillStep(state),
      appendFn: ctx.append,
    })
    setImmediate(() => {
      void registeredSkill
        .handler!.execute(parsed.args, handlerCtx)
        .then((result) => ctx.append(result))
        .catch((err: unknown) => {
          ctx.pushStatus('Erro', 'error')
          ctx.append(`erro: ${err instanceof Error ? err.message : String(err)}`)
        })
        .finally(() => ctx.setRunning(false))
    })
  } else if (registeredSkill.handler) {
    ctx.append(`${registeredSkill.desc}`)
  } else {
    const skill = ctx.port.getSkill(parsed.cmd)
    ctx.append(skill ? `=== ${skill.name} ===\n${skill.body}` : `Skill nao encontrada: ${parsed.cmd}`)
  }
  return true
}

/** Static (unregistered) skill body lookup. Returns true if handled. */
function handleStaticSkill(ctx: SubmitContext, parsed: ParsedCommand, text: string): boolean {
  const matchedSkill = ctx.skillCommands.find((sc) => sc.name === parsed.cmd)
  if (!matchedSkill) return false
  const skill = ctx.port.getSkill(parsed.cmd)
  ctx.append(`› ${text}`)
  ctx.append(skill ? `=== ${skill.name} ===\n${skill.body}` : `Skill não encontrada: ${parsed.cmd}`)
  return true
}

function handlePlugins(ctx: SubmitContext, parsed: ParsedCommand, text: string): void {
  ctx.append(`› ${text}`)
  const args = parsed.args.trim().split(/\s+/).filter(Boolean)
  const result = handlePluginsCommand(args, ctx.pluginRegistry!)
  ctx.append(result.message)
}

/**
 * Dispatches the "simple" slash-commands (no live-run/abort semantics). Returns
 * true when handled — the caller (interactive-app.tsx) falls through to the
 * default `runReadCommand` path when this returns false.
 */
export function dispatchSimpleCommand(ctx: SubmitContext, parsed: ParsedCommand, text: string): boolean {
  switch (parsed.cmd) {
    case 'kanban':
      handleKanban(ctx, parsed)
      return true
    case 'filter':
      handleFilter(ctx, parsed)
      return true
    case 'sort':
      handleSort(ctx, parsed)
      return true
    case 'diff':
      handleDiff(ctx)
      return true
    case 'compact':
      handleCompact(ctx)
      return true
    case 'preset':
      handlePreset(ctx, parsed)
      return true
    case 'collaborate':
      handleCollaborate(ctx, parsed)
      return true
    case 'scaffold':
      handleScaffold(ctx, parsed)
      return true
    case 'constitution':
      handleConstitution(ctx)
      return true
    case 'wizard':
      ctx.setPhase('wizard')
      return true
    case 'surface':
      handleSurface(ctx, parsed)
      return true
    case 'workbench':
      handleWorkbench(ctx, parsed)
      return true
    case 'wake-up':
      handleWakeUp(ctx, parsed)
      return true
    case 'audit':
      handleAudit(ctx, parsed)
      return true
    case 'repl':
      handleRepl(ctx)
      return true
    case 'feedback':
      handleFeedback(ctx)
      return true
    default:
      break
  }

  if (handleRegisteredSkill(ctx, parsed, text)) return true
  if (handleStaticSkill(ctx, parsed, text)) return true
  if (parsed.cmd === 'plugins' && ctx.pluginRegistry) {
    handlePlugins(ctx, parsed, text)
    return true
  }
  return false
}
