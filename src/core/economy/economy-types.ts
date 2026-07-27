/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

export const EconomyTierSchema = z.union([z.literal(0), z.literal(1), z.literal(2)])
export type EconomyTier = z.infer<typeof EconomyTierSchema>

export const CacheKeySchema = z.object({
  toolName: z.string().min(1),
  argsHash: z.string().min(1),
  schemaVersion: z.number().int().nonnegative(),
  model: z.string().optional(),
})
export type CacheKey = z.infer<typeof CacheKeySchema>

export const CacheEntrySchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  hitCount: z.number().int().nonnegative().default(0),
})
export type CacheEntry = z.infer<typeof CacheEntrySchema>

export const TierDistributionSchema = z.object({
  tier0: z.number().nonnegative(),
  tier1: z.number().nonnegative(),
  tier2: z.number().nonnegative(),
})
export type TierDistribution = z.infer<typeof TierDistributionSchema>

export const EconomyStatsSchema = z.object({
  tokensSavedTotal: z.number().nonnegative(),
  costSavedUsd: z.number().nonnegative(),
  cacheHitRate: z.number().min(0).max(1),
  boosterHitRate: z.number().min(0).max(1),
  tierDistribution: TierDistributionSchema,
  avgLatencyPerTierMs: z.object({
    tier0: z.number().nonnegative(),
    tier1: z.number().nonnegative(),
    tier2: z.number().nonnegative(),
  }),
})
export type EconomyStats = z.infer<typeof EconomyStatsSchema>

export const ComplexityClassSchema = z.enum(['trivial', 'simple', 'complex', 'critical'])
export type ComplexityClass = z.infer<typeof ComplexityClassSchema>
