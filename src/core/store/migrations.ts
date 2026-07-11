/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Thin re-export barrel. The 3036-line monolith was split into per-range modules
 * under migrations/. This file preserves the import path for all existing callers.
 */
export { runMigrations, configureDb, migrations } from './migrations/index.js'
