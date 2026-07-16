/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Nine scaffolds pointed at `templates/*.md` files that were never written, so `agf montar-output`
 * recovered four of thirteen goals and refused the rest by name. This is the text that was missing.
 *
 * They are modules, not files on disk, for the same reason the other four are: `package.json`
 * ships `dist/`, and `existsSync('templates/react-component.md')` resolves against the *caller's*
 * working directory. An `agf` installed globally would have looked for the skeleton inside whatever
 * project the user happened to be standing in. A project may still ship its own file under that
 * path and it wins — that is an override, not the default.
 *
 * The invariant worth guarding: a template must contain a marker for every slot its scaffold
 * declares. A slot with no hole is an instruction to fill something that is not there, and the
 * agent discovers it only after writing the file.
 */

import { describe, it, expect } from 'vitest'
import { BUILTIN_TEMPLATES } from '../core/rag-out/templates/index.js'
import { loadDefaultScaffoldCorpus } from '../core/rag-out/scaffold-corpus.js'
import { resolveScaffoldBody, structureTokens } from '../core/rag-out/scaffold-body.js'

const corpus = loadDefaultScaffoldCorpus()
const fileBacked = corpus.filter((s) => s.structureRef?.startsWith('templates/'))

describe('builtin templates — the nine that were promised and never written', () => {
  it('covers every scaffold that names a template file', () => {
    const missing = fileBacked.map((s) => s.structureRef!).filter((ref) => !(ref in BUILTIN_TEMPLATES))
    expect(missing).toEqual([])
  })

  it.each(fileBacked.map((s) => [s.id, s] as const))('%s declares no slot it does not offer', (_id, scaffold) => {
    const body = BUILTIN_TEMPLATES[scaffold.structureRef!] ?? ''
    const withoutHole = scaffold.slots.filter((slot) => !body.includes(`{{${slot}}}`))
    expect(withoutHole, 'a slot with no marker is a hole the agent cannot find').toEqual([])
  })

  it('gives every scaffold in the corpus a body it can hand over', () => {
    const bodiless = corpus.filter((s) => structureTokens(s.structureRef) === null).map((s) => s.id)
    expect(bodiless).toEqual([])
  })

  // The saving is the structure. A template of three lines saves nothing worth reporting, and a
  // template of three thousand is a file, not a skeleton.
  it.each(fileBacked.map((s) => [s.id, s.structureRef!] as const))('%s is a skeleton, not a stub', (_id, ref) => {
    const tokens = structureTokens(ref) ?? 0
    expect(tokens).toBeGreaterThan(40)
    expect(tokens).toBeLessThan(1200)
  })

  it('resolves through the registry without touching the filesystem', () => {
    expect(resolveScaffoldBody('templates/react-component.md')).toContain('{{componentName}}')
  })

  it('still returns null for a reference nobody defined', () => {
    expect(resolveScaffoldBody('templates/does-not-exist.md')).toBeNull()
  })
})
