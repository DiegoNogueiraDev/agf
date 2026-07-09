import { describe, it, expect } from 'vitest'
import {
  knapsack01,
  longestCommonSubsequence,
  rodCutting,
  optimalBst,
  editDistance,
  activitySelection,
  huffmanCodes,
  rabinKarp,
  longestPalindrome,
  huffmanCoding,
} from '../../core/algorithms/dynamic-programming.js'

describe('knapsack01', () => {
  it('seleciona itens otimos para mochila simples', () => {
    const items = [
      { value: 60, weight: 10 },
      { value: 100, weight: 20 },
      { value: 120, weight: 30 },
    ]
    const result = knapsack01(items, 50)
    expect(result.totalValue).toBe(220)
    expect(result.selected).toEqual([1, 2])
    expect(result.totalWeight).toBe(50)
  })

  it('retorna vazio quando nenhum item cabe', () => {
    const items = [{ value: 10, weight: 10 }]
    const result = knapsack01(items, 5)
    expect(result.totalValue).toBe(0)
    expect(result.selected).toEqual([])
    expect(result.totalWeight).toBe(0)
  })

  it('truta array vazio', () => {
    const result = knapsack01([], 10)
    expect(result.totalValue).toBe(0)
    expect(result.selected).toEqual([])
    expect(result.totalWeight).toBe(0)
  })

  it('seleciona item unico que cabe', () => {
    const items = [{ value: 42, weight: 7 }]
    const result = knapsack01(items, 10)
    expect(result.totalValue).toBe(42)
    expect(result.selected).toEqual([0])
    expect(result.totalWeight).toBe(7)
  })
})

describe('longestCommonSubsequence', () => {
  it('encontra LCS entre duas strings', () => {
    const result = longestCommonSubsequence('ABCBDAB', 'BDCAB')
    expect(result.sequence).toBe('BDAB')
    expect(result.length).toBe(4)
  })

  it('retorna vazio quando nao ha subsequencia comum', () => {
    const result = longestCommonSubsequence('ABC', 'XYZ')
    expect(result.sequence).toBe('')
    expect(result.length).toBe(0)
  })

  it('retorna string inteira quando sao iguais', () => {
    const result = longestCommonSubsequence('ABCD', 'ABCD')
    expect(result.sequence).toBe('ABCD')
    expect(result.length).toBe(4)
  })

  it('truta string vazia', () => {
    const result = longestCommonSubsequence('', 'ABC')
    expect(result.sequence).toBe('')
    expect(result.length).toBe(0)
  })
})

describe('rodCutting', () => {
  it('encontra revenue maxima para precos dados', () => {
    const prices = [1, 5, 8, 9, 10, 17, 17, 20]
    const result = rodCutting(prices, 8)
    expect(result.maxRevenue).toBe(22)
  })

  it('retorna precos para length 1', () => {
    const result = rodCutting([3], 1)
    expect(result.maxRevenue).toBe(3)
    expect(result.cuts).toEqual([1])
  })

  it('truta length 0', () => {
    const result = rodCutting([1], 0)
    expect(result.maxRevenue).toBe(0)
    expect(result.cuts).toEqual([])
  })
})

describe('optimalBst', () => {
  it('calcula custo para BST com 3 keys', () => {
    const keys = ['A', 'B', 'C']
    const probs = [0.4, 0.3, 0.3]
    const result = optimalBst(keys, probs)
    expect(result.cost).toBeGreaterThan(0)
    expect(result.root).toBeGreaterThanOrEqual(0)
  })

  it('truta single key', () => {
    const result = optimalBst(['X'], [1.0])
    expect(result.cost).toBeCloseTo(1.0, 2)
    expect(result.root).toBe(0)
  })

  it('truta array vazio', () => {
    const result = optimalBst([], [])
    expect(result.cost).toBe(0)
    expect(result.root).toBe(-1)
  })
})

describe('editDistance', () => {
  it('calcula distancia Levenshtein entre duas strings', () => {
    const result = editDistance('kitten', 'sitting')
    expect(result.distance).toBe(3)
    expect(result.operations.length).toBeGreaterThan(0)
  })

  it('distancia 0 para strings identicas', () => {
    const result = editDistance('abc', 'abc')
    expect(result.distance).toBe(0)
    expect(result.operations).toEqual([])
  })

  it('distancia para string vazia', () => {
    const result = editDistance('abc', '')
    expect(result.distance).toBe(3)
  })

  it('retorna operacoes em ordem', () => {
    const result = editDistance('a', 'b')
    expect(result.distance).toBe(1)
    expect(result.operations.length).toBeGreaterThanOrEqual(1)
  })
})

describe('activitySelection', () => {
  it('seleciona maximo de atividades nao sobrepostas', () => {
    const intervals = [
      { start: 1, end: 4 },
      { start: 3, end: 5 },
      { start: 0, end: 6 },
      { start: 5, end: 7 },
      { start: 3, end: 9 },
      { start: 5, end: 9 },
      { start: 6, end: 10 },
      { start: 8, end: 11 },
      { start: 8, end: 12 },
      { start: 2, end: 14 },
      { start: 12, end: 16 },
    ]
    const result = activitySelection(intervals)
    expect(result.count).toBe(4)
    expect(result.selected.length).toBe(4)
  })

  it('retorna vazio para array vazio', () => {
    const result = activitySelection([])
    expect(result.count).toBe(0)
    expect(result.selected).toEqual([])
  })

  it('seleciona todas quando nenhuma sobrepoe', () => {
    const intervals = [
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]
    const result = activitySelection(intervals)
    expect(result.count).toBe(3)
  })
})

describe('huffmanCodes', () => {
  it('gera codigos com comprimento inversamente proporcional a frequencia', () => {
    const freqs = new Map<string, number>([
      ['a', 5],
      ['b', 9],
      ['c', 12],
      ['d', 13],
      ['e', 16],
      ['f', 45],
    ])
    const codes = huffmanCodes(freqs)
    expect(codes.size).toBe(6)
    expect(codes.get('f')!.length).toBeLessThanOrEqual(codes.get('a')!.length)
  })

  it('truta single character', () => {
    const freqs = new Map([['x', 10]])
    const codes = huffmanCodes(freqs)
    expect(codes.get('x')).toBe('0')
  })

  it('truta map vazio', () => {
    const codes = huffmanCodes(new Map())
    expect(codes.size).toBe(0)
  })
})

describe('rabinKarp', () => {
  it('encontra match em posicao unica', () => {
    const result = rabinKarp('ABCABCD', 'ABC')
    expect(result).toEqual([0, 3])
  })

  it('retorna vazio para pattern nao encontrado', () => {
    const result = rabinKarp('ABCDEF', 'XYZ')
    expect(result).toEqual([])
  })

  it('truta pattern maior que text', () => {
    const result = rabinKarp('AB', 'ABC')
    expect(result).toEqual([])
  })

  it('truta pattern vazio', () => {
    const result = rabinKarp('ABC', '')
    expect(result).toEqual([])
  })

  it('usa prime alternativo', () => {
    const result = rabinKarp('ABCABC', 'ABC', 13)
    expect(result).toEqual([0, 3])
  })
})

describe('longestPalindrome', () => {
  it('encontra substring palindromica mais longa', () => {
    const result = longestPalindrome('babad')
    expect(['bab', 'aba']).toContain(result)
  })

  it('retorna string inteira quando ja eh palindromo', () => {
    expect(longestPalindrome('racecar')).toBe('racecar')
  })

  it('truta single char', () => {
    expect(longestPalindrome('a')).toBe('a')
  })

  it('truta string vazia', () => {
    expect(longestPalindrome('')).toBe('')
  })

  it('encontra palindrome par mais longo', () => {
    const result = longestPalindrome('cbbd')
    expect(result).toBe('bb')
  })
})

describe('huffmanCoding', () => {
  it('gera codigos como huffmanCodes', () => {
    const freqs = new Map<string, number>([
      ['a', 5],
      ['b', 9],
      ['c', 12],
      ['d', 13],
      ['e', 16],
      ['f', 45],
    ])
    const codes = huffmanCoding(freqs)
    expect(codes.size).toBe(6)
    expect(codes.get('f')!.length).toBeLessThanOrEqual(codes.get('a')!.length)
  })

  it('truta single character', () => {
    const freqs = new Map([['x', 10]])
    const codes = huffmanCoding(freqs)
    expect(codes.get('x')).toBe('0')
  })

  it('truta map vazio', () => {
    const codes = huffmanCoding(new Map())
    expect(codes.size).toBe(0)
  })
})
