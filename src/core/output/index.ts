/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Structured output subsystem — barrel export.
 */

export type { OutMeta, OutputEnvelope } from './envelope.js'
export { ok, err } from './envelope.js'
export { writeEnvelope, setPretty, setSelect, setAi } from './writer.js'
export { projectEnvelope } from './select.js'
export type { NdjsonLevel, NdjsonEntry } from './ndjson-logger.js'
export { writeNdjsonLog } from './ndjson-logger.js'
export { generateContractSection, ERROR_CODES, COMMANDS } from './consumer-contract.js'
