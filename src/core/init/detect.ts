/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type ProjectType = 'node' | 'python' | 'go' | 'rust' | 'java' | 'ruby' | 'generic'

export type IdeKind = 'vscode' | 'cursor' | 'jetbrains' | 'zed' | 'claude-code' | 'unknown'

export interface ProjectFingerprint {
  readonly cwd: string
  readonly projectType: ProjectType
  readonly ides: readonly IdeKind[]
  readonly hasGit: boolean
  readonly hasGitignore: boolean
  readonly hasWorkflowGraph: boolean
  readonly hasPackageJson: boolean
  readonly packageName?: string
}

const PROJECT_TYPE_MARKERS: ReadonlyArray<readonly [string, ProjectType]> = [
  ['package.json', 'node'],
  ['pyproject.toml', 'python'],
  ['requirements.txt', 'python'],
  ['setup.py', 'python'],
  ['go.mod', 'go'],
  ['Cargo.toml', 'rust'],
  ['pom.xml', 'java'],
  ['build.gradle', 'java'],
  ['build.gradle.kts', 'java'],
  ['Gemfile', 'ruby'],
]

const IDE_MARKERS: ReadonlyArray<readonly [string, IdeKind]> = [
  ['.vscode', 'vscode'],
  ['.cursor', 'cursor'],
  ['.idea', 'jetbrains'],
  ['.zed', 'zed'],
  ['.claude', 'claude-code'],
]

export function fingerprintProject(cwd: string): ProjectFingerprint {
  const projectType = detectProjectType(cwd)
  const ides = detectIdes(cwd)
  const hasGit = existsSync(join(cwd, '.git'))
  const hasGitignore = existsSync(join(cwd, '.gitignore'))
  const hasWorkflowGraph = existsSync(join(cwd, 'workflow-graph'))
  const hasPackageJson = existsSync(join(cwd, 'package.json'))

  let packageName: string | undefined
  if (hasPackageJson) {
    packageName = readPackageName(cwd)
  }

  return {
    cwd,
    projectType,
    ides,
    hasGit,
    hasGitignore,
    hasWorkflowGraph,
    hasPackageJson,
    packageName,
  }
}

function detectProjectType(cwd: string): ProjectType {
  for (const [marker, type] of PROJECT_TYPE_MARKERS) {
    if (existsSync(join(cwd, marker))) return type
  }
  return 'generic'
}

function detectIdes(cwd: string): readonly IdeKind[] {
  const found: IdeKind[] = []
  for (const [marker, kind] of IDE_MARKERS) {
    if (existsSync(join(cwd, marker))) found.push(kind)
  }
  return found
}

function readPackageName(cwd: string): string | undefined {
  try {
    const raw = readFileSync(join(cwd, 'package.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'name' in parsed &&
      typeof (parsed as { name?: unknown }).name === 'string'
    ) {
      return (parsed as { name: string }).name
    }
  } catch (err) {
    void err // unreadable / invalid JSON → leave undefined
  }
  return undefined
}
