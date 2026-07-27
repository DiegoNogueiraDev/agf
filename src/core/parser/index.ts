/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'parser/index.ts' })

export { isMetadataLine, classifyText, classifySectionTitle, classifySection, classifyTableRows } from './classify.js'
export type { BlockType, ClassifiedBlock, ClassifiedItem } from './classify.js'
export { extractEntities } from './extract.js'
export type { ExtractionResult } from './extract.js'
export { readFileContent, isSupportedFormat } from './file-reader.js'
export type { FileReadResult } from './file-reader.js'
export { normalize } from './normalize.js'
export { diffPrd } from './prd-diff.js'
export type { PrdDiffSection, PrdDiffResult } from './prd-diff.js'
export { isDocxSupported, readDocxContent } from './read-docx.js'
export { readPrdFile } from './read-file.js'
export type { PrdFileResult } from './read-file.js'
export { readHtmlContent } from './read-html.js'
export { readPdfBuffer } from './read-pdf.js'
export { segment, extractTableSections } from './segment.js'
export type { Section } from './segment.js'
