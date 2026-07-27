/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export { SpecStore } from './spec-store.js'
export type { SpecDocument, SpecVersion, SpecNodeLink, RegisterParams } from './spec-store.js'
export { detectSpecImpact, syncSpecToGraph, specSyncStatus } from './sync-engine.js'
export type { SpecImpact, SyncResult, SpecSyncStatus } from './sync-engine.js'
