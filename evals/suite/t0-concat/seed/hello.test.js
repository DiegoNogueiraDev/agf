const test = require('node:test')
const assert = require('node:assert')
const { concat } = require('./hello.js')

test('concat junta strings', () => {
  assert.strictEqual(concat('Hello', 'World'), 'HelloWorld')
  assert.strictEqual(concat('abc', ''), 'abc')
  assert.strictEqual(concat('', 'xyz'), 'xyz')
})
