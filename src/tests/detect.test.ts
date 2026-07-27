/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/init/detect.ts — fingerprintProject.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fingerprintProject } from '../core/init/detect.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'detect-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('fingerprintProject', () => {
  it('detects a node project and reads the package name', async () => {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'my-pkg' }))

    const fp = fingerprintProject(dir)

    expect(fp.projectType).toBe('node')
    expect(fp.hasPackageJson).toBe(true)
    expect(fp.packageName).toBe('my-pkg')
  })

  it('detects python via pyproject.toml and surfaces IDE markers', async () => {
    await writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname="x"')
    await mkdir(path.join(dir, '.vscode'), { recursive: true })
    await mkdir(path.join(dir, '.cursor'), { recursive: true })

    const fp = fingerprintProject(dir)

    expect(fp.projectType).toBe('python')
    expect(fp.ides).toContain('vscode')
    expect(fp.ides).toContain('cursor')
  })

  it('returns generic with no markers for an empty directory', () => {
    const fp = fingerprintProject(dir)
    expect(fp.projectType).toBe('generic')
    expect(fp.hasPackageJson).toBe(false)
    expect(fp.packageName).toBeUndefined()
    expect(fp.ides).toEqual([])
  })
})
