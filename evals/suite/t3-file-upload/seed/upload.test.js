const test = require('node:test')
const assert = require('node:assert')
const { validateUpload } = require('./upload.js')

test('validateUpload rejeita extensão proibida', () => {
  const result = validateUpload('malware.exe', Buffer.of(1, 2, 3))
  assert.ok(!result.valid)
  assert.ok(result.error.includes('extensão'))
})

test('validateUpload aceita .jpg < 5MB', () => {
  const buf = Buffer.alloc(1024)
  const result = validateUpload('photo.jpg', buf)
  assert.ok(result.valid)
  assert.strictEqual(result.filename, 'photo.jpg')
})

test('validateUpload rejeita > 5MB', () => {
  const buf = Buffer.alloc(6 * 1024 * 1024)
  const result = validateUpload('big.png', buf)
  assert.ok(!result.valid)
  assert.ok(result.error.includes('tamanho'))
})
