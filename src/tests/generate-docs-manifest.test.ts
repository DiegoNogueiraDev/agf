/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/docs/generate-docs-manifest.ts (node_wire_a6f18bb469e4) —
 * pure `buildDocsManifest`/`writeDocsManifest` extraction wired into
 * `agf docs manifest`.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDocsManifest, writeDocsManifest } from '../core/docs/generate-docs-manifest.js'

describe('buildDocsManifest', () => {
  it('discovers categorized docs and returns empty tools/routes when those dirs are absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'agf-docs-manifest-'))
    try {
      const docsDir = join(root, 'docs', 'guides')
      mkdirSync(docsDir, { recursive: true })
      writeFileSync(join(docsDir, 'getting-started.md'), '# Getting Started\n')

      const manifest = buildDocsManifest(root)

      expect(manifest.tools).toEqual([])
      expect(manifest.routes).toEqual([])
      expect(manifest.docs).toHaveLength(1)
      expect(manifest.docs[0]).toMatchObject({
        slug: 'guides/getting-started',
        title: 'Getting Started',
        category: 'guides',
      })
      expect(manifest.generatedAt).toEqual(expect.any(String))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('writeDocsManifest', () => {
  it('writes the built manifest as JSON to the resolved out path', () => {
    const root = mkdtempSync(join(tmpdir(), 'agf-docs-manifest-write-'))
    try {
      const outPath = join(root, 'manifest.json')
      const { manifest, outPath: resolvedPath } = writeDocsManifest(root, outPath)

      expect(resolvedPath).toBe(outPath)
      expect(existsSync(outPath)).toBe(true)
      const written = JSON.parse(readFileSync(outPath, 'utf-8'))
      expect(written.docs).toEqual(manifest.docs)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
