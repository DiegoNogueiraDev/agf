import { describe, it, expect } from 'vitest'
import { resolveBlastTestFiles } from '../core/code/blast-test-resolver.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { CodeStore } from '../core/code/code-store.js'
import type { CodeSymbol, CodeRelation } from '../core/code/code-types.js'

function makeStore() {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-blast-resolver')
  return store
}

function sym(file: string, name: string): Omit<CodeSymbol, 'id' | 'indexedAt'> {
  return { name, kind: 'function', file, startLine: 1, endLine: 5, exported: true, projectId: '' }
}

function insertSymbols(
  codeStore: CodeStore,
  projectId: string,
  items: Omit<CodeSymbol, 'id' | 'indexedAt'>[],
): CodeSymbol[] {
  return items.map((s) => codeStore.insertSymbol({ ...s, projectId }))
}

function insertRelations(codeStore: CodeStore, projectId: string, fromSym: CodeSymbol, toSym: CodeSymbol): void {
  codeStore.insertRelation({ fromSymbol: fromSym.id, toSymbol: toSym.id, type: 'imports', projectId })
}

describe('resolveBlastTestFiles — AC: only affected tests run', () => {
  it('returns test files transitively affected by changed source files', () => {
    const store = makeStore()
    const codeStore = new CodeStore(store.getDb())
    const projectId = store.getProject()!.id

    const [coreFn, testFn] = insertSymbols(codeStore, projectId, [
      sym('src/core/foo.ts', 'coreFn'),
      sym('src/tests/foo.test.ts', 'testFn'),
    ])
    insertRelations(codeStore, projectId, testFn!, coreFn!)

    const testFiles = resolveBlastTestFiles(codeStore, projectId, ['src/core/foo.ts'])
    expect(testFiles.has('src/tests/foo.test.ts')).toBe(true)
    expect(testFiles.size).toBe(1)

    store.close()
  })

  it('returns empty set when changed files have no dependents', () => {
    const store = makeStore()
    const codeStore = new CodeStore(store.getDb())
    const projectId = store.getProject()!.id

    insertSymbols(codeStore, projectId, [sym('src/core/isolated.ts', 'isolated')])

    const testFiles = resolveBlastTestFiles(codeStore, projectId, ['src/core/isolated.ts'])
    expect(testFiles.size).toBe(0)

    store.close()
  })

  it('returns empty set when code index is not populated', () => {
    const store = makeStore()
    const codeStore = new CodeStore(store.getDb())
    const projectId = store.getProject()!.id

    // No symbols or relations indexed
    const testFiles = resolveBlastTestFiles(codeStore, projectId, ['src/core/foo.ts'])
    expect(testFiles.size).toBe(0)

    store.close()
  })

  it('returns empty set when no changed files given', () => {
    const store = makeStore()
    const codeStore = new CodeStore(store.getDb())
    const projectId = store.getProject()!.id

    const testFiles = resolveBlastTestFiles(codeStore, projectId, [])
    expect(testFiles.size).toBe(0)

    store.close()
  })
})
