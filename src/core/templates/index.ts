/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'templates/index.ts' })

export { instantiateTemplate, listTemplates } from './template-engine.js'
export type { TaskTemplate, TemplateInstantiationResult } from './template-engine.js'
