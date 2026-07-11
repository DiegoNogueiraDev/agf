/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

/**
 * Compat: a detecção agora vive no {@link ./registry.js registry declarativo}.
 * Este módulo re-exporta `autoDetectFilter`/`FilterFn` para os imports existentes.
 */
export { autoDetectFilter, type FilterFn } from './registry.js'
