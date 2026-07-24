const test = require('node:test')
const assert = require('node:assert')
const { getPrefs, setPrefs } = require('./prefs.js')

test('getPrefs retorna default para novo usuário', () => {
  const p = getPrefs('user-1')
  assert.deepStrictEqual(p, { theme: 'light', lang: 'en' })
})

test('setPrefs salva e getPrefs recupera', () => {
  setPrefs('user-2', { theme: 'dark', lang: 'pt-BR' })
  const p = getPrefs('user-2')
  assert.strictEqual(p.theme, 'dark')
  assert.strictEqual(p.lang, 'pt-BR')
})

test('setPrefs faz merge parcial', () => {
  setPrefs('user-3', { lang: 'es' })
  const p = getPrefs('user-3')
  assert.strictEqual(p.theme, 'light')
  assert.strictEqual(p.lang, 'es')
})
