const test = require('node:test')
const assert = require('node:assert')
const { abs } = require('./math.js')

test('abs retorna valor absoluto', () => {
  assert.strictEqual(abs(5), 5)
  assert.strictEqual(abs(-3), 3)
  assert.strictEqual(abs(0), 0)
})
