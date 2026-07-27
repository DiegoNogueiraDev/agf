/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileExists } from '../utils/fs.js'
import { FileNotFoundError, InvalidArgumentError } from '../utils/errors.js'
import { assertPathInside } from '../utils/safe-path.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'parser/read-file.ts' })

export interface PrdFileResult {
  content: string
  absolutePath: string
  sizeBytes: number
}

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.html', '.pdf', '.prd'])

/** Read a PRD file from disk with path-traversal protection and extension validation. */
export async function readPrdFile(filePath: string): Promise<PrdFileResult> {
  log.debug('read-file:readPrdFile', {})
  // Security: centralized path traversal protection (Bug #004)
  const projectRoot = process.cwd()
  const absolutePath = assertPathInside(filePath, projectRoot)

  // Security: reject unexpected file extensions
  const ext = path.extname(absolutePath).toLowerCase()
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    throw new InvalidArgumentError(`Unsupported file extension: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`)
  }

  if (!(await fileExists(absolutePath))) {
    throw new FileNotFoundError(absolutePath)
  }

  const content = await readFile(absolutePath, 'utf-8')

  return {
    content,
    absolutePath,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
  }
}
