import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePassword } from '../server/auth.js'
import { passwordPolicyError } from '../src/utils.js'

const cases = [
  ['short1', false, 'too short'],
  ['allletters', false, 'no digit'],
  ['12345678', false, 'no letter'],
  ['abcd1234', true, 'ok: 8 chars, letter+digit'],
  ['Str0ngPass', true, 'ok: mixed'],
  ['', false, 'empty'],
]

test('server validatePassword enforces length + letter + digit', () => {
  for (const [pw, expected] of cases) {
    assert.equal(validatePassword(pw).ok, expected, `validatePassword(${JSON.stringify(pw)})`)
  }
})

test('client passwordPolicyError mirrors the server policy', () => {
  for (const [pw, expected] of cases) {
    assert.equal(passwordPolicyError(pw) === null, expected, `passwordPolicyError(${JSON.stringify(pw)})`)
  }
})
