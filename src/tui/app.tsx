/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * App raiz da TUI (M1p) — dashboard read-only do estado do grafo: cabeçalho
 * (projeto · fase · modelo · WIP), lista de tasks ativas e painel de tokens/
 * custo. Componente presentacional puro (recebe `DashboardModel`), testável via
 * `ink-testing-library`. (TUI estilo opencode, in-process, sem servidor.)
 */
import type { ReactElement } from 'react'
import { Box, Text } from 'ink'
import type { DashboardModel, TaskLine } from './model.js'
import { formatStatusLine } from './status-line.js'

const STATUS_ICON: Record<string, string> = {
  in_progress: '●',
  ready: '○',
  blocked: '▲',
  backlog: '·',
  done: '✓',
}

function TaskRow({ task }: { task: TaskLine }): ReactElement {
  return (
    <Text>
      {'  '}
      {STATUS_ICON[task.status] ?? '·'} <Text dimColor>{task.status.padEnd(12)}</Text> {task.title}
    </Text>
  )
}

export interface AppProps {
  model: DashboardModel
}

/** Dashboard Ink read-only (presentacional puro). A saída é tratada pelo container. */
export function App({ model }: AppProps): ReactElement {
  const t = model.tokens
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1}>
        <Text>
          <Text bold color="cyan">
            agent-graph-flow
          </Text>{' '}
          · {model.projectName} · fase <Text color="yellow">{model.phase}</Text> · modelo {model.modelLabel} · WIP{' '}
          {model.wip}
        </Text>
      </Box>

      <Box paddingX={1}>
        <Text color="green">
          {formatStatusLine({
            totalTokens: model.tokens.total,
            costUsd: model.tokens.costUsd,
            model: model.modelLabel,
          })}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>
          Tasks ativas ({model.tasks.length}/{model.totalTasks}):
        </Text>
        {model.tasks.length === 0 ? (
          <Text dimColor> (nenhuma task ativa)</Text>
        ) : (
          model.tasks.map((task) => <TaskRow key={task.id} task={task} />)
        )}
      </Box>

      <Box marginTop={1}>
        <Text>
          Tokens: <Text color="green">{t.total}</Text> (in {t.tokensIn} / out {t.tokensOut}) ≈ ${t.costUsd.toFixed(4)} ·{' '}
          {t.calls} chamada(s)
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>/help para comandos · /quit ou Ctrl+C para sair</Text>
      </Box>
    </Box>
  )
}
