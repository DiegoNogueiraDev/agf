import { describe, it, expect } from 'vitest'
import { attemptImplementation, type AttemptDeps } from '../core/autonomy/implement-attempt.js'
import type { ImplementationPlan, ExecutionResult } from '../core/autonomy/implementation-executor.js'

const node = { id: 'node_1', title: 'Soma de dois números' }

/** Fake execute: vermelho se algum content/newString contém "BUG", senão verde. Lida com files e/ou edits. */
function fakeExecute(plan: ImplementationPlan): Promise<ExecutionResult> {
  const files = plan.files ?? []
  const edits = plan.edits ?? []
  const red = files.some((f) => f.content.includes('BUG')) || edits.some((e) => e.newString.includes('BUG'))
  const applied = [...files.map((f) => f.path), ...edits.map((e) => e.path)]
  return Promise.resolve(
    red
      ? { applied, testPassed: false, testOutput: 'AssertionError: 2-3 !== 5', testExitCode: 1 }
      : { applied, testPassed: true, testOutput: '1 passed', testExitCode: 0 },
  )
}

function planJson(content: string): string {
  return JSON.stringify({ files: [{ path: 'sum.js', content }], testCommand: 'node sum.test.js' })
}

describe('attemptImplementation — retry com feedback compacto do teste', () => {
  it('sucesso na 1ª tentativa', async () => {
    const deps: AttemptDeps = {
      generate: async () => planJson('a + b'),
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    expect(outcome.attempts).toBe(1)
  })

  it('vermelho → realimenta a falha → corrige na 2ª; o prompt de retry contém a saída do teste', async () => {
    const prompts: string[] = []
    const responses = [planJson('a - b // BUG'), planJson('a + b')]
    let i = 0
    const deps: AttemptDeps = {
      generate: async (prompt) => {
        prompts.push(prompt)
        return responses[i++]
      },
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    expect(outcome.attempts).toBe(2)
    // o 2º prompt (retry) deve carregar a saída de teste que falhou (feedback compacto)
    expect(prompts[1]).toContain('AssertionError')
    // economia: o 1º prompt NÃO contém saída de teste (não há ainda)
    expect(prompts[0]).not.toContain('AssertionError')
  })

  it('Frente C: o esforço de raciocínio escala a cada vermelho (UnCert-CoT)', async () => {
    const efforts: (string | undefined)[] = []
    const responses = [planJson('a - b // BUG'), planJson('a - b // BUG'), planJson('a + b')]
    let i = 0
    const deps: AttemptDeps = {
      generate: async (_prompt, effort) => {
        efforts.push(effort)
        return responses[i++]
      },
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    expect(outcome.attempts).toBe(3)
    // 1ª enxuta; escala com a incerteza comprovada pelos vermelhos.
    expect(efforts).toEqual(['low', 'medium', 'high'])
  })

  it('esgota o budget → success false com attempts = maxAttempts', async () => {
    const deps: AttemptDeps = {
      generate: async () => planJson('a - b // BUG'),
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 2 })
    expect(outcome.success).toBe(false)
    expect(outcome.attempts).toBe(2)
  })

  it('resposta não-parseável → recuperação corretiva dentro da mesma tentativa', async () => {
    const responses = ['desculpe, não consegui', planJson('a + b')]
    let i = 0
    const deps: AttemptDeps = {
      generate: async () => responses[i++],
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    // recupera o JSON malformado sem queimar a tentativa (antes: attempts=2)
    expect(outcome.attempts).toBe(1)
  })

  it('trunca a saída de teste no feedback (economia de token)', async () => {
    const huge = 'X'.repeat(5000)
    const prompts: string[] = []
    const responses = [
      JSON.stringify({ files: [{ path: 'a.js', content: 'BUG' }], testCommand: 't' }),
      planJson('a + b'),
    ]
    let i = 0
    const deps: AttemptDeps = {
      generate: async (p) => {
        prompts.push(p)
        return responses[i++]
      },
      execute: async () => ({
        applied: ['a.js'],
        testPassed: i === 1 ? false : true,
        testOutput: huge,
        testExitCode: 1,
      }),
    }
    await attemptImplementation(deps, { node, maxAttempts: 2, maxFeedbackChars: 500 })
    expect(prompts[1].length).toBeLessThan(2000) // saída truncada, não os 5000 chars
  })

  it('conserta o teste vermelho com um plano de EDITS na 2ª tentativa', async () => {
    const buggyFiles = JSON.stringify({ files: [{ path: 'sum.js', content: 'a - b // BUG' }], testCommand: 't' })
    const fixEdit = JSON.stringify({
      edits: [{ path: 'sum.js', oldString: 'a - b // BUG', newString: 'a + b' }],
      testCommand: 't',
    })
    const responses = [buggyFiles, fixEdit]
    let i = 0
    const deps: AttemptDeps = {
      generate: async () => responses[i++],
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    expect(outcome.attempts).toBe(2)
  })
})

describe('attemptImplementation — classificação de erro do provider (token-frugal)', () => {
  it('erro permanente (auth 401) → escala imediatamente, sem re-tentar', async () => {
    let calls = 0
    const deps: AttemptDeps = {
      generate: async () => {
        calls++
        throw { status: 401, message: 'unauthorized' }
      },
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(false)
    expect(outcome.attempts).toBe(1) // não desperdiçou as 3 tentativas
    expect(calls).toBe(1) // chamou o provider só uma vez
  })

  it('rate-limit (429 + retry-after) → aguarda retryAfterMs e re-tenta', async () => {
    const slept: number[] = []
    let i = 0
    const deps: AttemptDeps = {
      generate: async () => {
        if (i++ === 0) throw { status: 429, headers: { 'retry-after': '2' } }
        return planJson('a + b')
      },
      execute: fakeExecute,
      sleep: async (ms: number) => {
        slept.push(ms)
      },
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    expect(slept).toContain(2000) // respeitou o retry-after (2s → 2000ms)
  })

  it('erro transitório (503) → re-tenta e fica verde na 2ª', async () => {
    let i = 0
    const deps: AttemptDeps = {
      generate: async () => {
        if (i++ === 0) throw { status: 503, message: 'upstream' }
        return planJson('a + b')
      },
      execute: fakeExecute,
      sleep: async () => {},
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    expect(outcome.attempts).toBe(2)
  })
})

describe('attemptImplementation — reuso determinístico (#R4)', () => {
  const reuseEdits = [{ path: 'sum.js', oldString: 'a - b', newString: 'a + b' }]

  it('exact-hit no cache → NÃO chama o modelo e aplica os edits cacheados', async () => {
    let generateCalls = 0
    const deps: AttemptDeps = {
      generate: async () => {
        generateCalls++
        return planJson('a + b')
      },
      execute: fakeExecute, // edits sem BUG → verde
    }
    const outcome = await attemptImplementation(deps, {
      node,
      maxAttempts: 3,
      reuse: { kind: 'exact', edits: reuseEdits, sourceId: 'art_1' },
    })
    expect(outcome.success).toBe(true)
    expect(generateCalls).toBe(0) // 0 tokens — reusou
    expect(outcome.reused).toBe('exact')
    expect(outcome.appliedEdits).toEqual(reuseEdits)
  })

  it('exact-hit vermelho → cai para geração normal (não trava)', async () => {
    let generateCalls = 0
    const deps: AttemptDeps = {
      generate: async () => {
        generateCalls++
        return planJson('a + b') // gera fix verde
      },
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, {
      node,
      maxAttempts: 3,
      // edits com BUG → fakeExecute vermelho no reuso
      reuse: {
        kind: 'exact',
        edits: [{ path: 'sum.js', oldString: 'x', newString: 'a - b // BUG' }],
        sourceId: 'art_x',
      },
    })
    expect(outcome.success).toBe(true)
    expect(generateCalls).toBeGreaterThan(0) // caiu para o modelo
  })

  it('sem reuse (cache vazio) → chama o modelo normalmente (não-regressão)', async () => {
    let generateCalls = 0
    const deps: AttemptDeps = {
      generate: async () => {
        generateCalls++
        return planJson('a + b')
      },
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    expect(generateCalls).toBe(1)
    expect(outcome.reused).toBeUndefined()
  })

  it('buildInitialPrompt injeta scaffoldHint quando fornecido', async () => {
    const { buildInitialPrompt } = await import('../core/autonomy/implement-attempt.js')
    const prompt = buildInitialPrompt(node, { scaffoldHint: '── prev.ts ──\n+ reusable scaffold' })
    expect(prompt).toContain('reusable scaffold')
    expect(prompt.toLowerCase()).toMatch(/reaproveit|scaffold|refer/)
  })
})

describe('prompts de implementação — preferência por edits (economia de token)', () => {
  it('STABLE_SYSTEM_PROMPT carrega o contrato edits/oldString/newString (prefixo cacheável — Frente B)', async () => {
    const { STABLE_SYSTEM_PROMPT } = await import('../core/autonomy/implement-attempt.js')
    expect(STABLE_SYSTEM_PROMPT).toContain('edits')
    expect(STABLE_SYSTEM_PROMPT).toContain('oldString')
    expect(STABLE_SYSTEM_PROMPT).toContain('newString')
  })

  it('buildInitialPrompt (cauda volátil) referencia o contrato JSON do system sem reescrevê-lo', async () => {
    const { buildInitialPrompt, STABLE_SYSTEM_PROMPT } = await import('../core/autonomy/implement-attempt.js')
    const prompt = buildInitialPrompt(node)
    // A cauda cita a task e delega o contrato ao system (estável/cacheável).
    expect(prompt).toContain('contrato JSON do system')
    // O contrato em si NÃO se repete na cauda — senão o prefixo não seria estável.
    expect(prompt).not.toContain(STABLE_SYSTEM_PROMPT)
  })

  it('buildRetryPrompt orienta a preferir edits', async () => {
    const { buildRetryPrompt } = await import('../core/autonomy/implement-attempt.js')
    const prompt = buildRetryPrompt(node, { applied: [], testPassed: false, testOutput: 'erro' }, 1200)
    expect(prompt.toLowerCase()).toContain('edits')
  })

  it('buildInitialPrompt injeta o repo-map quando fornecido (e omite quando ausente)', async () => {
    const { buildInitialPrompt } = await import('../core/autonomy/implement-attempt.js')
    const withMap = buildInitialPrompt(node, { repoMap: 'src/util.ts:1 function util()' })
    expect(withMap).toContain('Contexto do repositório')
    expect(withMap).toContain('function util()')
    const without = buildInitialPrompt(node)
    expect(without).not.toContain('Contexto do repositório')
  })

  it('JSON malformado → recuperação corretiva barata (não queima a tentativa)', async () => {
    const prompts: string[] = []
    let i = 0
    const responses = ['isto NAO eh json', planJson('a + b')]
    const deps: AttemptDeps = {
      generate: async (prompt) => {
        prompts.push(prompt)
        return responses[i++] ?? planJson('a + b')
      },
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 1, maxParseRecoveries: 2 })
    expect(outcome.success).toBe(true)
    // recuperou no mesmo attempt 1 (maxAttempts=1) — provaria escala sem a recuperação
    expect(outcome.attempts).toBe(1)
    // o prompt corretivo menciona o contrato JSON
    expect(prompts.some((pr) => pr.includes('plano JSON válido') || pr.includes('contendo'))).toBe(true)
  })

  it('parse irrecuperável (cap esgotado) → escala', async () => {
    const deps: AttemptDeps = {
      generate: async () => 'nunca json',
      execute: fakeExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 1, maxParseRecoveries: 2 })
    expect(outcome.success).toBe(false)
  })
})
