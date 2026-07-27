/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-atomic-files-writer — Task 2.1: Central registry of managed atomic files.
 *
 * Features call registerAtomicFile() at module-load time.
 * init/update iterate getRegistry() to process all registered files.
 * Duplicate fileId throws with code "duplicate_file_id".
 */

import type { AtomicFile } from './types.js'

const _registry: AtomicFile[] = []

export function registerAtomicFile(file: AtomicFile): void {
  if (_registry.some((f) => f.fileId === file.fileId)) {
    throw Object.assign(new Error(`duplicate_file_id: "${file.fileId}" is already registered`), {
      code: 'duplicate_file_id',
      fileId: file.fileId,
    })
  }
  _registry.push(file)
}

export function getRegistry(): AtomicFile[] {
  return [..._registry]
}

export function clearRegistry(): void {
  _registry.length = 0
}
