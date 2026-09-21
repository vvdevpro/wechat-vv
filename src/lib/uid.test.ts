import test from 'node:test'
import assert from 'node:assert/strict'
import { newId } from './uid'

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('newId returns a UUID v4', () => {
  for (let index = 0; index < 50; index += 1) assert.match(newId(), uuidV4)
})

test('newId stays unique across many calls', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()))
  assert.equal(ids.size, 1000)
})

test('newId falls back when randomUUID is missing', () => {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
  try {
    for (let index = 0; index < 50; index += 1) assert.match(newId(), uuidV4)
  } finally {
    delete (globalThis.crypto as unknown as Record<string, unknown>).randomUUID
  }
})
