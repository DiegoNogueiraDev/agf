/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * RAG-IN is the reason a skill does not carry a command catalogue: ask in prose, get the exact
 * command. That only holds if the corpus knows the commands. It knew 163 of the 384 the CLI
 * exposes — `agf verify-ac`, `agf code impact`, `agf cycle-repair` and 218 others could not be
 * retrieved at all, by anyone, ever.
 *
 * `core/config/command-surface.ts` parses the registry for the 133 top-level names and stops
 * there; the 251 subcommands live inside lazily-loaded modules. This walks them.
 *
 * Two gates. Coverage: the corpus indexes what the CLI exposes. Drift: the committed manifest
 * still matches the live CLI, so adding a command and forgetting to regenerate fails the build
 * instead of quietly shrinking what an agent can find.
 */

import { describe, it, expect } from 'vitest'
import { walkCommandSurface } from '../cli/command-tree.js'
import { COMMAND_SURFACE } from '../core/rag-in/command-surface.generated.js'
import { buildHarnessCorpus } from '../core/rag-in/builtin-corpus.js'

/** The paths the corpus can hand back, without the `agf ` prefix and without trailing flags. */
function indexedPaths(): Set<string> {
  return new Set(
    buildHarnessCorpus()
      .map((chunk) => chunk.command)
      .filter((command) => command.startsWith('agf '))
      .map((command) => command.slice(4).split(' --')[0]!.trim()),
  )
}

describe('command tree — the manifest tracks the live CLI', () => {
  it('walks the whole tree, not just the top level', async () => {
    const surface = await walkCommandSurface()
    expect(surface.length).toBeGreaterThan(300)
    expect(surface.filter((entry) => entry.path.includes(' ')).length).toBeGreaterThan(200)
  })

  it('matches the committed manifest (regenerate with: npm run gen:command-surface)', async () => {
    const live = (await walkCommandSurface()).map((entry) => entry.path).sort()
    const committed = COMMAND_SURFACE.map((entry) => entry.path).sort()

    expect({
      missingFromManifest: live.filter((path) => !committed.includes(path)),
      goneFromCli: committed.filter((path) => !live.includes(path)),
    }).toEqual({ missingFromManifest: [], goneFromCli: [] })
  })

  // `agf help` is a real command here — the grouped index over 133 commands. What must never
  // appear is the `help` commander bolts onto every group: `agf node help` retrieves nothing.
  it("drops commander's per-group `help`, keeps the real top-level one", () => {
    expect(COMMAND_SURFACE.some((e) => e.path.endsWith(' help'))).toBe(false)
    expect(COMMAND_SURFACE.some((e) => e.path === 'help')).toBe(true)
  })
})

describe('RAG-IN corpus — an agent can retrieve any command the CLI has', () => {
  it('indexes at least 99% of the live surface', () => {
    const indexed = indexedPaths()
    const missing = COMMAND_SURFACE.map((entry) => entry.path).filter((path) => !indexed.has(path))

    expect(missing.slice(0, 10)).toEqual([])
    expect(1 - missing.length / COMMAND_SURFACE.length).toBeGreaterThanOrEqual(0.99)
  })

  it('indexes the commands no skill ever named — those were unreachable twice over', () => {
    const indexed = indexedPaths()
    for (const path of ['verify-ac', 'code impact', 'risk triage', 'wire-dormant', 'cycle-repair', 'spec-triage']) {
      expect(indexed.has(path), `${path} is not retrievable`).toBe(true)
    }
  })

  it('emits no command that repeats a token', () => {
    const repeats = (command: string): boolean => {
      const tokens = command.split(/\s+/)
      return tokens.some((token, i) => i > 1 && token === tokens[i - 1])
    }
    expect(
      buildHarnessCorpus()
        .map((c) => c.command)
        .filter(repeats),
    ).toEqual([])
  })
})
