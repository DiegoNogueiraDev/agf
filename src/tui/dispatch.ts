/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * dispatch.ts — barrel re-exporting command catalog, parsing utilities, and
 * port interfaces. Split into:
 *   dispatch-catalog.ts  — SlashCommand type + COMMANDS array
 *   dispatch-parsing.ts  — parseCommand, resolveAlias, fuzzy helpers
 *   dispatch-ports.ts    — CommandPort, AsyncCommandPort, runReadCommand, runAsyncCommand
 */

export * from './dispatch-catalog.js'
export * from './dispatch-parsing.js'
export * from './dispatch-ports.js'
