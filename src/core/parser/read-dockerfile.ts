/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §Task 3.5 subtask -- Dockerfile parser: extracts FROM, EXPOSE, ENV, COPY, RUN.
 * Deterministic — pure regex over raw text, zero LLM calls.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-dockerfile.ts' })

export interface DockerfileEntry {
  type: string
  value: string
}

export interface ParsedDockerfile {
  entries: DockerfileEntry[]
  raw: string
}

const DOCKERFILE_INSTRUCTIONS = new Set([
  'FROM',
  'EXPOSE',
  'ENV',
  'COPY',
  'RUN',
  'ADD',
  'ARG',
  'CMD',
  'ENTRYPOINT',
  'HEALTHCHECK',
  'LABEL',
  'MAINTAINER',
  'ONBUILD',
  'SHELL',
  'STOPSIGNAL',
  'USER',
  'VOLUME',
  'WORKDIR',
])

/** Parse a Dockerfile string and extract instruction entries (best-effort). */
export function parseDockerfile(content: string): ParsedDockerfile {
  if (!content.trim()) return { entries: [], raw: content }

  const entries: DockerfileEntry[] = []

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const spaceIdx = line.indexOf(' ')
    if (spaceIdx === -1) continue

    const instruction = line.slice(0, spaceIdx).toUpperCase()
    const value = line.slice(spaceIdx + 1).trim()

    if (DOCKERFILE_INSTRUCTIONS.has(instruction)) {
      entries.push({ type: instruction, value })
    }
  }

  log.debug('read-dockerfile:parsed', { entriesCount: entries.length })
  return { entries, raw: content }
}
