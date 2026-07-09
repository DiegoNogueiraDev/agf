/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Stack Detector — auto-detects project stack by reading
 * package.json, requirements.txt, go.mod, etc.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'stack-detector.ts' })

export interface DetectedStack {
  /** Detected language/runtime */
  runtime: string
  /** Detected libraries with their versions */
  libraries: Array<{ name: string; version: string }>
  /** Source file that was parsed */
  sourceFile: string
}

/**
 * Detect project stack from manifest files.
 * Checks package.json, requirements.txt, go.mod in order.
 */
export async function detectStack(basePath: string): Promise<DetectedStack | null> {
  // Try package.json first (Node.js)
  const packageJsonResult = await tryPackageJson(basePath)
  if (packageJsonResult) return packageJsonResult

  // Try requirements.txt (Python)
  const requirementsResult = await tryRequirementsTxt(basePath)
  if (requirementsResult) return requirementsResult

  // Try go.mod (Go)
  const goModResult = await tryGoMod(basePath)
  if (goModResult) return goModResult

  log.info('No stack manifest detected', { basePath })
  return null
}

async function tryPackageJson(basePath: string): Promise<DetectedStack | null> {
  try {
    const filePath = path.join(basePath, 'package.json')
    const content = await readFile(filePath, 'utf-8')
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    const deps = pkg.dependencies ?? {}
    const devDeps = pkg.devDependencies ?? {}
    const allDeps = { ...deps, ...devDeps }

    const libraries = Object.entries(allDeps).map(([name, version]) => ({
      name,
      version: String(version).replace(/^\^|~/, ''),
    }))

    log.info('Stack detected: Node.js', { libraries: libraries.length })

    return {
      runtime: 'node',
      libraries,
      sourceFile: 'package.json',
    }
  } catch (err) {
    log.debug('stackDetector:packageJsonReadFailure', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

async function tryRequirementsTxt(basePath: string): Promise<DetectedStack | null> {
  try {
    const filePath = path.join(basePath, 'requirements.txt')
    const content = await readFile(filePath, 'utf-8')

    const libraries = content
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => {
        const match = line.match(/^([a-zA-Z0-9_-]+)\s*(?:==|>=|<=|~=|!=)?\s*(.*)$/)
        return match ? { name: match[1], version: match[2] || '*' } : { name: line.trim(), version: '*' }
      })

    log.info('Stack detected: Python', { libraries: libraries.length })

    return {
      runtime: 'python',
      libraries,
      sourceFile: 'requirements.txt',
    }
  } catch (err) {
    log.debug('stackDetector:requirementsTxtReadFailure', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

async function tryGoMod(basePath: string): Promise<DetectedStack | null> {
  try {
    const filePath = path.join(basePath, 'go.mod')
    const content = await readFile(filePath, 'utf-8')

    const libraries: Array<{ name: string; version: string }> = []
    const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/)

    if (requireBlock) {
      const lines = requireBlock[1].split('\n')
      for (const line of lines) {
        const match = line.trim().match(/^(\S+)\s+(\S+)/)
        if (match) {
          libraries.push({ name: match[1], version: match[2] })
        }
      }
    }

    log.info('Stack detected: Go', { libraries: libraries.length })

    return {
      runtime: 'go',
      libraries,
      sourceFile: 'go.mod',
    }
  } catch (err) {
    log.debug('stackDetector:goModReadFailure', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
