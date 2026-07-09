/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Generate Docs Manifest — build-time script that pre-computes
 * tools, routes, and docs into a single JSON file for npm-installed users.
 *
 * Run after `tsc`: `node dist/core/docs/generate-docs-manifest.js`
 */

import { writeFileSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { introspectTools } from './tool-introspector.js'
import { introspectRoutes } from './route-introspector.js'
import type { ToolInfo } from './tool-introspector.js'
import type { RouteInfo } from './route-introspector.js'

interface ManifestDocEntry {
  slug: string
  title: string
  category: string
  content: string
}

export interface DocsManifest {
  generatedAt: string
  tools: ToolInfo[]
  routes: RouteInfo[]
  docs: ManifestDocEntry[]
}

function discoverDocsWithContent(docsDir: string): ManifestDocEntry[] {
  if (!existsSync(docsDir)) return []

  const entries: ManifestDocEntry[] = []
  const categories = readdirSync(docsDir).filter((d) => {
    const full = path.join(docsDir, d)
    return existsSync(full) && statSync(full).isDirectory()
  })

  for (const category of categories) {
    const catDir = path.join(docsDir, category)
    const files = readdirSync(catDir).filter((f) => f.endsWith('.md'))

    for (const file of files) {
      const slug = `${category}/${file.replace(/\.md$/, '')}`
      const title = file
        .replace(/\.md$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
      const content = readFileSync(path.join(catDir, file), 'utf-8')

      entries.push({ slug, title, category, content })
    }
  }

  return entries
}

/** Builds the manifest in memory from a project root — no filesystem writes. */
export function buildDocsManifest(projectRoot: string): DocsManifest {
  const toolsDir = path.join(projectRoot, 'src', 'mcp', 'tools')
  const apiDir = path.join(projectRoot, 'src', 'api')
  const docsDir = path.join(projectRoot, 'docs')

  const tools = existsSync(toolsDir) ? introspectTools(toolsDir) : []
  const routes = existsSync(apiDir) ? introspectRoutes(apiDir) : []
  const docs = discoverDocsWithContent(docsDir)

  return {
    generatedAt: new Date().toISOString(),
    tools,
    routes,
    docs,
  }
}

/** Builds the manifest and writes it to `outPath` (default: `<projectRoot>/dist/docs-manifest.json`). */
export function writeDocsManifest(
  projectRoot: string,
  outPath: string = path.join(projectRoot, 'dist', 'docs-manifest.json'),
): { manifest: DocsManifest; outPath: string } {
  const manifest = buildDocsManifest(projectRoot)
  writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf-8')
  return { manifest, outPath }
}

function generate(): void {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  // Resolve project root: dist/core/docs/ → project root
  const projectRoot = path.resolve(__dirname, '..', '..', '..')
  const { manifest, outPath } = writeDocsManifest(projectRoot)

  process.stderr.write(
    `[INFO] docs-manifest: generated ${manifest.tools.length} tools, ${manifest.routes.length} routes, ${manifest.docs.length} docs → ${outPath}\n`,
  )
}

// Only auto-run when executed directly as a script (`node dist/core/docs/generate-docs-manifest.js`);
// importing this module elsewhere (e.g. the CLI) must not trigger a filesystem write.
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMainModule) {
  generate()
}
