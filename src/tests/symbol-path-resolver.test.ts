import { describe, it, expect } from 'vitest'
import {
  findSymbolByPath,
  replaceSymbolBody,
  insertAfterSymbol,
  insertBeforeSymbol,
  safeDeleteSymbol,
} from '../core/lsp/symbol-path-resolver.js'
import type { LspDocumentSymbol } from '../core/lsp/lsp-types.js'

const MOCK_SYMBOLS: LspDocumentSymbol[] = [
  {
    name: 'MyClass',
    kind: 'class',
    file: 'src/app.ts',
    startLine: 1,
    endLine: 13,
    children: [
      { name: 'myMethod', kind: 'method', file: 'src/app.ts', startLine: 6, endLine: 8, children: [] },
      { name: 'anotherMethod', kind: 'method', file: 'src/app.ts', startLine: 10, endLine: 12, children: [] },
    ],
  },
  { name: 'helperFunction', kind: 'function', file: 'src/app.ts', startLine: 15, endLine: 17, children: [] },
]

const FILE_CONTENT = [
  '// top',
  'class MyClass {',
  '  private x = 1',
  '',
  '  constructor() {}',
  '',
  '  myMethod() {',
  '    return this.x',
  '  }',
  '',
  '  anotherMethod() {',
  '    return 2',
  '  }',
  '}',
  '',
  'function helperFunction() {',
  '  return "help"',
  '}',
].join('\n')

describe('SymbolPathResolver', () => {
  it('findSymbol: class por name path simples', () => {
    const found = findSymbolByPath(MOCK_SYMBOLS, 'MyClass', 'src/app.ts')
    expect(found).toBeDefined()
    expect(found!.name).toBe('MyClass')
    expect(found!.kind).toBe('class')
  })

  it('findSymbol: metodo por name path ClassName/method', () => {
    const found = findSymbolByPath(MOCK_SYMBOLS, 'MyClass/myMethod', 'src/app.ts')
    expect(found).toBeDefined()
    expect(found!.name).toBe('myMethod')
    expect(found!.kind).toBe('method')
  })

  it('findSymbol: funcao global por nome', () => {
    const found = findSymbolByPath(MOCK_SYMBOLS, 'helperFunction', 'src/app.ts')
    expect(found).toBeDefined()
    expect(found!.name).toBe('helperFunction')
  })

  it('findSymbol: retorna undefined para simbolo inexistente', () => {
    const found = findSymbolByPath(MOCK_SYMBOLS, 'NonExistent', 'src/app.ts')
    expect(found).toBeUndefined()
  })

  it('replaceSymbolBody: substitui corpo mantendo assinatura', () => {
    const found = findSymbolByPath(MOCK_SYMBOLS, 'myMethod', 'src/app.ts')!
    const result = replaceSymbolBody(FILE_CONTENT, found, '  return 42')
    expect(result).toContain('myMethod() {')
    expect(result).toContain('return 42')
    expect(result).not.toContain('return this.x')
  })

  it('insertAfterSymbol: insere codigo apos simbolo', () => {
    const found = findSymbolByPath(MOCK_SYMBOLS, 'helperFunction', 'src/app.ts')!
    const result = insertAfterSymbol(FILE_CONTENT, found, 'function newFunc() {}')
    expect(result).toContain('function newFunc() {}')
  })

  it('insertBeforeSymbol: insere codigo antes do simbolo', () => {
    const found = findSymbolByPath(MOCK_SYMBOLS, 'helperFunction', 'src/app.ts')!
    const result = insertBeforeSymbol(FILE_CONTENT, found, '// before helper')
    expect(result).toContain('// before helper')
    expect(result).toContain('function helperFunction()')
  })

  it('safeDeleteSymbol: deleta funcao global', () => {
    const found = findSymbolByPath(MOCK_SYMBOLS, 'helperFunction', 'src/app.ts')!
    const result = safeDeleteSymbol(FILE_CONTENT, found)
    expect(result).not.toContain('helperFunction')
    expect(result).toContain('class MyClass')
  })
})
