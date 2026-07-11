/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Consumer contract emitter — generates the JSON output contract for CLI consumers.
 *
 * This produces the section injected into CLAUDE.md / AGENTS.md / etc.
 * that teaches consuming CLIs how to parse `agf` command output
 * deterministically. No LLM guessing needed.
 */

const ERROR_CODES: Record<string, string> = {
  NOT_FOUND: 'Recurso não encontrado (nó, aresta, memória, etc.)',
  DOD_FAILED: 'Definition of Done checks required failed',
  GATE_FAILED: 'Phase gate did not pass',
  GAPS_FOUND: 'Completeness gaps detected',
  NO_TASKS: 'Nenhuma task disponível para puxar',
  ALL_BLOCKED: 'Todas as tasks estão bloqueadas por dependências',
  MISSING_ID: 'Task ID não fornecido',
  INVALID_TRANSITION: 'Transição de status inválida',
  INVALID_PORT: 'Número de porta inválido',
  INIT_FAILED: 'Falha na inicialização do projeto',
  INIT_ERROR: 'Erro durante inicialização',
  DOCTOR_FAILED: 'Checks críticos do ambiente falharam',
  DOCTOR_ERROR: 'Erro ao rodar diagnóstico',
  ALREADY_IMPORTED: 'Arquivo já foi importado',
  EMPTY_EXTRACTION: 'Nenhuma entidade extraída do arquivo',
  PARSE_ERROR: 'Falha ao parsear arquivo',
  NO_SCENARIOS: 'Nenhum cenário de eval encontrado',
  UNKNOWN_KIND: 'Kind de gap desconhecido',
  UNKNOWN_SEVERITY: 'Severity de gap desconhecida',
  UNKNOWN_PHASE: 'Fase de gate desconhecida',
  UNKNOWN_MODEL: 'Modelo desconhecido',
  UNKNOWN_PROVIDER: 'Provider desconhecido',
  INVALID_KIND: 'Tipo de tarefa inválido para roteamento',
  INVALID_FORMAT: 'Formato de saída inválido',
  STORE_OPEN_FAILED: 'Falha ao abrir o store do projeto',
  EXTERNAL_BLOCKED_DONE: 'Nó bloqueado por infra/externo não pode ser marcado done (invariante de honestidade)',
}

const COMMANDS: Array<{ name: string; args: string; dataShape: string; codes: string[] }> = [
  { name: 'stats', args: '[-d dir]', dataShape: '{totalNodes, totalEdges, byType, byStatus}', codes: [] },
  {
    name: 'next',
    args: '[-d dir]',
    dataShape: '{node: GraphNode, reason, warning?}',
    codes: ['NO_TASKS', 'ALL_BLOCKED'],
  },
  {
    name: 'query',
    args: '[--type] [--status] [--parent] [--search] [--limit] [-d dir]',
    dataShape: 'GraphNode[]',
    codes: [],
  },
  { name: 'search', args: '<query> [--limit] [-d dir]', dataShape: 'SearchResult[]', codes: [] },
  {
    name: 'check',
    args: '<nodeId> [-d dir]',
    dataShape: '{dod: {ready,score,grade,checks}, tdd}',
    codes: ['NOT_FOUND', 'DOD_FAILED'],
  },
  {
    name: 'node add',
    args: '--title [--type] [--parent] [--status] [--priority] [--ac] [-d dir]',
    dataShape: '{id, type, status, title}',
    codes: [],
  },
  {
    name: 'node show',
    args: '<id> [-d dir]',
    dataShape: '{node: GraphNode, outEdges, incEdges}',
    codes: ['NOT_FOUND'],
  },
  {
    name: 'node update',
    args: '<id> [--title] [--description] [--priority] [--type] [-d dir]',
    dataShape: '{id, updated}',
    codes: ['NOT_FOUND'],
  },
  {
    name: 'node status',
    args: '<id> <state> [--force] [-d dir]',
    dataShape: '{id, from, to}',
    codes: ['NOT_FOUND', 'INVALID_TRANSITION', 'EXTERNAL_BLOCKED_DONE'],
  },
  { name: 'node move', args: '<id> --parent <pid> [-d dir]', dataShape: '{id, parent}', codes: ['NOT_FOUND'] },
  { name: 'node clone', args: '<id> [--parent] [-d dir]', dataShape: '{source, clone}', codes: ['NOT_FOUND'] },
  { name: 'node rm', args: '<id> [-d dir]', dataShape: '{id, removed}', codes: ['NOT_FOUND'] },
  {
    name: 'edge add',
    args: '<from> <to> [--type] [--reason] [-d dir]',
    dataShape: '{id, from, to, relationType}',
    codes: ['NOT_FOUND'],
  },
  { name: 'edge rm', args: '<id> [-d dir]', dataShape: '{id, removed}', codes: ['NOT_FOUND'] },
  { name: 'edge ls', args: '[--from] [--to] [-d dir]', dataShape: 'GraphEdge[]', codes: [] },
  { name: 'context', args: '<id> [--compressed] [-d dir]', dataShape: 'TaskContext', codes: ['NOT_FOUND'] },
  {
    name: 'brief',
    args: '<id> [--format markdown|json|claude-prompt] [-d dir]',
    dataShape: 'ExecutorBrief | {markdown} | {prompt}',
    codes: ['NOT_FOUND', 'INVALID_FORMAT'],
  },
  { name: 'export', args: '[-o file] [-d dir]', dataShape: '{path?,nodeCount,edgeCount} | GraphDocument', codes: [] },
  {
    name: 'import-prd',
    args: '<file> [--force] [--allow-empty] [-d dir]',
    dataShape: '{nodes, edges, source}',
    codes: ['ALREADY_IMPORTED', 'EMPTY_EXTRACTION', 'PARSE_ERROR'],
  },
  { name: 'start', args: '[-d dir]', dataShape: '{taskId, title, context}', codes: ['NO_TASKS'] },
  {
    name: 'done',
    args: '<taskId> [-d dir]',
    dataShape: '{taskId, dodScore, dodGrade, savings, next?}',
    codes: ['NOT_FOUND', 'MISSING_ID', 'DOD_FAILED', 'EXTERNAL_BLOCKED_DONE'],
  },
  { name: 'status', args: '[-d dir]', dataShape: 'StatusReport | {project:null}', codes: [] },
  {
    name: 'metrics',
    args: '[-d dir] [--session] [--baseline|--simulate|--economy-report]',
    dataShape: '{totals, byTask, bySession, costPerSuccess, ...}',
    codes: [],
  },
  { name: 'forecast', args: '[-d dir]', dataShape: 'DoraMetrics', codes: [] },
  {
    name: 'insights',
    args: '<dora|bottlenecks|phases|summary> [-d dir]',
    dataShape: 'DoraMetrics | BottleneckReport | PhaseDistribution[] | MetricsReport',
    codes: [],
  },
  { name: 'kanban', args: '[-d dir] [--swimlane]', dataShape: '{board: KanbanBoard, ledger}', codes: [] },
  { name: 'harness', args: '[-d dir] [--violations]', dataShape: 'HarnessScanResult', codes: [] },
  {
    name: 'gaps',
    args: '[-d dir] [--kind] [--severity] [--history]',
    dataShape: 'GapReport | {history}',
    codes: ['UNKNOWN_KIND', 'UNKNOWN_SEVERITY', 'GAPS_FOUND'],
  },
  {
    name: 'eval',
    args: '[--suite] [--model] [--models] [--live] [--repeat] [--out]',
    dataShape: '{scorecard, simulate, mode, totalRuns}',
    codes: ['NO_SCENARIOS'],
  },
  {
    name: 'gate',
    args: '<phase> [-d dir]',
    dataShape: '{phases: [{phase, report}], anyFail}',
    codes: ['UNKNOWN_PHASE', 'GATE_FAILED'],
  },
  {
    name: 'doctor',
    args: '[-d dir] [--providers]',
    dataShape: '{checks?, providers?, llmContext?}',
    codes: ['DOCTOR_FAILED', 'DOCTOR_ERROR'],
  },
  {
    name: 'init',
    args: '[-d dir] [--name] [--port] [--skip-neural] [--no-serve]',
    dataShape: '{success, serveStarted, port?, nextSteps[]}',
    codes: ['INVALID_PORT', 'INIT_FAILED', 'INIT_ERROR'],
  },
  {
    name: 'quality',
    args: '[-d dir] [--min-tests] [--min-logs]',
    dataShape: '{totalModules, testScore, logScore, thresholds, gatePassed}',
    codes: ['GATE_FAILED'],
  },
  { name: 'model list', args: '', dataShape: '{mode, tiers}', codes: [] },
  { name: 'model current', args: '[-d dir]', dataShape: '{mode, modelId}', codes: [] },
  { name: 'model set', args: '<idOrAuto> [-d dir]', dataShape: '{mode, modelId}', codes: ['UNKNOWN_MODEL'] },
  { name: 'model route', args: '<kind> [-d dir]', dataShape: '{kind, model}', codes: ['INVALID_KIND'] },
  { name: 'provider list', args: '', dataShape: '{providers[]}', codes: [] },
  {
    name: 'provider use',
    args: '<id> [--base-url] [-d dir]',
    dataShape: '{provider, baseUrl, requiresKey, envVar?}',
    codes: ['UNKNOWN_PROVIDER'],
  },
  { name: 'provider current', args: '[-d dir]', dataShape: '{provider, kind, baseURL?, fallback?}', codes: [] },
  {
    name: 'provider failover',
    args: '[chain] [--clear] [-d dir]',
    dataShape: '{failover: string[] | null}',
    codes: ['UNKNOWN_PROVIDER'],
  },
  { name: 'memory write', args: '<name> [--content|--file] [-d dir]', dataShape: '{name, bytes}', codes: [] },
  { name: 'memory read', args: '<name> [-d dir]', dataShape: '{name, content}', codes: ['NOT_FOUND'] },
  { name: 'memory list', args: '[-d dir]', dataShape: 'string[]', codes: [] },
  { name: 'memory rm', args: '<name> [-d dir]', dataShape: '{name, removed}', codes: ['NOT_FOUND'] },
  { name: 'memory search', args: '<query> [-d dir] [--limit]', dataShape: 'SearchResult[]', codes: [] },
  { name: 'snapshot create', args: '[-d dir]', dataShape: '{snapshotId}', codes: [] },
  { name: 'snapshot list', args: '[-d dir]', dataShape: 'Snapshot[]', codes: [] },
  { name: 'snapshot restore', args: '<id> [-d dir]', dataShape: '{nodesValid, edgesRestored}', codes: [] },
  { name: 'exec pipe', args: '<command> [args...]', dataShape: 'data do envelope do comando interno', codes: [] },
  { name: 'exec chain', args: '"<cmd1>; <cmd2>; ..."', dataShape: '{results: [{command, ok, data}]}', codes: [] },
  {
    name: 'pipeline next-context',
    args: '[--full] [-d dir]',
    dataShape: '{node: {id,title,status,priority}, reason, context, warning?}',
    codes: ['NO_TASKS'],
  },
  {
    name: 'pipeline next-start',
    args: '[--full] [-d dir]',
    dataShape: '{taskId, title, reason, context, warning?}',
    codes: ['NO_TASKS'],
  },
  {
    name: 'pipeline next-context-start',
    args: '[--full] [-d dir]',
    dataShape: '{taskId, title, reason, context, warning?}',
    codes: ['NO_TASKS'],
  },
  {
    name: 'compress',
    args: '[filters | discover | test <file>]',
    dataShape: '{filters[]} | {misses[]} | {filter, before, after, savedPct}',
    codes: [],
  },
  {
    name: 'code',
    args: '<index|search|callers|callees|def|refs|impact|affected> [target] [-d dir]',
    dataShape: 'CodeIntelResult',
    codes: [],
  },
  {
    name: 'savings',
    args: '[--reset] [-d dir]',
    dataShape: '{tasks[], totals, pricing, backlogCount, projectedCost, commands?, economyBlock?, globalTotals?}',
    codes: [],
  },
  {
    name: 'retrieve',
    args: '<hash> [--query] [--limit] [-d dir]',
    dataShape: '{hash, original} | {hash, query, matches[]}',
    codes: ['NOT_FOUND'],
  },
]

function generateContractSection(): string {
  const lines: string[] = []

  lines.push('## agf JSON Output Contract')
  lines.push('')
  lines.push('Every `agf` command returns a single-line JSON object to stdout:')
  lines.push('')
  lines.push('```json')
  lines.push(
    '{"ok":true|false, "code":"string|null", "data":..., "error":"string|null", "meta":{"command":"string","ms":number,"count?":number}}',
  )
  lines.push('```')
  lines.push('')
  lines.push('### Envelope fields')
  lines.push('')
  lines.push('| Field | Type | Description |')
  lines.push('|-------|------|-------------|')
  lines.push('| `ok` | boolean | `true` = success, `false` = error |')
  lines.push('| `code` | string | Machine-readable error code (present when `ok=false`) |')
  lines.push('| `data` | any | Payload (present when `ok=true`; may also be present on `fail`) |')
  lines.push('| `error` | string | Human-readable error message (present when `ok=false`) |')
  lines.push('| `meta.command` | string | Always present — the command that produced this output |')
  lines.push('| `meta.ms` | number | Duration in milliseconds |')
  lines.push('| `meta.count` | number | Result count for list commands (optional) |')
  lines.push('')
  lines.push('### Error codes')
  lines.push('')
  lines.push('| Code | Meaning |')
  lines.push('|------|---------|')

  for (const [code, desc] of Object.entries(ERROR_CODES).sort()) {
    lines.push(`| \`${code}\` | ${desc} |`)
  }

  lines.push('')
  lines.push('### Command output schemas')
  lines.push('')
  lines.push('| Command | Args | `ok:true` → `data` shape | Error codes |')
  lines.push('|---------|------|---------------------------|-------------|')

  for (const cmd of COMMANDS) {
    const codes = cmd.codes.length > 0 ? cmd.codes.map((c) => `\`${c}\``).join(', ') : '—'
    lines.push(`| \`agf ${cmd.name}\` | ${cmd.args} | \`${cmd.dataShape}\` | ${codes} |`)
  }

  lines.push('')
  lines.push('### Decision logic for consumers')
  lines.push('')
  lines.push('```')
  lines.push('if (!envelope.ok) {')
  lines.push('  switch (envelope.code) {')
  lines.push('    case "DOD_FAILED":')
  lines.push('    case "GAPS_FOUND":')
  lines.push('      // envelope.data contains detailed check results')
  lines.push('      // fix issues and retry')
  lines.push('      break')
  lines.push('    case "NOT_FOUND":')
  lines.push('      // resource does not exist')
  lines.push('      break')
  lines.push('    case "NO_TASKS":')
  lines.push('      // no work available — stand by')
  lines.push('      break')
  lines.push('    default:')
  lines.push('      // handle unknown error')
  lines.push('  }')
  lines.push('}')
  lines.push('// On success: process envelope.data')
  lines.push('```')

  lines.push('')
  lines.push('### Consuming output cheaply (token + memory discipline)')
  lines.push('')
  lines.push(
    '`agf` stdout is always **minified JSON**; logs are NDJSON on **stderr** — parse stdout only. Consume the smallest slice you need:',
  )
  lines.push('')
  lines.push(
    '- **Project fields with `--select`** (no external `jq`; ~80–90% fewer tokens): `agf next --select data.node.id,data.node.title`. Works in any position, always keeps `ok`/`code`/`error`/`meta`, and an invalid path falls back to the full envelope (never errors).',
  )
  lines.push(
    '- **Use `--profile <name>`** for agent-aware presets (claude-code, copilot, opencode, minimal): automatically selects the right fields per command. `--select` wins over `--profile` when both are provided.',
  )
  lines.push('- **`--pretty`** only for human debugging (indented JSON).')
  lines.push(
    '- **Compose natively with `agf exec`** (cross-platform, no shell): `agf exec pipe next` returns the inner `.data`; `agf exec chain "next; check <id>"` runs a sequence.',
  )
  lines.push(
    "- **Pipe further when needed** — POSIX: `agf query --status ready | jq -c '.data[].title'`; PowerShell: `agf query --status ready | ConvertFrom-Json | Select-Object -Expand data`.",
  )
  lines.push(
    '- **Large output → temp file, then filter** (OS temp dir — `/tmp` on POSIX, `%TEMP%` on Windows; in code use `os.tmpdir()`): `agf export -o "$TMPDIR/g.json" && jq -c \'.data.nodes[] | {id,title}\' "$TMPDIR/g.json"`.',
  )
  lines.push(
    '- **Sweep big structures with short async one-liners** (`node -e "..."`) rather than long scripts — decide what to keep, deterministically.',
  )
  lines.push(
    "- **`agf compress`** is for compressing OTHER tools' output (grep/test/build) — never wrap `agf` itself; it is already minimal.",
  )
  lines.push(
    '- **Scaffold-decide:** pick a scaffold from `github.com` or locally via `agf scaffold`, filter/cache, return — never dump whole repos.',
  )
  lines.push('')
  lines.push('Runs identically on Windows, macOS, and Linux — the native `--select` / `agf exec` path needs no shell.')
  lines.push('')
  lines.push(
    '> **Fundamentação:** minified JSON + field projection is the recommended agent-CLI pattern (Anthropic "Effective context engineering"; GitHub "token efficiency in agentic workflows") — returning only the needed fields cuts input tokens ~80–90%.',
  )

  return lines.join('\n')
}

export { generateContractSection, ERROR_CODES, COMMANDS }
