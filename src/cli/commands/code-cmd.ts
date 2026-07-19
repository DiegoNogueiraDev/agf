/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { CodeStore } from '../../core/code/code-store.js'
import { reindexCodeForProject } from '../../core/code/code-indexer.js'
import { analyzeImpact } from '../../core/code/graph-traversal.js'
import { buildSkeletonizeReport } from '../../core/analyzer/adaptive-skeletonizer.js'
import { analyzeDeepModule, summarizeDepth } from '../../core/analyzer/deep-module.js'
import { auditFile, extractImportSpecifiers } from '../../core/analyzer/seam-audit.js'
import {
  analyzeZoomOut,
  resolveModuleSpecifier,
  CENTRAL_FAN_IN_THRESHOLD,
  type ImportEdge,
} from '../../core/analyzer/zoom-out.js'
import type { CodeSymbol } from '../../core/code/code-types.js'
import { TEST_OR_DECL_PATTERN } from '../../core/code/code-indexer.js'
import { createCliOutput } from '../shared/cli-output.js'
import { buildEnrichedContext } from '../../core/integrations/enriched-context.js'
import { parseYaml } from '../../core/parser/read-yaml.js'
import { parseToml } from '../../core/parser/read-toml.js'
import { parseSql } from '../../core/parser/read-sql.js'
import { parseGraphql } from '../../core/parser/read-graphql.js'
import { parseTerraform } from '../../core/parser/read-terraform.js'
import { parseEnv } from '../../core/parser/read-env.js'
import { parseMakefile } from '../../core/parser/read-makefile.js'
import { parseDockerfile } from '../../core/parser/read-dockerfile.js'
import { findReferencingSymbols } from '../../core/code/code-referencing.js'
import { searchCodeSymbols } from '../../core/code/code-search.js'
import { syncGraphFromCode } from '../../core/code/graph-sync.js'
import { detectProcesses } from '../../core/code/process-detector.js'
import { analyzeFile } from '../../core/code/ts-analyzer.js'
import { detectContractDrift } from '../../core/scaffolder/contract-drift-detector.js'
import type { ContractSignature } from '../../core/scaffolder/contract-drift-detector.js'

const log = createLogger({ layer: 'cli', source: 'code-cmd.ts' })

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

/** Structural parser dispatch by extension/basename for `code inspect-config`. */
function dispatchConfigParser(filePath: string, content: string): { format: string; result: unknown } | null {
  const base = path.basename(filePath).toLowerCase()
  const ext = path.extname(filePath).toLowerCase()

  if (base === 'makefile') return { format: 'makefile', result: parseMakefile(content) }
  if (base === 'dockerfile') return { format: 'dockerfile', result: parseDockerfile(content) }
  // path.extname('.env') === '' (dotfiles have no extension per POSIX convention) — match by basename
  if (base === '.env' || base.startsWith('.env.')) return { format: 'env', result: parseEnv(content) }

  switch (ext) {
    case '.yaml':
    case '.yml':
      return { format: 'yaml', result: parseYaml(content) }
    case '.toml':
      return { format: 'toml', result: parseToml(content) }
    case '.sql':
      return { format: 'sql', result: parseSql(content) }
    case '.graphql':
    case '.gql':
      return { format: 'graphql', result: parseGraphql(content) }
    case '.tf':
      return { format: 'terraform', result: parseTerraform(content) }
    default:
      return null
  }
}

function parseFileLine(input: string): { file: string; line: number } {
  const colonIdx = input.lastIndexOf(':')
  if (colonIdx === -1 || colonIdx === input.length - 1) {
    return { file: input, line: 1 }
  }
  const file = input.slice(0, colonIdx)
  const line = Number(input.slice(colonIdx + 1))
  if (Number.isNaN(line) || line < 1) {
    return { file: input, line: 1 }
  }
  return { file, line }
}

/** Builds the `agf code` CLI command (Commander definition). */
export function codeCommand(): Command {
  log.info('code command registered')

  const cmd = new Command('code').description(
    'Code intelligence: index, search, navigate, impact analysis, LSP diagnostics',
  )

  cmd
    .command('index', { isDefault: true })
    .description('Index the project codebase (symbols + relations via tree-sitter)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--force', 'Force full reindex (incremental by default)', false)
    .action(async (opts: { dir: string; force: boolean }) => {
      const out = createCliOutput('code-index')
      const store = openStoreOrFail(opts.dir)
      try {
        const basePath = path.resolve(opts.dir)
        progress(`Indexing project at ${basePath}...`)
        const result = await reindexCodeForProject(store, basePath)
        out.ok({
          fileCount: result.fileCount,
          symbolCount: result.symbolCount,
          relationCount: result.relationCount,
        })
      } catch (err) {
        out.err('INDEX_FAILED', err instanceof Error ? err.message : String(err))
      } finally {
        store.close()
      }
    })

  cmd
    .command('search <query>')
    .description('Search code symbols via FTS5 (full-text), with optional TF-IDF reranking and module grouping')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--kind <kind>', 'Filter by symbol kind (function, class, method, etc.)')
    .option('--language <lang>', 'Filter by language (typescript, python, go, etc.)')
    .option('--limit <n>', 'Max results', '20')
    .option('--rerank', 'Rerank candidates with TF-IDF for better relevance ordering', false)
    .option('--group-by-module', 'Sort results by module path (grouping related files together)', false)
    .action(
      async (
        query: string,
        opts: { dir: string; kind?: string; language?: string; limit: string; rerank: boolean; groupByModule: boolean },
      ) => {
        const out = createCliOutput('code-search')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const codeStore = new CodeStore(store.getDb())
          const project = store.getProject()
          if (!project) {
            out.err('NOT_FOUND', 'No project found — run agf init first.')
            return
          }
          const limit = Number(opts.limit) || 20
          const results = searchCodeSymbols(codeStore, query, project.id, {
            limit,
            rerank: opts.rerank,
            groupByModule: opts.groupByModule,
            language: opts.language,
          })

          const filtered = opts.kind ? results.filter((r) => r.symbol.kind === opts.kind) : results

          out.ok(
            filtered.map((r) => ({
              name: r.symbol.name,
              kind: r.symbol.kind,
              file: r.symbol.file,
              line: r.symbol.startLine,
              score: r.score,
            })),
          )
        } finally {
          store.close()
        }
      },
    )

  cmd
    .command('callers <file:line>')
    .description('List all callers (incoming relations) of the symbol at file:line')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(async (fileLine: string, opts: { dir: string }) => {
      const out = createCliOutput('code-callers')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const codeStore = new CodeStore(store.getDb())
        const project = store.getProject()
        if (!project) {
          out.err('NOT_FOUND', 'No project found — run agf init first.')
          return
        }
        const { file, line } = parseFileLine(fileLine)
        const sym = codeStore.findSymbolAtLine(file, line, project.id)
        if (!sym) {
          out.err('NOT_FOUND', `No symbol found at ${file}:${line}`)
          return
        }
        const incoming = codeStore.getRelationsTo(sym.id)
        const resolved: CodeSymbol[] = []
        for (const rel of incoming) {
          const from = codeStore.getSymbol(rel.fromSymbol)
          if (from) resolved.push(from)
        }
        out.ok({
          symbol: { name: sym.name, kind: sym.kind, file: sym.file, line: sym.startLine },
          callers: resolved.map((s) => ({ name: s.name, kind: s.kind, file: s.file, line: s.startLine })),
        })
      } finally {
        store.close()
      }
    })

  cmd
    .command('callees <file:line>')
    .description('List all callees (outgoing relations) of the symbol at file:line')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(async (fileLine: string, opts: { dir: string }) => {
      const out = createCliOutput('code-callees')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const codeStore = new CodeStore(store.getDb())
        const project = store.getProject()
        if (!project) {
          out.err('NOT_FOUND', 'No project found — run agf init first.')
          return
        }
        const { file, line } = parseFileLine(fileLine)
        const sym = codeStore.findSymbolAtLine(file, line, project.id)
        if (!sym) {
          out.err('NOT_FOUND', `No symbol found at ${file}:${line}`)
          return
        }
        const outgoing = codeStore.getRelationsFrom(sym.id)
        const resolved: CodeSymbol[] = []
        for (const rel of outgoing) {
          const to = codeStore.getSymbol(rel.toSymbol)
          if (to) resolved.push(to)
        }
        out.ok({
          symbol: { name: sym.name, kind: sym.kind, file: sym.file, line: sym.startLine },
          callees: resolved.map((s) => ({ name: s.name, kind: s.kind, file: s.file, line: s.startLine })),
        })
      } finally {
        store.close()
      }
    })

  cmd
    .command('def <symbol>')
    .description('Find the definition location of a symbol by name')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--kind <kind>', 'Filter by symbol kind')
    .action(async (symbolName: string, opts: { dir: string; kind?: string }) => {
      const out = createCliOutput('code-def')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const codeStore = new CodeStore(store.getDb())
        const project = store.getProject()
        if (!project) {
          out.err('NOT_FOUND', 'No project found — run agf init first.')
          return
        }
        let symbols = codeStore.findSymbolsByName(symbolName, project.id)
        if (opts.kind) symbols = symbols.filter((s) => s.kind === opts.kind)
        out.ok({
          name: symbolName,
          matches: symbols.length,
          symbols: symbols.map((s) => ({
            name: s.name,
            kind: s.kind,
            file: s.file,
            line: s.startLine,
            signature: s.signature,
            language: s.language,
          })),
        })
      } finally {
        store.close()
      }
    })

  cmd
    .command('refs <symbol>')
    .description('List all references to a symbol by name')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--file-scope <file>', 'Limit references to a specific file')
    .action(async (symbolName: string, opts: { dir: string; fileScope?: string }) => {
      const out = createCliOutput('code-refs')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const codeStore = new CodeStore(store.getDb())
        const project = store.getProject()
        if (!project) {
          out.err('NOT_FOUND', 'No project found — run agf init first.')
          return
        }
        if (codeStore.findSymbolsByName(symbolName, project.id).length === 0) {
          out.err(
            'NOT_FOUND',
            `Symbol "${symbolName}" not found. Use 'agf code search "${symbolName}"' for partial matching.`,
          )
          return
        }
        const refs = findReferencingSymbols(codeStore, symbolName, project.id, opts.fileScope)
        out.ok({ symbol: symbolName, count: refs.length, references: refs })
      } finally {
        store.close()
      }
    })

  cmd
    .command('context <symbol>')
    .description('Enriched context for a symbol: relevant project memories + code graph data, combined')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--timeout-ms <n>', 'Per-source timeout in ms', '5000')
    .action(async (symbolName: string, opts: { dir: string; timeoutMs: string }) => {
      const out = createCliOutput('code-context')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const project = store.getProject()
        if (!project) {
          out.err('NOT_FOUND', 'No project found — run agf init first.')
          return
        }
        const context = await buildEnrichedContext(symbolName, opts.dir, Number(opts.timeoutMs), {
          db: store.getDb(),
          projectId: project.id,
        })
        out.ok(context)
      } finally {
        store.close()
      }
    })

  cmd
    .command('impact <file> [symbol]')
    .description('Analyze blast radius: symbols affected by changes in a file')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--direction <dir>', 'upstream (who depends on) or downstream (what depends on)', 'upstream')
    .option('--depth <n>', 'BFS max depth', '3')
    .action(
      async (file: string, symbol: string | undefined, opts: { dir: string; direction: string; depth: string }) => {
        const out = createCliOutput('code-impact')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const codeStore = new CodeStore(store.getDb())
          const project = store.getProject()
          if (!project) {
            out.err('NOT_FOUND', 'No project found — run agf init first.')
            return
          }

          let symbols = codeStore.findSymbolsByFile(file, project.id)
          if (symbol) symbols = symbols.filter((s) => s.name === symbol)

          if (symbols.length === 0) {
            out.err('NOT_FOUND', `No symbols found in ${file}. Run 'agf code index' first.`)
            return
          }

          const maxDepth = Number(opts.depth) || 3
          const direction = (opts.direction === 'downstream' ? 'downstream' : 'upstream') as 'upstream' | 'downstream'

          const allAffected = new Map<string, { name: string; file: string; confidence: number; depth: number }>()
          for (const sym of symbols) {
            const impact = analyzeImpact(codeStore, sym.name, project.id, direction, maxDepth)
            for (const a of impact.affectedSymbols) {
              const key = `${a.name}@${a.file}`
              const existing = allAffected.get(key)
              if (!existing || existing.confidence < a.confidence) {
                allAffected.set(key, { ...a, depth: a.depth ?? 0 })
              }
            }
          }

          out.ok({
            file,
            symbol: symbol ?? '(all)',
            direction,
            sourceCount: symbols.length,
            affectedCount: allAffected.size,
            affected: [...allAffected.values()].map((a) => ({ ...a, confidence: Math.round(a.confidence * 100) })),
          })
        } finally {
          store.close()
        }
      },
    )

  cmd
    .command('affected <file>')
    .description('Show which test files reference symbols in the given file')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(async (file: string, opts: { dir: string }) => {
      const out = createCliOutput('code-affected')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const codeStore = new CodeStore(store.getDb())
        const project = store.getProject()
        if (!project) {
          out.err('NOT_FOUND', 'No project found — run agf init first.')
          return
        }
        const symbols = codeStore.findSymbolsByFile(file, project.id)
        if (symbols.length === 0) {
          out.err(
            'NOT_FOUND',
            `No symbols found at "${file}". Use 'agf code def <symbol>' to search by symbol name, or 'agf code index' if you haven't indexed yet.`,
          )
          return
        }
        const symbolIds = symbols.map((s) => s.id)
        const allRefs = codeStore.getReferencingRows(symbolIds, project.id)
        const testRefs = allRefs.filter((r) => TEST_OR_DECL_PATTERN.test(r.ref_file))

        const byFile = new Map<string, number>()
        for (const r of testRefs) {
          byFile.set(r.ref_file, (byFile.get(r.ref_file) ?? 0) + 1)
        }

        out.ok({
          file,
          sourceSymbols: symbols.length,
          testFiles: [...byFile.entries()].map(([f, count]) => ({ file: f, references: count })),
          references: testRefs,
        })
      } finally {
        store.close()
      }
    })

  cmd
    .command('skeleton-plan')
    .description(
      'Detect polymorphic supertypes (>=3 implementations) and report an adaptive skeletonize plan — ' +
        'dry-run, no file writes. Flags off-spine sibling bodies that can be stubbed to shrink repo-map token cost.',
    )
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(async (opts: { dir: string }) => {
      const out = createCliOutput('code-skeleton-plan')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const codeStore = new CodeStore(store.getDb())
        const project = store.getProject()
        if (!project) {
          out.err('NOT_FOUND', 'No project found — run agf init first.')
          return
        }
        const report = buildSkeletonizeReport(codeStore, project.id)
        out.ok({ supertypeCount: report.length, report })
      } finally {
        store.close()
      }
    })

  cmd
    .command('deep-modules')
    .description(
      'Classify source files by depth ratio (exported LOC / total LOC) — Ousterhout deep-module ' +
        'heuristic. Flags shallow modules (wide interface, thin implementation) as refactor candidates.',
    )
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--path <glob>', 'Glob pattern (relative to dir) for source files', 'src/**/*.ts')
    .action((opts: { dir: string; path: string }) => {
      const out = createCliOutput('code-deep-modules')
      const files = globSync(opts.path, {
        cwd: opts.dir,
        ignore: ['**/*.test.ts', '**/*.bench.ts', '**/node_modules/**'],
      })
      const reports = files.map((file) => analyzeDeepModule(file, readFileSync(path.join(opts.dir, file), 'utf-8')))
      out.ok(summarizeDepth(reports))
    })

  cmd
    .command('seams')
    .description(
      'Classify each file import into a seam category (in-process, local-substitutable, remote-owned, ' +
        'true-external) — surfaces true-external deps that need an adapter wrapper before core code depends on them.',
    )
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--path <glob>', 'Glob pattern (relative to dir) for source files', 'src/**/*.ts')
    .action((opts: { dir: string; path: string }) => {
      const out = createCliOutput('code-seams')
      const files = globSync(opts.path, {
        cwd: opts.dir,
        ignore: ['**/*.test.ts', '**/*.bench.ts', '**/node_modules/**'],
      })
      const reports = files.map((file) => auditFile(file, readFileSync(path.join(opts.dir, file), 'utf-8')))
      // Named `byCategory`, not `summary` — the latter is a global AI-compression noise key
      // (src/core/output/ai-compress.ts) and would be silently stripped from agent-facing output.
      const byCategory: Record<string, number> = {
        'in-process': 0,
        'local-substitutable': 0,
        'remote-owned': 0,
        'true-external': 0,
      }
      for (const r of reports) {
        for (const [category, count] of Object.entries(r.summary)) {
          byCategory[category] += count
        }
      }
      out.ok({ fileCount: reports.length, byCategory, reports })
    })

  cmd
    .command('zoom-out')
    .description(
      'Caller-graph overview: fan-in/fan-out per file from relative imports — surfaces central modules ' +
        '(high fan-in), leaves and islands (unreferenced), plus a mermaid digraph.',
    )
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--path <glob>', 'Glob pattern (relative to dir) for source files', 'src/**/*.ts')
    .option('--threshold <n>', 'Fan-in threshold to classify a file as central', String(CENTRAL_FAN_IN_THRESHOLD))
    .action((opts: { dir: string; path: string; threshold: string }) => {
      const out = createCliOutput('code-zoom-out')
      const files = globSync(opts.path, {
        cwd: opts.dir,
        ignore: ['**/*.test.ts', '**/*.bench.ts', '**/node_modules/**'],
      })
      const knownFiles = new Set(files)
      const edges: ImportEdge[] = []
      for (const file of files) {
        const content = readFileSync(path.join(opts.dir, file), 'utf-8')
        for (const specifier of extractImportSpecifiers(content)) {
          const resolved = resolveModuleSpecifier(file, specifier, knownFiles)
          if (resolved) edges.push({ from: file, to: resolved })
        }
      }
      const threshold = Number(opts.threshold) || CENTRAL_FAN_IN_THRESHOLD
      const report = analyzeZoomOut(files, edges, threshold)
      out.ok(report)
    })

  cmd
    .command('inspect-config <file>')
    .description(
      'Structural preview of a config/schema file — dispatches by extension/basename to a deterministic ' +
        'parser (yaml, toml, sql, graphql, terraform, env, Makefile, Dockerfile). Zero LLM calls.',
    )
    .action((file: string) => {
      const out = createCliOutput('code-inspect-config')
      const content = readFileSync(file, 'utf-8')
      const parsed = dispatchConfigParser(file, content)
      if (!parsed) {
        out.err(
          'UNSUPPORTED_FORMAT',
          `No structural parser for "${file}". Supported: yaml, toml, sql, graphql, terraform, env, Makefile, Dockerfile.`,
        )
        return
      }
      out.ok({ format: parsed.format, ...(parsed.result as Record<string, unknown>) })
    })

  cmd
    .command('sync-check')
    .description(
      'Detect drift between graph nodes and the code index — stale sourceRefs, missing testFiles, ' +
        'done tasks without test references. Run `agf code index` first for accurate results.',
    )
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('code-sync-check')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok(syncGraphFromCode(store))
      } finally {
        store.close()
      }
    })

  cmd
    .command('contract-drift <nodeId> <file>')
    .description(
      "Compare a 'contract' node's declared method signatures (graph side, stored under " +
        'node.metadata.methods as Record<name, signature>) against the implementation in <file> ' +
        '(code side, parsed via the TS analyzer) — reports added/removed/changed methods.',
    )
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(async (nodeId: string, file: string, opts: { dir: string }) => {
      const out = createCliOutput('code-contract-drift')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const node = store.getNodeById(nodeId)
        if (!node) {
          out.err('NOT_FOUND', `Node "${nodeId}" não encontrado no grafo`)
          return
        }
        if (node.type !== 'contract') {
          out.err('NOT_A_CONTRACT', `Node "${nodeId}" não é do tipo "contract" (é "${node.type}")`)
          return
        }

        const graphSig: ContractSignature = {
          methods: (node.metadata?.methods as Record<string, string> | undefined) ?? {},
        }

        const absFile = path.resolve(opts.dir, file)
        const analyzed = await analyzeFile(absFile, opts.dir)
        const codeSig: ContractSignature = { methods: {} }
        for (const sym of analyzed.symbols) {
          if (sym.kind === 'method' || sym.kind === 'function') {
            codeSig.methods[sym.name] = sym.signature ?? '()'
          }
        }

        const report = detectContractDrift(node.title, graphSig, codeSig)
        out.ok(report)
      } finally {
        store.close()
      }
    })

  cmd
    .command('processes')
    .description(
      'Detect execution entry points (exported functions/methods with no incoming calls) and trace ' +
        'their call chains — a map of what actually runs in this codebase.',
    )
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('code-processes')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const codeStore = new CodeStore(store.getDb())
        const project = store.getProject()
        if (!project) {
          out.err('NOT_FOUND', 'No project found — run agf init first.')
          return
        }
        const processes = detectProcesses(codeStore, project.id)
        out.ok({ count: processes.length, processes })
      } finally {
        store.close()
      }
    })

  return cmd
}
