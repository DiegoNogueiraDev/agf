/**
 * Completion-memory helpers shared by the task-close commands (`agf done` and the
 * delegated `agf submit`). Extracted here as the SINGLE source of truth so the two
 * commands do not each carry their own copy — `writeCompletionMemory` had drifted
 * into a near-identical duplicate in both files (DRY violation), and pulling these
 * pure helpers out also keeps `done-cmd.ts` under the 800-line fitness limit.
 *
 * Both functions are pure I/O over `<dir>/<STORE_DIR>/memories/*.md`; they are the
 * owning module for reading a harness score back out of a memory file and for
 * stamping a task-completion memory. Callers: done-cmd.ts, submit-cmd.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { STORE_DIR } from '../../core/utils/constants.js'

/** Reads a numeric `"score"` field out of a stored memory file, or null if absent/malformed. */
export function readHarnessScore(dir: string, memName: string): number | null {
  const p = join(dir, STORE_DIR, 'memories', `${memName}.md`)
  if (!existsSync(p)) return null
  try {
    const content = readFileSync(p, 'utf-8')
    const m = content.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/)
    if (!m || m[1] === undefined) return null
    return parseFloat(m[1])
  } catch {
    return null
  }
}

/**
 * Stamps a `task-<id>.md` completion memory and returns its name (without extension).
 * The `note` line defaults to the DoD-passed message used by `agf done`; the delegated
 * `agf submit` path passes its own note so the two messages stay distinct from one source.
 */
export function writeCompletionMemory(
  dir: string,
  id: string,
  title: string,
  note = `Task \`${id}\` completed (DoD passed).`,
): string {
  const memDir = join(dir, STORE_DIR, 'memories')
  mkdirSync(memDir, { recursive: true })
  const name = `task-${id}`
  writeFileSync(join(memDir, `${name}.md`), `# ${title}\n\n${note}\n`, 'utf-8')
  return name
}
