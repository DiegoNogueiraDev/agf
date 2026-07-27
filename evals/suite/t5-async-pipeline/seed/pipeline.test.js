const test = require('node:test')
const assert = require('node:assert')
const { createPipeline } = require('./pipeline.js')

test('pipeline executa etapas em ordem', async () => {
  const steps = []
  const pipe = createPipeline()
  pipe.use(async (ctx) => {
    steps.push('a')
  })
  pipe.use(async (ctx) => {
    steps.push('b')
  })
  await pipe.run({})
  assert.deepStrictEqual(steps, ['a', 'b'])
})

test('pipeline passa ctx entre etapas', async () => {
  const pipe = createPipeline()
  pipe.use(async (ctx) => {
    ctx.x = 1
  })
  pipe.use(async (ctx) => {
    ctx.x += 2
  })
  const ctx = await pipe.run({})
  assert.strictEqual(ctx.x, 3)
})

test('pipeline para na primeira etapa que erra', async () => {
  const pipe = createPipeline()
  pipe.use(async () => {
    throw new Error('fail')
  })
  pipe.use(async () => {
    throw new Error('nunca chega')
  })
  const result = await pipe.run({})
  assert.ok(result.error)
  assert.ok(result.error.includes('fail'))
  assert.strictEqual(result.step, 0)
})

test('pipeline com retry: tenta de novo se falhar', async () => {
  let attempts = 0
  const pipe = createPipeline({ retry: 2 })
  pipe.use(async (ctx) => {
    attempts++
    if (attempts < 2) throw new Error('temporary')
  })
  const result = await pipe.run({})
  assert.strictEqual(attempts, 2)
  assert.strictEqual(result.error, undefined, 'result should have no error after retry succeeds')
})
