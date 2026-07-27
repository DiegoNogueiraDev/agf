/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `agf docs` — CLI surface for the dormant DocsCacheStore (node_wire_2a6a50a2f98f):
 * `list` (all cached library docs), `search <query>` (FTS5 lookup), and the
 * dormant DocsSyncer (node_wire_5a78784425e2): `sync <libName>` fetches via
 * Context7 (or its graceful fallback when CONTEXT7_URL is unset) and upserts
 * into the cache. Also wires the dormant generate-docs-manifest
 * (node_wire_a6f18bb469e4): `manifest` introspects tools/routes/docs into a
 * single manifest, optionally writing it to disk via `--out`. And the
 * dormant docs stack-detector (node_wire_ec9ab1d1eeff): `stack` reads
 * package.json/requirements.txt/go.mod to report the project's runtime and
 * libraries — useful ahead of `docs sync` to know which libs to fetch.
 *
 * `generate` is a separate, deterministic and provider-free feature: living,
 * agent-oriented markdown derived purely from graph nodes (zero tokens, works
 * in delegate mode). Its `--check` reuses the doc-sync-guard drift detector
 * instead of writing, closing the loop the hook opened (drift detected ⇒
 * regenerate).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { DocsCacheStore } from '../../core/docs/docs-cache-store.js'
import { DocsSyncer } from '../../core/docs/docs-syncer.js'
import { createMcpContext7Fetcher } from '../../core/docs/mcp-context7-fetcher.js'
import { buildDocsManifest, writeDocsManifest } from '../../core/docs/generate-docs-manifest.js'
import { detectStack } from '../../core/docs/stack-detector.js'
import { generateGraphDocs, type DocGraph } from '../../core/docs/graph-docs.js'
import { checkDocSync } from '../../core/hooks/doc-sync-hook.js'
import { createCliOutput } from '../shared/cli-output.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'docs-cmd.ts' })

/** Builds the `agf docs` CLI command with `list`, `search`, `sync`, `manifest`, `stack`, and `generate` sub-commands. */
export function docsCommand(): Command {
  log.info('docs command registered')
  const cmd = new Command('docs').description('Inspect the local docs cache (Context7-backed library docs)')

  cmd
    .command('list')
    .description('List cached library docs')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('docs.list')
      try {
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const docs = new DocsCacheStore(store.getDb()).listCached()
          out.ok({ docs, total: docs.length })
        } finally {
          store.close()
        }
      } catch (err) {
        out.err('DOCS_LIST_FAILED', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('search <query>')
    .description('Full-text search cached library docs')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--limit <n>', 'Maximum results to return', '20')
    .action((query: string, opts: { dir: string; limit: string }) => {
      const out = createCliOutput('docs.search')
      try {
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const results = new DocsCacheStore(store.getDb()).searchDocs(query, parseInt(opts.limit, 10))
          out.ok({ results, total: results.length })
        } finally {
          store.close()
        }
      } catch (err) {
        out.err('DOCS_SEARCH_FAILED', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('sync <libName>')
    .description('Fetch a library doc via Context7 and upsert it into the docs cache')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(async (libName: string, opts: { dir: string }) => {
      const out = createCliOutput('docs.sync')
      try {
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const syncer = new DocsSyncer(new DocsCacheStore(store.getDb()), createMcpContext7Fetcher())
          const doc = await syncer.syncLib(libName)
          out.ok({ doc })
        } finally {
          store.close()
        }
      } catch (err) {
        out.err('DOCS_SYNC_FAILED', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('manifest')
    .description('Introspect tools/routes/docs into a manifest (optionally writing it to disk)')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .option('--out <path>', 'Write the manifest as JSON to this path')
    .action((opts: { dir: string; out?: string }) => {
      const out = createCliOutput('docs.manifest')
      try {
        if (opts.out) {
          const { manifest, outPath } = writeDocsManifest(opts.dir, opts.out)
          out.ok({
            generatedAt: manifest.generatedAt,
            tools: manifest.tools,
            routes: manifest.routes,
            docs: manifest.docs.map(({ slug, title, category }) => ({ slug, title, category })),
            outPath,
          })
        } else {
          const manifest = buildDocsManifest(opts.dir)
          out.ok({
            generatedAt: manifest.generatedAt,
            tools: manifest.tools,
            routes: manifest.routes,
            docs: manifest.docs.map(({ slug, title, category }) => ({ slug, title, category })),
          })
        }
      } catch (err) {
        out.err('DOCS_MANIFEST_FAILED', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('stack')
    .description("Detect the project's stack (package.json/requirements.txt/go.mod) for docs sync targeting")
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .action(async (opts: { dir: string }) => {
      const out = createCliOutput('docs.stack')
      try {
        const stack = await detectStack(opts.dir)
        out.ok({ stack })
      } catch (err) {
        out.err('DOCS_STACK_FAILED', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('generate')
    .description('Generate living, agent-oriented docs from the graph (deterministic, zero tokens)')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .option('-o, --out <file>', 'Output path relative to --dir', 'docs/graph-overview.md')
    .option('--check', 'Report doc drift via doc-sync-guard without writing')
    .option('--stdout', 'Return the markdown in the envelope instead of writing a file')
    .action((opts: { dir: string; out: string; check?: boolean; stdout?: boolean }) => {
      const out = createCliOutput('docs.generate')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        if (opts.check) {
          const report = checkDocSync({ cwd: opts.dir })
          out.ok({
            mode: 'check',
            checked: report.checked,
            driftCount: report.advisories.length,
            advisories: report.advisories,
          })
          return
        }

        const doc = store.toGraphDocument()
        const graph: DocGraph = {
          project: { name: doc.project.name },
          nodes: doc.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            status: n.status,
            parentId: n.parentId,
            ac: n.acceptanceCriteria,
          })),
        }
        const markdown = generateGraphDocs(graph)

        if (opts.stdout) {
          out.ok({ mode: 'generate', nodeCount: doc.nodes.length, bytes: markdown.length, markdown })
          return
        }

        const target = resolve(opts.dir, opts.out)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, markdown)
        out.ok({
          mode: 'generate',
          path: relative(opts.dir, target),
          nodeCount: doc.nodes.length,
          bytes: markdown.length,
        })
      } finally {
        store.close()
      }
    })

  return cmd
}
