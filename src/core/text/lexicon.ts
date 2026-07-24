/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * The corpus is bilingual by accident and nobody chose it.
 *
 * `agf harness` describes itself as "Scan harnessability score"; `agf trace` as "Traces de
 * execução persistentes". A person asks "verificar se o AC está satisfeito pelo código" and BM25
 * — which only ever compares strings — scores zero against "Check whether a node's AC is already
 * satisfied by existing code". The right command was not even in the top three, for two thirds
 * of the questions anyone would actually ask.
 *
 * WHY a lexicon and not a translation model: this maps *language*, not commands. `medir → measure`
 * stays true when a command is renamed, removed, or added; a hand-kept list of commands does not.
 * That is the same reason skills point at `agf retrieve-command` instead of carrying a catalogue.
 *
 * WHY folded keys: `código` and `codigo` must be one word. Tokenisation splits on non-ASCII, so
 * an unfolded `código` becomes `c` + `digo` — two tokens that mean nothing and match anything.
 *
 * Contract: `expand(token)` returns the token plus its equivalents, always including the input.
 * Symmetric where it matters — an English query against a Portuguese description is the same
 * problem in the mirror.
 */

/** Strip combining marks: `código` → `codigo`, `execução` → `execucao`. */
export function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * Domain vocabulary, folded, both directions. Verbs are listed in the forms people type, not
 * conjugated exhaustively — retrieval needs a bridge, not a grammar.
 */
const EQUIVALENTS: ReadonlyArray<readonly string[]> = [
  // things
  ['no', 'node'],
  ['nos', 'nodes'],
  ['grafo', 'graph'],
  ['codigo', 'code'],
  ['tarefa', 'task'],
  ['aresta', 'edge'],
  ['memoria', 'memory'],
  ['papel', 'role'],
  ['pergunta', 'question'],
  ['duvida', 'question'],
  ['marcha', 'gear'],
  ['esforco', 'effort'],
  ['modelo', 'model'],
  ['escopo', 'scope'],
  ['capacidade', 'capability'],
  ['capacidades', 'capabilities'],
  ['dependencia', 'dependency'],
  ['ciclo', 'cycle'],
  ['ciclos', 'cycles'],
  ['proveniencia', 'provenance'],
  ['mudanca', 'change'],
  ['especificacao', 'spec'],
  ['especificacoes', 'specs'],
  ['prontidao', 'readiness'],
  ['agente', 'agent'],
  ['agentes', 'agents'],
  ['custo', 'cost'],
  ['risco', 'risk'],
  ['erro', 'error'],
  ['teste', 'test'],
  ['testes', 'tests'],
  ['cobertura', 'coverage'],
  ['relatorio', 'report'],
  ['fila', 'queue'],
  ['gargalo', 'bottleneck'],
  ['limiar', 'threshold'],
  ['provedor', 'provider'],
  ['proximo', 'next'],
  ['proxima', 'next'],
  ['pendente', 'pending'],
  ['pendentes', 'pending'],
  ['dormente', 'dormant'],
  ['dormentes', 'dormant'],
  ['bloqueado', 'blocked'],
  ['desbloqueado', 'unblocked'],
  ['concluida', 'done', 'completed'],
  ['concluido', 'done', 'completed'],
  // actions
  ['medir', 'measure', 'score', 'scan'],
  ['listar', 'list'],
  ['mostrar', 'show', 'display'],
  ['criar', 'create'],
  ['registrar', 'register', 'record'],
  ['remover', 'remove'],
  ['apagar', 'delete', 'remove'],
  ['rodar', 'run'],
  ['executar', 'run', 'execute'],
  ['verificar', 'check', 'verify'],
  ['validar', 'validate', 'check'],
  ['satisfeito', 'satisfied'],
  ['finalizar', 'complete', 'finish'],
  ['marcar', 'mark'],
  ['puxar', 'pull'],
  ['rastrear', 'trace'],
  ['triar', 'triage'],
  ['consertar', 'fix', 'repair'],
  ['corrigir', 'fix', 'repair'],
  ['trocar', 'switch', 'set'],
  ['ajustar', 'set', 'tune'],
  ['buscar', 'search', 'find'],
  ['procurar', 'search', 'find'],
  ['gerar', 'generate'],
  // Ponte tripla, não dupla: a descrição do comando está em português na 3ª pessoa
  // ('Instala uma skill…') e o token do caminho é inglês ('skill install'). Quem
  // pergunta escreve o infinitivo, que não casa com NENHUM dos dois. Onde o corpus
  // fala português, a flexão precisa entrar no grupo junto com a tradução.
  ['instalar', 'instala', 'install'],
  ['desinstalar', 'desinstala', 'uninstall'],
  ['importar', 'import'],
  ['exportar', 'export'],
  ['detectar', 'detect'],
  ['decompor', 'decompose'],
  ['comparar', 'compare', 'diff'],
  ['comprimir', 'compress'],
  ['economizar', 'save', 'savings'],
  // The mirror case: `agf exec` routes its own steps by English intent ("generate delegation
  // brief") against a Portuguese description ("Brief de execução p/ delegar ao executor").
  ['delegar', 'delegate', 'delegation'],
  ['execucao', 'execution'],
  ['definir', 'set', 'define'],
  // RAG-OUT scaffolds state their goal in Portuguese and their fit tags in English. `calcula`
  // is asking for the scaffold tagged `calculate`.
  ['calcular', 'calculate', 'compute'],
  ['calcula', 'calculate', 'compute'],
  ['matematica', 'math', 'mathematical'],
]

/** token → every equivalent, built once. Symmetric: `node` finds `no`, `no` finds `node`. */
const INDEX: ReadonlyMap<string, readonly string[]> = (() => {
  const index = new Map<string, string[]>()
  for (const group of EQUIVALENTS) {
    for (const term of group) {
      const bucket = index.get(term) ?? []
      index.set(term, [...new Set([...bucket, ...group])])
    }
  }
  return index
})()

/** The token and everything that means the same thing. Always contains the token itself. */
export function expand(token: string): readonly string[] {
  return INDEX.get(token) ?? [token]
}
