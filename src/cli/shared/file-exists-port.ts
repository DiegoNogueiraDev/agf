/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * makeFileExists — shared filesystem-probe factory for the anti-hallucination
 * triangulation. Resolves a (project-relative or absolute) path against the
 * target project's directory and reports whether it exists on disk.
 *
 * WHY shared: both the audit surface (`agf gaps` → detectPhantomDone) and the
 * enforcement surface (`agf done` gate) must apply the IDENTICAL existence rule,
 * resolved against the project being operated on (`--dir`) — NOT the agf repo.
 * That is what makes the triangulation work for ANY project agf drives.
 */

import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { FileExistsPort } from '../../core/gaps/detect-phantom-done.js'

/** Build a {@link FileExistsPort} that resolves relative paths against `dir`. */
export function makeFileExists(dir: string): FileExistsPort {
  return (rel: string): boolean => existsSync(isAbsolute(rel) ? rel : join(dir, rel))
}
