#!/usr/bin/env node
/**
 * agent-graph-flow CLI — thin orchestration (NO business logic).
 *
 * Todos os comandos são carregados lazy via import() dinâmico
 * (kimi-cli pattern: LazySubcommandGroup). Apenas o bootstrap
 * e o comando tui (auto-launch) são importados eager.
 */
import { Command } from 'commander'
import { pathToFileURL } from 'node:url'
import { PROMISE, VERSION } from '../index.js'
import { createLazyCommand } from './lazy-loader.js'
import { buildFatalEnvelope } from './fatal.js'
import { createLogger } from '../core/utils/logger.js'
import { getRegisteredCommandNames } from './command-registry.js'
import {
  setPretty,
  setSelect,
  setProfile,
  setAi,
  setDecisionOnly,
  setAutoFormat,
  detectAiFromEnv,
  setDetectedAgent,
} from '../core/output/writer.js'
import type { ProfileName } from '../core/output/profiles.js'
import { PROFILE_NAMES } from '../core/output/profiles.js'
import { setQuiet } from '../core/utils/logger.js'
import { commands } from './commands-list.js'

const log = createLogger({ layer: 'cli', source: 'index.ts' })

export { showBanner as banner } from './banner.js'
export { openStoreOrFail as openStore } from './open-store.js'

const program = new Command()

program.name('agent-graph-flow').description(PROMISE).version(VERSION, '-v, --version')
program.option(
  '--decision-only',
  'Output apenas a decisão (APPROVED/REJECTED). Contexto completo vai pra memória.',
  false,
)
program.option('--pretty', 'JSON identado (debug humano)', false)
program.option(
  '--auto-format',
  'Deriva rich/json via format-routing-policy (agente detectado → json, senão rich) em vez de --pretty sozinho',
  false,
)
program.option(
  '--select <paths>',
  'Projeta o envelope: dot-paths separados por vírgula (ex: data.node.id,data.node.title)',
)
program.option('--profile <name>', `Preset de saída por agente: ${PROFILE_NAMES.join(', ')}`)
program.option('--quiet', 'Suprime logs em stderr (auto-ativado em pipe/redirect)', false)
program.option('--ai', 'Modo ultra-compacto: quiet + envelope mínimo para consumo de IA (~75% menos tokens)', false)

/**
 * Extrai `--pretty` / `--select` / `--quiet` / `--ai` do argv ANTES do
 * Commander rodar e os remove, tornando-os globais em qualquer posição.
 * Commander trata opções do programa-pai como desconhecidas depois do
 * subcomando, então o pré-parse é o caminho determinístico e portável.
 *
 * Auto-detect: quando stderr não é TTY (pipe/redirect), ativa quiet
 * automaticamente (a menos que --verbose seja explícito).
 */
function extractOutputFlags(): void {
  const argv = process.argv
  const kept: string[] = []
  let userSetQuiet = false
  let userSetAi = false
  const applySelect = (raw: string): void => {
    const paths = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (paths.length > 0) setSelect(paths)
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pretty') {
      setPretty(true)
      continue
    }
    if (a === '--decision-only') {
      setDecisionOnly(true)
      continue
    }
    if (a === '--auto-format') {
      setAutoFormat(true)
      continue
    }
    if (a === '--select') {
      const val = argv[i + 1]
      if (typeof val === 'string' && !val.startsWith('-')) {
        applySelect(val)
        i++
      }
      continue
    }
    if (a.startsWith('--select=')) {
      applySelect(a.slice('--select='.length))
      continue
    }
    if (a === '--profile') {
      const val = argv[i + 1]
      if (typeof val === 'string' && PROFILE_NAMES.includes(val as ProfileName)) {
        setProfile(val as ProfileName)
        i++
      }
      continue
    }
    if (a.startsWith('--profile=')) {
      const val = a.slice('--profile='.length)
      if (PROFILE_NAMES.includes(val as ProfileName)) {
        setProfile(val as ProfileName)
      }
      continue
    }
    if (a === '--quiet') {
      userSetQuiet = true
      setQuiet(true)
      continue
    }
    if (a === '--ai') {
      userSetAi = true
      setAi(true)
      setQuiet(true)
      continue
    }
    kept.push(a)
  }

  // Detect the AI agent up front (independent of how --ai was activated) so an
  // explicit `--ai` is also agent-aware: the writer resolves the agent's richer
  // profile instead of always collapsing to `minimal`.
  const agent = detectAiFromEnv()
  if (agent) {
    setDetectedAgent(agent)
    log.debug(`AI agent detected: ${agent}`)
  }

  // Auto-detect: pipe/redirect sem --verbose → quiet automático
  if (!userSetQuiet && !userSetAi && !process.stderr.isTTY) {
    setQuiet(true)
  }

  // Default to --ai for safety when the user did not opt out
  if (!userSetAi) {
    setAi(true)
    setQuiet(true)
  }

  process.argv = kept
}

/** Live command surface — exported so RAG-IN corpus can derive from it without COMMAND_REGISTRY. */
export const CLI_COMMANDS: Array<{ name: string; description: string }> = []

for (const { name, description, loader } of commands) {
  program.addCommand(createLazyCommand(name, description, loader))
  CLI_COMMANDS.push({ name, description })
}

// command-registry.ts is the authoritative name+description list usage-cmd.ts
// reads from; debug-log (never stdout — must not break the JSON envelope
// contract) any command registered here but missing from that single source
// of truth, so drift between the two lists is visible without being noisy.
{
  const registeredNames = new Set(getRegisteredCommandNames())
  const uncovered = commands.map((c) => c.name).filter((name) => !registeredNames.has(name))
  if (uncovered.length > 0) {
    log.debug('command-registry:drift', { uncoveredCount: uncovered.length, uncovered })
  }
}

// Estilo opencode: `agf` sem args num TTY (com projeto presente) abre a TUI.
// Caso contrário (args, pipe/CI, ou sem projeto) → comportamento normal do Commander.
function shouldLaunchTui(): boolean {
  const noArgs = process.argv.length <= 2
  const isTty = Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)
  return noArgs && isTty
}

async function main(): Promise<void> {
  log.debug('CLI main entry')
  extractOutputFlags()
  // Carrega chaves de provider (ex.: OPENROUTER_API_KEY) de secrets/ p/ o env.
  const { loadProviderEnv } = await import('../core/model-hub/load-provider-env.js')
  loadProviderEnv()
  // M7: Register enforcement handlers at CLI startup.
  // Guards status:pre-change (deny backlog→done without in_progress).
  // Registered before any command runs so all status transitions are protected.
  const { registerEnforcementHandlers } = await import('../core/hooks/enforcement-handlers.js')
  registerEnforcementHandlers()

  // WS-C / T2.2: bootstrap do ciclo de sessão (session:start + handlers de
  // session:end no shutdown). No-op sem handler / sob AGF_HOOKS=0; nunca toca stdout.
  const storeDir = process.env.AGF_STORE_DIR || process.cwd()

  // node_wire_74ae54e2ef4e: register BEFORE emitSessionStart() fires below —
  // a session:start listener registered after the emit misses this session's
  // own start event entirely.
  const { registerSessionResumeDetector } = await import('../core/hooks/session-resume-detector-writer.js')
  registerSessionResumeDetector(storeDir)

  const { emitSessionStart, installSessionEndHandlers } = await import('../core/hooks/session-lifecycle.js')
  emitSessionStart()
  const sessionStartedAtMs = Date.now()

  // M6: Start Session Integrity Manifest.
  // Records all agf commands + test results to prevent hallucinated history.
  const { startSessionManifest } = await import('../core/hooks/session-manifest.js')
  startSessionManifest(storeDir)

  // node_wire_662ee61c48da: surface stale (>30d unrefreshed) memories once per
  // session:start. Fire-and-forget — never blocks CLI startup.
  const { checkMemoryStaleness } = await import('../core/memory/memory-reader.js')
  void checkMemoryStaleness(storeDir)

  // node_wire_dfd0c729b99b: write a session-metrics snapshot to
  // workflow-graph/snapshots/ on session:end. Best-effort — a missing/invalid
  // project store at this dir never breaks CLI shutdown (caught internally).
  const { registerSessionEndSnapshot } = await import('../core/hooks/session-end-snapshot-writer.js')
  registerSessionEndSnapshot(storeDir, sessionStartedAtMs)
  // Só o handler `beforeExit` (lista de sinais vazia): emite session:end ao
  // término natural sem registrar listener de SIGINT (que sobrescreveria o exit
  // default do Node e faria Ctrl-C travar a CLI).
  installSessionEndHandlers(process, [])
  if (shouldLaunchTui()) {
    await program.parseAsync([process.argv[0], process.argv[1], 'tui'])
    return
  }
  await program.parseAsync()
}

/**
 * Global error guard (AUDIT-034) — an uncaught throw or rejection must still
 * honor the `{ ok:false }` envelope contract instead of dumping a raw stack
 * trace to stdout. Emits at most once, then exits non-zero.
 */
let fatalEmitted = false
function emitFatal(e: unknown): void {
  if (fatalEmitted) return
  fatalEmitted = true
  try {
    process.stdout.write(JSON.stringify(buildFatalEnvelope(e)) + '\n')
  } catch {
    /* stdout may be closed — nothing more we can safely do */
  }
  process.exitCode = 1
}

/**
 * True only when this file is run directly as the CLI entrypoint (the bin
 * script or `tsx src/cli/index.ts`) — never when imported as a module (e.g.
 * a test importing CLI_COMMANDS). Without this guard, importing this file
 * ran the entire CLI bootstrap (session manifest, hook registration,
 * program.parseAsync()) as an import side effect, leaking open handles that
 * caused "Failed to terminate forks worker" under the full test suite.
 */
export const isCliEntrypoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href

if (isCliEntrypoint) {
  process.on('unhandledRejection', emitFatal)
  process.on('uncaughtException', emitFatal)

  void main().catch(emitFatal)
}
