/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-IN corpus chunking — converts command documentation (TLDR pages,
 * PowerShell `Get-Help` examples, harness `--help`) into task-grained chunks.
 *
 * Granularity = unit of TASK, not document: one chunk per (intent, command).
 * The chunk schema is plain JSON (Karpathy philosophy: legible, no framework).
 */

export type CommandFamily = 'unix' | 'windows' | 'powershell' | 'harness'

export interface CommandChunk {
  /** Deterministic slug: `${tool}-${intent-slug}`. */
  id: string
  /** Natural-language task description ("extract a gzipped archive"). */
  intent: string
  /** The exact command, placeholders normalized to `{name}`. */
  command: string
  family: CommandFamily
  /** The primary tool/cmdlet (e.g. `tar`, `Get-ChildItem`). */
  tool: string
  /** Short flag explanation when the source provides it (else ''). */
  flags_explained: string
  /** True for destructive commands → caller must require confirmation. */
  danger: boolean
  /** Provenance ('tldr', 'powershell-docs', 'harness', 'local-man', ...). */
  source: string
}

/** Destructive patterns across families — caller exige confirmação se true. */
const DANGER_PATTERNS: readonly RegExp[] = [
  /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf]/i, // rm -rf / rm -fr / rm -r -f
  /\bdd\s+if=/i,
  /\bmkfs(\.\w+)?\b/i,
  /\b(shred|wipefs)\b/i,
  />\s*\/dev\/sd[a-z]/i,
  /\bRemove-Item\b[^|]*-Recurse/i,
  /\bFormat-Volume\b/i,
  /\bClear-Disk\b/i,
  /\b:\(\)\s*\{.*\}\s*;\s*:/, // fork bomb
]

export function isDangerous(command: string): boolean {
  return DANGER_PATTERNS.some((re) => re.test(command))
}

/** Normalize TLDR `{{placeholder}}` → `{placeholder}` and trim. */
function normalizeCommand(raw: string): string {
  return raw.replace(/\{\{\s*([^}]*?)\s*\}\}/g, '{$1}').trim()
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** First whitespace-delimited token of a command = its primary tool. */
function primaryTool(command: string): string {
  const m = command.trim().match(/^[A-Za-z0-9_.-]+/)
  return m ? m[0] : ''
}

function makeChunk(
  intent: string,
  command: string,
  family: CommandFamily,
  source: string,
  toolHint?: string,
): CommandChunk | null {
  const cmd = normalizeCommand(command)
  if (cmd.length === 0) return null
  const cleanIntent = intent.replace(/:\s*$/, '').trim()
  const tool = toolHint && toolHint.length > 0 ? toolHint : primaryTool(cmd)
  return {
    id: `${slugify(tool)}-${slugify(cleanIntent)}`,
    intent: cleanIntent,
    command: cmd,
    family,
    tool,
    flags_explained: '',
    danger: isDangerous(cmd),
    source,
  }
}

/** Ensure ids are unique within a corpus slice by suffixing collisions. */
function dedupeIds(chunks: CommandChunk[]): CommandChunk[] {
  const seen = new Map<string, number>()
  return chunks.map((c) => {
    const n = seen.get(c.id) ?? 0
    seen.set(c.id, n + 1)
    return n === 0 ? c : { ...c, id: `${c.id}-${n + 1}` }
  })
}

/**
 * Parse a single TLDR markdown page into chunks. TLDR format:
 *   # tool
 *   > description
 *   - <intent>:
 *   `command with {{placeholder}}`
 */
export function chunkTldrPage(markdown: string, opts: { family: CommandFamily; source?: string }): CommandChunk[] {
  const source = opts.source ?? 'tldr'
  const lines = markdown.split(/\r?\n/)
  let tool = ''
  const chunks: CommandChunk[] = []
  let pendingIntent: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) {
      tool = trimmed.slice(2).trim()
      continue
    }
    if (trimmed.startsWith('- ')) {
      pendingIntent = trimmed.slice(2).trim()
      continue
    }
    // Command line: a single backtick-wrapped span.
    const cmdMatch = trimmed.match(/^`(.+)`$/)
    if (cmdMatch && pendingIntent) {
      const chunk = makeChunk(pendingIntent, cmdMatch[1]!, opts.family, source, tool || undefined)
      if (chunk) chunks.push(chunk)
      pendingIntent = null
    }
  }
  return dedupeIds(chunks)
}

export interface TldrPageEntry {
  markdown: string
  /** TLDR platform subdirectory: 'linux', 'osx', 'common', 'windows', etc. */
  platform?: string
  /** Corpus source tag (defaults to 'tldr'). */
  source?: string
}

/**
 * Convert an array of TLDR page entries into a flat, deduplicated chunk list.
 *
 * Platform → family mapping:
 *   'windows'          → 'windows'
 *   'linux'|'osx'|...' → 'unix'
 */
export function chunkTldrBatch(pages: readonly TldrPageEntry[]): CommandChunk[] {
  if (pages.length === 0) return []

  const all: CommandChunk[] = []
  for (const page of pages) {
    const family: CommandFamily = page.platform === 'windows' ? 'windows' : 'unix'
    const chunks = chunkTldrPage(page.markdown, { family, source: page.source ?? 'tldr' })
    all.push(...chunks)
  }
  return dedupeIds(all)
}

// ── Man page helpers ──────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True when a trimmed line looks like an executable command. */
function isManCommandLine(trimmed: string, tool: string): boolean {
  if (!trimmed) return false
  if (tool && new RegExp(`^${escapeRegex(tool)}(\\s|$)`).test(trimmed)) return true
  // Shell prompt prefixes ($ or #)
  if (/^[$#]\s/.test(trimmed)) return true
  return false
}

/** Strip leading `$ ` / `# ` shell prompt from a command line. */
function stripPrompt(cmd: string): string {
  return cmd.replace(/^[$#]\s+/, '').trim()
}

/**
 * Parse a plain-text man page (output of `man | col -b`) into CommandChunks.
 *
 * Chunks come from two sections:
 *  - SYNOPSIS: the first synopsis line becomes one chunk.
 *  - EXAMPLES (or EXAMPLE): one chunk per example entry.
 *
 * Sections BUGS, HISTORY, AUTHOR, COPYRIGHT, SEE ALSO, NOTES are discarded.
 *
 * Two EXAMPLES styles are auto-detected:
 *  - Style 1 (GNU): description block → blank → command block (alternate)
 *  - Style 2 (BSD): command + description in the same blank-delimited block
 */
export function chunkManPage(plainText: string, opts?: { source?: string }): CommandChunk[] {
  const source = opts?.source ?? 'local-man'
  const rawLines = plainText.split(/\r?\n/)

  // ── Extract tool name from NAME section ───────────────────────────────
  let tool = ''
  let capturingName = false
  for (const line of rawLines) {
    const trimmed = line.trim()
    if (/^NAME\s*$/.test(trimmed)) {
      capturingName = true
      continue
    }
    if (capturingName && /^[A-Z][A-Z ]*$/.test(trimmed) && !trimmed.includes('(')) break
    if (capturingName && trimmed.length > 0) {
      tool = trimmed.split(/[\s,]+/)[0] ?? ''
      break
    }
  }

  // ── Collect section contents, skipping unwanted sections ─────────────
  const SKIP = new Set([
    'HISTORY',
    'BUGS',
    'AUTHOR',
    'COPYRIGHT',
    'SEE ALSO',
    'NOTES',
    'REPORTING BUGS',
    'AVAILABILITY',
  ])

  // A section header is: ≤3-space indent, all-caps, no parens (exclude "TAR(1)")
  const isSectionHeader = (line: string): boolean => {
    if (!/^\s{0,3}[A-Z]/.test(line)) return false
    const t = line.trim()
    return /^[A-Z][A-Z ]+$/.test(t) && !t.includes('(')
  }

  let section = ''
  const synopsisLines: string[] = []
  const examplesLines: string[] = []

  for (const line of rawLines) {
    if (isSectionHeader(line)) {
      section = line.trim()
      continue
    }
    if (SKIP.has(section)) continue
    if (section === 'SYNOPSIS') synopsisLines.push(line)
    if (section === 'EXAMPLES' || section === 'EXAMPLE') examplesLines.push(line)
  }

  const chunks: CommandChunk[] = []

  // ── SYNOPSIS chunk ────────────────────────────────────────────────────
  const firstSynLine = synopsisLines.find((l) => l.trim().length > 0)
  if (firstSynLine) {
    const synCmd = firstSynLine.trim()
    const synTool = tool || primaryTool(synCmd)
    const chunk = makeChunk(`${synTool} command synopsis`, synCmd, 'unix', source, synTool)
    if (chunk) chunks.push(chunk)
  }

  // ── EXAMPLES chunks ───────────────────────────────────────────────────
  // Split into blank-delimited blocks
  const blocks: string[][] = []
  let blk: string[] = []
  for (const line of examplesLines) {
    if (line.trim().length === 0) {
      if (blk.length > 0) {
        blocks.push(blk)
        blk = []
      }
    } else {
      blk.push(line.trim())
    }
  }
  if (blk.length > 0) blocks.push(blk)

  if (blocks.length > 0) {
    // Detect style: if the first block has a command line → style 2, else style 1
    const firstBlockHasCmd = blocks[0]!.some((l) => isManCommandLine(l, tool))

    if (!firstBlockHasCmd) {
      // Style 1 (GNU): blocks alternate [prose, command, prose, command, ...]
      for (let i = 0; i + 1 < blocks.length; i += 2) {
        const intent = blocks[i]!.join(' ').replace(/\s+/g, ' ')
        const cmdBlock = blocks[i + 1]!
        const cmdLine = cmdBlock.find((l) => isManCommandLine(l, tool)) ?? cmdBlock[0] ?? ''
        const command = stripPrompt(cmdLine)
        if (!command) continue
        const t = tool || primaryTool(command)
        const chunk = makeChunk(intent || command, command, 'unix', source, t)
        if (chunk) chunks.push(chunk)
      }
    } else {
      // Style 2 (BSD): each block has command + optional description
      for (const b of blocks) {
        const cmdLine = b.find((l) => isManCommandLine(l, tool)) ?? b[0] ?? ''
        const command = stripPrompt(cmdLine)
        if (!command) continue
        const descLines = b.filter((l) => l !== cmdLine)
        const intent = descLines.join(' ').replace(/\s+/g, ' ')
        const t = tool || primaryTool(command)
        const chunk = makeChunk(intent || command, command, 'unix', source, t)
        if (chunk) chunks.push(chunk)
      }
    }
  }

  return dedupeIds(chunks)
}

/** Minimal shape of a harness command-registry entry (subset reused here). */
export interface HarnessCommandLike {
  name: string
  parent?: string
  description: string
}

/**
 * The registry speaks two dialects: `{name: 'show', parent: 'node'}` and
 * `{name: 'node show', parent: 'node'}`. Prepending the parent unconditionally turned the
 * second into `agf node node show`. Normalise here — one choke point — rather than in the
 * twenty-five entries that would drift again.
 */
export function commandPath(name: string, parent?: string): string {
  if (!parent) return name
  return name === parent || name.startsWith(`${parent} `) ? name : `${parent} ${name}`
}

/**
 * Derive harness chunks from the CLI command registry (dogfooding 1.4) — the
 * agent auto-operates via retrieval. Deterministic, no shell-out: one chunk per
 * `agf` (sub)command, `family: 'harness'`, intent = its description.
 *
 * The command it emits is meant to be pasted and run. A malformed one is worse than no
 * answer: the agent trusts the retrieval and burns a turn on a command that never existed.
 */
export function chunkHarnessCommands(entries: readonly HarnessCommandLike[]): CommandChunk[] {
  const chunks: CommandChunk[] = []
  for (const e of entries) {
    const path = commandPath(e.name, e.parent)
    const command = `agf ${path}`
    // The full path seeds the id, so `agf node show` and `agf node rm` stay distinct chunks even
    // when two commands share a description. `tool` is the binary — it is what availability
    // checks look for on PATH, and `agf node show` is not an executable.
    const chunk = makeChunk(e.description || path, command, 'harness', 'harness', command)
    if (chunk) chunks.push({ ...chunk, tool: 'agf' })
  }
  return dedupeIds(chunks)
}

/**
 * Parse PowerShell `Get-Help <cmdlet> -Full` text into chunks — one per
 * Example block. Each block has a "----- Example N -----" header, a prose
 * description line, and a `PS C:\>` command line.
 */
export function chunkPowerShellHelp(helpText: string, opts?: { source?: string }): CommandChunk[] {
  const source = opts?.source ?? 'powershell-docs'
  const nameMatch = helpText.match(/NAME\s*\n\s*([A-Za-z][\w-]*)/)
  const tool = nameMatch ? nameMatch[1]! : ''
  const blocks = helpText.split(/-+\s*Example\s+\d+\s*-+/i).slice(1)
  const chunks: CommandChunk[] = []

  for (const block of blocks) {
    const blockLines = block.split(/\r?\n/).map((l) => l.trim())
    const cmdLineIdx = blockLines.findIndex((l) => /^PS\b.*>/.test(l))
    if (cmdLineIdx === -1) continue
    const command = blockLines[cmdLineIdx]!.replace(/^PS\b[^>]*>\s*/, '').trim()
    // Description = last non-empty prose line before the command.
    let intent = ''
    for (let i = cmdLineIdx - 1; i >= 0; i--) {
      if (blockLines[i] && blockLines[i]!.length > 0) {
        intent = blockLines[i]!
        break
      }
    }
    const chunk = makeChunk(intent || command, command, 'powershell', source, tool || undefined)
    if (chunk) chunks.push(chunk)
  }
  return dedupeIds(chunks)
}
