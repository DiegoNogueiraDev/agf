/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * marketplace-types — contracts for the git-based marketplace (EPIC G).
 *
 * WHY: single source of truth for the MarketplaceSource/MarketplaceItem shapes
 * shared by the registry, the indexer and the CLI. Types are inferred from the
 * Zod schemas (boundary validation) so they never drift.
 */
import { z } from 'zod'

/** Typed error for every marketplace failure (clone, index, validation). */
export class MarketplaceError extends Error {
  public readonly context: Record<string, unknown>

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message)
    this.name = 'MarketplaceError'
    this.context = { ...context }
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** A remote git source that can be cloned and indexed. */
export const marketplaceSourceSchema = z.object({
  id: z.string().min(1).describe('stable source id (derived from the git url)'),
  gitUrl: z.string().min(1).describe('git url or file:// path'),
  ref: z.string().min(1).default('HEAD').describe('branch/tag/commit to check out'),
  cacheDir: z.string().min(1).describe('local directory the source is cloned into'),
})
export type MarketplaceSource = z.infer<typeof marketplaceSourceSchema>

/** An installable item discovered inside a cloned source. */
export const marketplaceItemSchema = z.object({
  id: z.string().min(1).describe('item id (folder name)'),
  kind: z.enum(['skill', 'plugin']).describe('what the item installs as'),
  sourceId: z.string().min(1).describe('owning MarketplaceSource id'),
  manifestPath: z.string().min(1).describe('absolute path to SKILL.md / plugin.json'),
  version: z.string().min(1).default('0.0.0').describe('item version (from manifest)'),
})
export type MarketplaceItem = z.infer<typeof marketplaceItemSchema>
