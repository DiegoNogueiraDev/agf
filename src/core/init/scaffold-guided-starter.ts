/*!
 * scaffold-guided-starter — idempotent starter scaffold for empty graphs.
 *
 * WHY: A freshly-initialized graph has nothing for `agf start` to pull.
 * This creates ONE sample epic + ONE atomic task with AC so a new agent
 * immediately has a runnable task. Non-destructive: skips if graph already
 * has any task or subtask nodes.
 *
 * Composes with: sqlite-store.ts (insertNode), graph-types.ts (GraphNode).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode } from '../graph/graph-types.js'

export interface GuidedScaffoldResult {
  added: boolean
  epicId?: string
  taskId?: string
}

/** Scaffold a starter epic + task if the graph is empty. Idempotent. */
export function scaffoldGuidedStarter(store: SqliteStore): GuidedScaffoldResult {
  const doc = store.toGraphDocument()
  const hasTasks = doc.nodes.some((n) => n.type === 'task' || n.type === 'subtask')
  if (hasTasks) return { added: false }

  const now = new Date().toISOString()
  const epicId = `epic_guided_${Date.now()}`
  const taskId = `task_guided_${Date.now()}`
  const ac1Id = `ac_guided_1_${Date.now()}`
  const ac2Id = `ac_guided_2_${Date.now()}`

  const epic: GraphNode = {
    id: epicId,
    type: 'epic',
    title: 'Getting Started Epic',
    status: 'backlog',
    priority: 3,
    blocked: false,
    description: 'Sample epic created by agf init --guided. Replace with your own.',
    createdAt: now,
    updatedAt: now,
  }

  const task: GraphNode = {
    id: taskId,
    type: 'task',
    title: 'My first task — replace with your own',
    status: 'backlog',
    priority: 3,
    blocked: false,
    parentId: epicId,
    description:
      'Sua primeira volta completa no ciclo. O objetivo não é o arquivo — é ver o grafo ' +
      'governando a entrega.\n\n' +
      'A sequência EXATA que fecha (verificada num sandbox limpo):\n' +
      '  1. agf node status <id> in_progress\n' +
      '  2. crie um arquivo qualquer, ex.: echo "olá" > hello.md\n' +
      '  3. git add hello.md          ← o done lê o índice do git; arquivo untracked é invisível\n' +
      '  4. agf node update <id> --implementation-files hello.md   ← declare o que você tocou\n' +
      '  5. agf done <id>\n\n' +
      'Os passos 3 e 4 parecem burocracia e são as duas guardas anti-alucinação: uma exige ' +
      'prova física da mudança, a outra exige que a mudança caiba no escopo declarado. ' +
      'Pulá-los faz o done recusar — e a recusa é o sistema funcionando.',
    createdAt: now,
    updatedAt: now,
  }

  const ac1: GraphNode = {
    id: ac1Id,
    type: 'acceptance_criteria',
    title: 'Given the feature, when triggered, then the expected outcome occurs.',
    status: 'backlog',
    priority: 3,
    blocked: false,
    parentId: taskId,
    createdAt: now,
    updatedAt: now,
  }

  const ac2: GraphNode = {
    id: ac2Id,
    type: 'acceptance_criteria',
    title: 'Given invalid input, when triggered, then an error is returned.',
    status: 'backlog',
    priority: 3,
    blocked: false,
    parentId: taskId,
    createdAt: now,
    updatedAt: now,
  }

  store.insertNode(epic)
  store.insertNode(task)
  store.insertNode(ac1)
  store.insertNode(ac2)

  return { added: true, epicId, taskId }
}

/**
 * O starter na porta de entrada: semeia num grafo VAZIO mesmo sem ninguém
 * passar `--guided`.
 *
 * PORQUÊ (node_c22cb5d6f361): a capacidade existia e era opt-in, então um
 * `agf init` comum terminava com o grafo vazio — `agf next` respondia
 * `NO_TASKS/empty_graph` e o operador recém-instalado não tinha por onde
 * começar, restando ler o código. Capacidade pronta e inalcançável entrega
 * zero; o valor só aparece quando ela é o caminho DEFAULT.
 *
 * A flag continua existindo e continua verdadeira — ela só deixou de ser a
 * ÚNICA porta. A guarda de não-destruição é o que torna o default seguro:
 * `scaffoldGuidedStarter` já recusa qualquer grafo que tenha task/subtask, e
 * `init` também roda em repositório com trabalho real.
 */
export function maybeScaffoldStarter(store: SqliteStore, opts: { guidedFlag: boolean }): GuidedScaffoldResult {
  // A flag não muda a decisão hoje (ambos os caminhos semeiam só em grafo
  // vazio); ela permanece no contrato porque declara INTENÇÃO — e porque
  // remover uma flag pública é uma quebra que este node não precisa causar.
  void opts.guidedFlag
  return scaffoldGuidedStarter(store)
}
