/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Container interativo da TUI (M1q) — compõe o dashboard (M1p) + log de saída +
 * barra de comando. Detém o estado (input, log) e despacha slash-commands
 * read-only via `runReadCommand`. `/quit` (e Ctrl+C, nativo do Ink) encerram.
 * Execução ao vivo (`/run`, `/autopilot`) chega no M1r.
 */
import { useState, useEffect, useRef, useMemo, type ReactElement } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { BannerScreen } from './banner-screen.js'
import { WizardScreen } from './wizard-screen.js'
import { CommandBar } from './command-bar.js'
import { vimNav, type VimNavState } from './vim-nav.js'
import { tabNav, type ViewName } from './tab-nav.js'
import { shortcutAction, type ShortcutState } from './shortcut-action.js'
import { type KanbanNode, type SwimlaneMode } from './components/KanbanBoard.js'
import { DiffPanel, type DiffLineItem } from './components/DiffPanel.js'
import { SkillProgress } from './components/SkillProgress.js'
import { PhaseTabs } from './components/PhaseTabs.js'
import { ViewTabs } from './components/ViewTabs.js'
import { CenterPanel } from './components/CenterPanel.js'
import { SearchOverlay } from './search-overlay.js'
import { ToastOverlay, pushToast } from './toast-overlay.js'
import { statusMessage, VIEW_SHORTCUTS, type StatusMessage, type Severity } from './status-message.js'
import { REFRESH_INTERVAL, STALE_THRESHOLD, staleStatus } from './auto-refresh.js'
import { parseTerminalSize, type TerminalSize } from './terminal-size.js'
import { GraphTree } from './components/GraphTree.js'
import { DetailPanel, type DetailNode } from './components/DetailPanel.js'
import { FooterBar } from './components/FooterBar.js'
import { CommandPalette } from './components/CommandPalette.js'
import type { SkillRegistry } from './skill-registry.js'
import type { PluginRegistry } from '../core/plugins/plugin-registry.js'
import { navigateHistory } from './history.js'
import { formatElapsed } from './elapsed.js'
import {
  parseCommand,
  resolveAlias,
  filterCommands,
  runReadCommand,
  runAsyncCommand,
  COMMANDS,
  ASYNC_CMDS,
  type CommandPort,
  type AsyncCommandPort,
  type SlashCommand,
} from './dispatch.js'
import type { DashboardModel } from './model.js'
import type { LiveRunner } from './live-runner.js'
import { formatOutputLine } from './components/OutputRenderer.js'
import type { CollaborationMode } from '../core/agent-driver/collaboration-mode.js'
import { ReplSession } from './repl-session.js'
import { createSessionStore } from '../core/plugins/extension-data.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import { dispatchSimpleCommand, mapCmdToIntent } from './command-handlers.js'
import { ErrorBoundary } from './error-boundary.js'
import { ConfirmDialog } from './confirm-dialog.js'
import { saveHistory, loadHistory, redactHistoryEntry } from './history.js'
import { getContextualHelp } from './contextual-help.js'
import { join } from 'node:path'

const HISTORY_PATH = join(process.env.HOME ?? process.cwd(), '.local', 'share', 'agent-graph-flow', 'history.json')

const MAX_LOG_LINES = 12

export interface InteractiveAppProps {
  dashboard: DashboardModel
  port: CommandPort
  /** Comandos assíncronos (check, decompose, import-prd, doctor). */
  asyncPort?: AsyncCommandPort
  /** Execução ao vivo (autopilot/run). Ausente → `/run` e `/autopilot` só informam. */
  liveRunner?: LiveRunner
  /** Skills dinâmicas carregadas pelo launcher para a paleta. */
  skillCommands?: SlashCommand[]
  /** Registry unificado de comandos (built-in + skills). */
  skillRegistry?: SkillRegistry
  /** Store for skill handler execution (no MCP). */
  store?: SqliteStore
  /** Project directory for skill handlers. */
  dir?: string
  /** Test command for skill handlers. */
  testCmd?: string
  /** Plugin registry for /plugins slash command. */
  pluginRegistry?: PluginRegistry
}

/** App interativo: dashboard + log + barra de comando (com execução ao vivo). */
export function InteractiveApp({
  dashboard,
  port,
  asyncPort,
  liveRunner,
  skillCommands = [],
  skillRegistry,
  store,
  dir,
  testCmd,
  pluginRegistry,
}: InteractiveAppProps): ReactElement {
  const { exit } = useApp()
  const [phase, setPhase] = useState<'banner' | 'wizard' | 'dashboard'>(process.stdout.isTTY ? 'banner' : 'dashboard')
  const [input, setInput] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [view, setView] = useState<ViewName>('dashboard')
  const [collabMode, setCollabMode] = useState<CollaborationMode>('execute')
  const [replMode, setReplMode] = useState(false)
  const _replRef = useRef(new ReplSession())
  const sessionDataRef = useRef(createSessionStore())
  const [kanbanNodes, setKanbanNodes] = useState<KanbanNode[]>([])
  const [kanbanSwimlane, setKanbanSwimlane] = useState<SwimlaneMode | undefined>(undefined)
  const [vimNavState, setVimNavState] = useState<VimNavState>({ cursor: 0, count: 0 })
  const [showSearch, setShowSearch] = useState(false)
  const [compactMode, setCompactMode] = useState(false)
  const [shortcutState, setShortcutState] = useState<ShortcutState>({ kind: 'idle' })
  const [statusMsgs, setStatusMsgs] = useState<StatusMessage[]>([])
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null)
  const [termSize, setTermSize] = useState<TerminalSize>(() => parseTerminalSize(process.stdout))
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [diffLines, setDiffLines] = useState<DiffLineItem[]>([])
  const [showDiff, setShowDiff] = useState(false)
  const [harnessScore, setHarnessScore] = useState({
    testScore: 0,
    logScore: 0,
    totalModules: 0,
    darkModules: [] as string[],
  })
  const [showPalette, setShowPalette] = useState(false)
  const [kanbanFilter, setKanbanFilter] = useState('')
  const [kanbanSort, setKanbanSort] = useState<'title' | undefined>(undefined)
  const [kanbanSortDir, setKanbanSortDir] = useState<'asc' | 'desc'>('asc')
  const [showSidebar, _setShowSidebar] = useState(true)
  const [showDetail, _setShowDetail] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined)
  const [nextTaskHint, setNextTaskHint] = useState<{ title: string; id: string; reason: string } | null>(null)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())
  const graphTreeNodes = useMemo(() => {
    const raw = port.getGraphNodes()
    const byParent = new Map<string | null | undefined, typeof raw>()
    for (const n of raw) {
      const p = n.parentId ?? null
      if (!byParent.has(p)) byParent.set(p, [])
      byParent.get(p)!.push(n)
    }
    function buildTree(parentId: string | null | undefined): Array<{
      id: string
      title: string
      type: string
      status: string
      children?: Array<{ id: string; title: string; type: string; status: string }>
    }> {
      return (byParent.get(parentId) ?? []).map((n) => ({
        id: n.id,
        title: n.title,
        type: n.type,
        status: n.status,
        children: buildTree(n.id),
      }))
    }
    return buildTree(null)
  }, [port])
  const flatVisibleIds = useMemo<string[]>(() => {
    if (view === 'kanban') {
      return kanbanNodes.filter((n) => n.type === 'task' || n.type === 'subtask').map((n) => n.id)
    }
    const flat: string[] = []
    const walk = (items: typeof graphTreeNodes) => {
      for (const item of items) {
        flat.push(item.id)
        if (!collapsedNodes.has(item.id) && item.children) {
          walk(item.children)
        }
      }
    }
    walk(graphTreeNodes)
    return flat
  }, [view, graphTreeNodes, collapsedNodes, kanbanNodes])
  // Sync vimNavState when flatVisibleIds changes
  useEffect(() => {
    setVimNavState((prev) => vimNav.updateCount(prev, flatVisibleIds.length))
  }, [flatVisibleIds])
  // Sync selectedNodeId from vim navigation cursor
  useEffect(() => {
    const id = flatVisibleIds[vimNavState.cursor]
    if (id !== undefined) {
      setSelectedNodeId(id)
    }
  }, [vimNavState, flatVisibleIds])
  const [_skillStep, setSkillStep] = useState({ total: 1, completed: 0, label: '' })

  // Auto-refresh polling a cada 20s para dashboard, WIP, tokens.
  useEffect(() => {
    const refresh = (): void => {
      setKanbanNodes(port.getGraphNodes())
      const next = port.findNext()
      if (next && !('blocked' in next)) {
        setNextTaskHint(next)
      } else {
        setNextTaskHint(null)
      }
      setLastRefreshAt(Date.now())
    }
    refresh()
    const t = setInterval(refresh, REFRESH_INTERVAL)
    return () => clearInterval(t)
  }, [port])

  // Tempo decorrido: zera ao iniciar e tica de 1s enquanto roda (#F3).
  useEffect(() => {
    if (!running) return
    setElapsedMs(0)
    const startedAt = Date.now()
    const t = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(t)
  }, [running])

  // Auto-clear status messages after 5s TTL
  useEffect(() => {
    const t = setInterval(() => {
      setStatusMsgs((prev) => prev.filter((m) => !statusMessage.isExpired(m, 5000)))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // SIGWINCH: resize tracking (6B.3)
  useEffect(() => {
    const handler = (): void => {
      setTermSize(parseTerminalSize(process.stdout))
      pushStatus(`Redimensionado ${process.stdout.columns}x${process.stdout.rows}`, 'ok')
    }
    process.stdout.on('resize', handler)
    return () => {
      process.stdout.off('resize', handler)
    }
  }, [])

  // Histórico de comandos submetidos + cursor de recall (#2b).
  const [history, setHistory] = useState<string[]>([])
  const [histCursor, setHistCursor] = useState(-1)
  const [draft, setDraft] = useState('')

  // 6C.3: carrega histórico do disco ao montar
  useEffect(() => {
    const saved = loadHistory(HISTORY_PATH)
    if (saved.length > 0) setHistory(saved)
  }, [])

  // 6C.3: persiste histórico no disco a cada mudança
  useEffect(() => {
    if (history.length > 0) saveHistory(history, HISTORY_PATH)
  }, [history])
  // AbortController do autopilot ao vivo em andamento (Esc cancela) (#F5).
  const abortRef = useRef<AbortController | null>(null)

  const append = (line: string): void => setLog((prev) => [...prev, line].slice(-MAX_LOG_LINES))
  const pushStatus = (text: string, severity: Severity = 'ok'): void => {
    setStatusMsgs((prev) => [...prev, statusMessage.create(text, severity)].slice(-5))
    pushToast(text, severity === 'ok' ? 'info' : severity === 'warn' ? 'warn' : 'error')
  }

  useInput((_input, key) => {
    // Ctrl+P → command palette
    if (key.ctrl && _input === 'p') {
      setShowPalette((prev) => !prev)
      return
    }
    // Esc while palette open → close
    if (showPalette && key.escape) {
      setShowPalette(false)
      return
    }
    // Palette open → defer to palette's own useInput
    if (showPalette) return

    // Search overlay open → defer to SearchOverlay's useInput
    if (showSearch) return

    // '/' abre busca quando command bar vazia
    if (phase === 'dashboard' && input === '' && _input === '/') {
      setShowSearch(true)
      return
    }

    // Esc enquanto roda → cancelamento cooperativo do autopilot (#F5).
    if (phase === 'dashboard' && running) {
      if (key.escape && abortRef.current) {
        abortRef.current.abort()
        append('⛔ interrompendo… (para após o passo atual)')
      }
      return
    }
    // Shortcut confirm flow: process y/N when in confirm state
    if (shortcutState.kind === 'confirm') {
      const next = shortcutAction.press(shortcutState, _input)
      if (next.kind === 'executing') {
        if (next.action === 'delete' && selectedNodeId) {
          pushStatus(`DEL ${selectedNodeId} — acao externa`, 'warn')
          append(`\u203a DEL ${selectedNodeId} — acao externa necessaria`)
        } else if (next.action === 'consolidate') {
          pushStatus('CONSOLIDAR — acao externa', 'warn')
          append('\u203a CONSOLIDAR — acao externa necessaria')
        }
      }
      setShortcutState(next)
      return
    }

    // ↑/↓ na barra de comando navegam o histórico, preservando o rascunho (#2b).
    if (phase !== 'dashboard') return
    // Vim-style navigation when command bar is empty (j/k/g/G).
    // Up/Down always navigate history regardless of input content.
    if (input === '') {
      if (_input === 'j') {
        setVimNavState((prev) => vimNav.handleKey(prev, 'j'))
        return
      }
      if (_input === 'k') {
        setVimNavState((prev) => vimNav.handleKey(prev, 'k'))
        return
      }
      if (_input === 'g') {
        setVimNavState((prev) => vimNav.handleKey(prev, 'g'))
        return
      }
      if (_input === 'G') {
        setVimNavState((prev) => vimNav.handleKey(prev, 'G'))
        return
      }
      // Single-key shortcuts: d=delete, c=consolidate, r=refresh (immediate)
      if (_input === 'd' || _input === 'c') {
        setShortcutState(shortcutAction.press({ kind: 'idle' }, _input))
        return
      }
      if (_input === 'r') {
        setKanbanNodes(port.getGraphNodes())
        pushStatus('Refresh concluído', 'ok')
        append('\u203a refresh: nodes atualizados')
        return
      }
      // Number keys 1-5 switch tabs
      const n = Number(_input)
      if (_input >= '1' && _input <= '5') {
        setView((prev) => tabNav.press(prev, n))
        return
      }
    }
    // Tab/Shift+Tab cycle through views (any mode)
    if (key.tab && !key.shift) {
      setView((prev) => tabNav.press(prev, 'tab'))
      return
    }
    if (key.tab && key.shift) {
      setView((prev) => tabNav.press(prev, 'shiftTab'))
      return
    }
    if (!key.upArrow && !key.downArrow) return
    const effectiveDraft = histCursor === -1 ? input : draft
    if (histCursor === -1) setDraft(input)
    const result = navigateHistory({ history, cursor: histCursor, draft: effectiveDraft }, key.upArrow ? 'up' : 'down')
    setHistCursor(result.cursor)
    setInput(result.value)
  })

  const submit = (raw: string): void => {
    const parsed = parseCommand(raw)
    parsed.cmd = resolveAlias(parsed.cmd, [...COMMANDS, ...skillCommands])
    setInput('')
    const text = raw.trim()
    if (text === '' || running) return
    // Registra no histórico e zera o cursor de recall. Redige segredos (ex.:
    // "/provider connect <id> <key>") antes de entrar no array persistido em disco.
    setHistory((prev) => [...prev, redactHistoryEntry(text)])
    setHistCursor(-1)
    setDraft('')
    if (parsed.cmd === 'quit') {
      exit()
      return
    }
    // /help abre o overlay; qualquer outro comando o fecha.
    if (parsed.cmd === 'help') {
      setShowHelp(true)
      return
    }
    setShowHelp(false)

    // Execução ao vivo: /run e /autopilot rodam no processo, com progresso por-step.
    if ((parsed.cmd === 'run' || parsed.cmd === 'autopilot') && liveRunner) {
      append(`› ${text}`)
      setRunning(true)
      const controller = new AbortController()
      abortRef.current = controller
      const task =
        parsed.cmd === 'run'
          ? liveRunner.run(parsed.args, append)
          : liveRunner.autopilot(parseInt(parsed.args, 10) || 5, append, controller.signal)
      task
        .then((summary) => append(summary))
        .catch((err: unknown) => {
          pushStatus('Erro', 'error')
          append(`erro: ${err instanceof Error ? err.message : String(err)}`)
        })
        .finally(() => {
          abortRef.current = null
          setRunning(false)
        })
      return
    }

    // Comandos assíncronos não-live (check, decompose, import-prd, doctor).
    if ((ASYNC_CMDS as readonly string[]).includes(parsed.cmd) && asyncPort) {
      append(`› ${text}`)
      setRunning(true)
      // setImmediate garante que Ink pinta o spinner antes de a Promise começar.
      setImmediate(() => {
        void runAsyncCommand(asyncPort, parsed, append)
          .then((summary) => append(summary))
          .catch((err: unknown) => {
            pushStatus('Erro', 'error')
            append(`erro: ${err instanceof Error ? err.message : String(err)}`)
          })
          .finally(() => setRunning(false))
      })
      return
    }

    // Every other slash-command that doesn't need abortRef/liveRunner lives in
    // command-handlers.ts (kanban/filter/sort/diff/compact/preset/collaborate/
    // scaffold/constitution/wizard/surface/workbench/wake-up/audit/repl/
    // feedback/skill-dispatch/plugins) — extracted so this file stays <800 lines.
    if (
      dispatchSimpleCommand(
        {
          port,
          dashboard,
          skillCommands,
          skillRegistry,
          pluginRegistry,
          store,
          dir,
          testCmd,
          sessionData: sessionDataRef.current,
          append,
          pushStatus,
          view,
          setView,
          setKanbanNodes,
          setKanbanSwimlane,
          kanbanSort,
          setKanbanSort,
          kanbanSortDir,
          setKanbanSortDir,
          setKanbanFilter,
          showDiff,
          setShowDiff,
          compactMode,
          setCompactMode,
          collabMode,
          setCollabMode,
          setPhase,
          replMode,
          setReplMode,
          setRunning,
          setSkillStep,
        },
        parsed,
        text,
      )
    ) {
      return
    }

    append(`› ${text}`)
    const output = runReadCommand(port, parsed)
    const intent = mapCmdToIntent(parsed.cmd)
    append(formatOutputLine(output, intent))

    const nx = port.findNext()
    if (nx && !('blocked' in nx)) setNextTaskHint(nx)
    else setNextTaskHint(null)

    // Qualquer outro comando volta ao dashboard
    if (view !== 'dashboard') setView('dashboard')
  }

  // Hooks must run unconditionally on every render — hoisted above the
  // phase==='banner'/'wizard' early returns below (fixes "Rendered more
  // hooks than during the previous render" when phase transitions away
  // from 'banner' after the first render).
  const detailNode: DetailNode | null = useMemo(() => {
    if (!selectedNodeId) return null
    const raw = port.getGraphNodes()
    const n = raw.find((x) => x.id === selectedNodeId)
    if (!n) return null
    const children = raw.filter((x) => x.parentId === selectedNodeId).map((x) => x.id)
    return {
      id: n.id,
      title: n.title,
      type: n.type,
      status: n.status,
      priority: 3,
      parentTitle: n.parentId ? raw.find((x) => x.id === n.parentId)?.title : undefined,
      children,
      blockers: [],
    }
  }, [selectedNodeId, port])

  if (phase === 'banner') {
    return (
      <BannerScreen
        onDone={() => {
          const stats = port.stats()
          const q = port.quality()
          setHarnessScore({
            testScore: q.testScore,
            logScore: q.logScore,
            totalModules: q.totalModules,
            darkModules: q.darkModules,
          })
          if (stats.totalNodes === 0) {
            setPhase('wizard')
          } else {
            setPhase('dashboard')
          }
        }}
      />
    )
  }

  if (phase === 'wizard') {
    return <WizardScreen onDone={() => setPhase('dashboard')} />
  }

  const toggleCollapse = (id: string): void => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <ErrorBoundary>
      <Box flexDirection="column" minHeight={termSize.rows}>
        {/* View tabs at top */}
        <Box marginBottom={0}>
          <ViewTabs activeView={view} />
        </Box>
        {/* Phase tabs at top */}
        <Box marginBottom={0}>
          <PhaseTabs activePhase={dashboard.phase} />
        </Box>

        {/* Command Palette overlay */}
        <CommandPalette
          commands={[...COMMANDS, ...skillCommands]}
          onSelect={(cmd) => {
            setShowPalette(false)
            submit(`/${cmd.name} `)
          }}
          onClose={() => setShowPalette(false)}
          visible={showPalette}
        />

        {/* Split pane: sidebar | center | detail */}
        <Box flexDirection="row" flexGrow={1}>
          {/* Left sidebar: graph tree */}
          {showSidebar && (
            <Box
              width={30}
              borderStyle="single"
              borderRight={true}
              borderLeft={false}
              borderTop={false}
              borderBottom={false}
              flexDirection="column"
              overflowY="visible"
            >
              <Text bold color="cyan" wrap="truncate">
                {' '}
                Graph Tree
              </Text>
              <GraphTree
                nodes={graphTreeNodes}
                selectedId={selectedNodeId ?? undefined}
                collapsed={collapsedNodes}
                onToggle={toggleCollapse}
                onSelect={(id) => {
                  const idx = flatVisibleIds.indexOf(id)
                  setSelectedNodeId(id)
                  if (idx >= 0) setVimNavState({ count: flatVisibleIds.length, cursor: idx })
                }}
              />
            </Box>
          )}

          {/* Center panel: main content + log + command bar */}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <CenterPanel
              view={view}
              kanbanNodes={kanbanNodes}
              kanbanSwimlane={kanbanSwimlane}
              selectedNodeId={selectedNodeId}
              kanbanFilter={kanbanFilter}
              kanbanSort={kanbanSort}
              kanbanSortDir={kanbanSortDir}
              graphTreeNodes={graphTreeNodes}
              collapsedNodes={collapsedNodes}
              toggleCollapse={toggleCollapse}
              flatVisibleIds={flatVisibleIds}
              onSelectNode={(id, idx) => {
                setSelectedNodeId(id)
                if (idx >= 0) setVimNavState({ count: flatVisibleIds.length, cursor: idx })
              }}
              harnessScore={harnessScore}
              dashboard={dashboard}
              collabMode={collabMode}
              pluginRegistry={pluginRegistry}
              skillCommands={skillCommands}
            />

            {/* Search overlay */}
            {showSearch && (
              <SearchOverlay
                nodes={port.getGraphNodes()}
                onSelect={(node) => {
                  setSelectedNodeId(node.id)
                  setShowSearch(false)
                }}
                onDelete={(node) => {
                  append(`DEL ${node.id} — confirmação externa necessária`)
                  setShowSearch(false)
                }}
                onClose={() => setShowSearch(false)}
              />
            )}

            {/* Toast notifications */}
            <ToastOverlay />

            {/* Shortcut confirmation */}
            {shortcutState.kind === 'confirm' && (
              <ConfirmDialog
                title={shortcutAction.label(shortcutState)}
                message={shortcutState.action === 'delete' ? `Node ${selectedNodeId ?? ''} será removido` : undefined}
              />
            )}

            {/* Log output */}
            {log.length > 0 && (
              <Box flexDirection="column" marginTop={1} borderStyle="single" paddingX={1}>
                {log.map((line, i) => (
                  <Text key={i}>{line}</Text>
                ))}
              </Box>
            )}

            {/* Help overlay */}
            {showHelp && (
              <Box flexDirection="column" marginTop={1} borderStyle="round" paddingX={1}>
                <Text bold>Comandos:</Text>
                {COMMANDS.map((c) => (
                  <Text key={c.name}>
                    <Text color="cyan">{c.usage.padEnd(16)}</Text> {c.desc}
                  </Text>
                ))}
              </Box>
            )}

            {/* Running spinner */}
            {running && (
              <Box flexDirection="column" marginTop={1}>
                <SkillProgress
                  total={_skillStep.total}
                  completed={_skillStep.completed}
                  label={_skillStep.label || 'executando'}
                  elapsedSecs={Math.floor(elapsedMs / 1000)}
                  tokensUsed={dashboard.tokens.total}
                />
                <Box marginTop={1}>
                  <Text color="yellow">
                    <Spinner type="dots" /> executando… {formatElapsed(elapsedMs)} ·{' '}
                    <Text dimColor>Esc para interromper</Text>
                  </Text>
                </Box>
              </Box>
            )}

            {/* Diff panel */}
            {showDiff && diffLines.length > 0 && <DiffPanel diffs={diffLines} />}

            {/* Command bar */}
            {view === 'dashboard' && (
              <Box marginTop={1}>
                <CommandBar
                  value={input}
                  onChange={setInput}
                  onSubmit={submit}
                  suggestions={filterCommands(input, skillCommands)}
                />
              </Box>
            )}
          </Box>

          {/* Right sidebar: detail panel */}
          {showDetail && (
            <Box
              width={34}
              borderStyle="single"
              borderLeft={true}
              borderRight={false}
              borderTop={false}
              borderBottom={false}
              flexDirection="column"
              overflowY="visible"
            >
              <DetailPanel node={detailNode} />
            </Box>
          )}
        </Box>

        {/* Footer bar */}
        <FooterBar
          harnessScore={Math.round((harnessScore.testScore + harnessScore.logScore) / 2)}
          harnessGrade={harnessScore.testScore > 70 ? 'B' : 'C'}
          tokenEstimate={dashboard.tokens.total}
          mode={collabMode.toUpperCase()}
          staleStatus={staleStatus(lastRefreshAt, STALE_THRESHOLD)}
          statusMessage={statusMessage.newest(statusMsgs, 5000)}
          shortcuts={VIEW_SHORTCUTS[view]}
          compactMode={compactMode}
          helpHint={getContextualHelp({ totalNodes: dashboard.tasks.length, view }) ?? undefined}
          nextTask={nextTaskHint}
        />
      </Box>
    </ErrorBoundary>
  )
}
