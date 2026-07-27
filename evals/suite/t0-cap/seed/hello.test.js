const test = require('node:test')
const assert = require('node:assert')
const { capitalize } = require('./hello.js')

test('capitalize primeira maiúscula', () => {
  assert.strictEqual(capitalize('hello'), 'Hello')
  assert.strictEqual(capitalize('world'), 'World')
  assert.strictEqual(capitalize('a'), 'A')
})
