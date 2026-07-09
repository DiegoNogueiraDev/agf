import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseImplementationPlan } from '../core/autonomy/plan-parser.js'
import { executePlan } from '../core/autonomy/implementation-executor.js'

/**
 * Integração: resposta do modelo (texto) → parse → aplica no workspace → roda
 * os testes com runner REAL (node). Prova que o loop autônomo fecha de ponta a
 * ponta sem depender do SDK do Copilot (adapter fake substituído por texto).
 */
describe('loop autônomo (parse → apply → test) com node real', () => {
  let ws: string
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'agf-loop-'))
  })
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true })
  })

  it('plano correto → testes verdes → loop conclui (testPassed true)', async () => {
    const modelResponse = [
      'Aqui está:',
      '```json',
      JSON.stringify({
        files: [
          { path: 'sum.js', content: 'module.exports = (a, b) => a + b;\n' },
          {
            path: 'sum.test.js',
            content:
              "const sum = require('./sum');\nif (sum(2, 3) !== 5) { console.error('FAIL'); process.exit(1); }\nconsole.log('ok');\n",
          },
        ],
        testCommand: 'node sum.test.js',
      }),
      '```',
    ].join('\n')

    const plan = parseImplementationPlan(modelResponse)
    const result = await executePlan(plan, { workspaceDir: ws })

    expect(result.applied).toEqual(['sum.js', 'sum.test.js'])
    expect(result.testPassed).toBe(true)
    expect(result.testExitCode).toBe(0)
  })

  it('implementação errada → testes vermelhos → loop NÃO conclui (testPassed false)', async () => {
    const modelResponse = JSON.stringify({
      files: [
        { path: 'sum.js', content: 'module.exports = (a, b) => a - b;\n' }, // bug proposital
        {
          path: 'sum.test.js',
          content: "const sum = require('./sum');\nif (sum(2, 3) !== 5) { console.error('FAIL'); process.exit(1); }\n",
        },
      ],
      testCommand: 'node sum.test.js',
    })

    const plan = parseImplementationPlan(modelResponse)
    const result = await executePlan(plan, { workspaceDir: ws })

    expect(result.testPassed).toBe(false)
    expect(result.testExitCode).not.toBe(0)
  })
})
