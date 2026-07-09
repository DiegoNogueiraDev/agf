const test = require('node:test')
const assert = require('node:assert')
const { isEven } = require('./math.js')

test('isEven detecta par', () => {
  assert.strictEqual(isEven(4), true)
  assert.strictEqual(isEven(7), false)
  assert.strictEqual(isEven(0), true)
})
