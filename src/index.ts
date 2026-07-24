/**
 * agent-graph-flow — public entrypoint.
 *
 * Promessa (filtro de toda decisão): software rápido · best-practice SWE ·
 * custo de token brutalmente baixo. Ver CLAUDE.md.
 *
 * M0 expõe apenas identidade do produto. M1 traz o motor (graph/context/RAG/
 * planner/code-intelligence) e re-exporta os módulos públicos do core.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Version is read from package.json (single source of truth) so `agf --version`
 * never drifts from the published version. Falls back to the current release if
 * the file can't be resolved (defensive — should never happen in dist/ or src/).
 */
function readPackageVersion(): string {
  // Build-time inject for the Bun standalone binary: `bun build --define
  // process.env.AGF_VERSION='"x.y.z"'` replaces this literal at compile time, so
  // the version survives inside Bun's /$bunfs/ root where package.json can't be
  // walked. Under Node (not defined) it's simply undefined — no throw.
  const injected = process.env.AGF_VERSION
  if (injected) return injected
  // The bundle can live at dist/index.js OR dist/cli/index.js, so package.json is
  // either one or two levels up. Walk a few ancestors until we find it (also covers
  // src/ during dev). Single source of truth — never hardcode the version.
  const here = dirname(fileURLToPath(import.meta.url))
  for (const rel of ['..', '../..', '../../..']) {
    try {
      const pkg = JSON.parse(readFileSync(join(here, rel, 'package.json'), 'utf-8')) as { version?: string }
      if (pkg.version) return pkg.version
    } catch {
      // try the next ancestor
    }
  }
  return '0.0.0-unknown'
}

export const VERSION = readPackageVersion()

export const PROMISE =
  'Agente SWE autônomo, local-first e token-frugal: PRD vira grafo de execução ' +
  'persistente, TDD obrigatório, custo de token brutalmente baixo.'

/** Fases públicas do ciclo (9 internas → 3 canônicas — ver core/lifecycle/phase). */
export { CANONICAL_PHASES as PHASES, type CanonicalPhase as Phase } from './core/lifecycle/phase.js'
