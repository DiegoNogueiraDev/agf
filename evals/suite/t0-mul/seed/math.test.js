const test = require('node:test')
const assert = require('node:assert')
const { mul } = require('./math.js')

test('mul multiplica', () => {
  assert.strictEqual(mul(2, 3), 6)
  assert.strictEqual(mul(0, 5), 0)
})
