import test from 'node:test'
import assert from 'node:assert/strict'
import { runBatch, validateChat, type BatchJob } from './batch'

const job = (id: string): BatchJob => ({ id, content: { title: id, body: '我：你好' }, mode: 'long', selected: true, state: 'ready' })

test('batch cancellation before completion leaves rendered work retryable', async () => {
  const rows = [job('first'), job('next')]
  let cancelled = false
  const rendered: string[] = [], results: string[] = []
  await runBatch(rows, {
    render: async row => { rendered.push(row.id); cancelled = true; return new Uint8Array([1]) },
    cancelled: () => cancelled,
    update: () => {},
    result: row => { results.push(`${row.id}:${row.state}`) },
  })
  assert.deepEqual(rendered, ['first'])
  assert.deepEqual(results, ['first:ready'])
  assert.ok(rows.every(row => row.state === 'ready' && !row.locked && !row.bytes))
})

test('batch skips unchecked and cached rows', async () => {
  const rows = [job('unchecked'), job('cached'), job('fresh'), job('last')]
  rows[0].selected = false
  rows[1].state = 'done'
  rows[1].bytes = new Uint8Array([7])
  const rendered: string[] = []
  const deps = {
    render: async (row: BatchJob) => { rendered.push(row.id); return new Uint8Array([1]) },
    cancelled: () => false,
    update: () => {},
  }
  await runBatch(rows, deps)
  await runBatch(rows, deps)
  assert.deepEqual(rendered, ['fresh', 'last'])
  assert.equal(rows[0].state, 'ready')
  assert.deepEqual(rows[1].bytes, new Uint8Array([7]))
  assert.ok(rows.slice(1).every(row => row.state === 'done' && row.bytes))
})

test('batch enforces message-count and Unicode title boundaries without dropping content', () => {
  const body = Array.from({ length: 150 }, (_, i) => `我：消息 ${i + 1}`).join('\n')
  assert.doesNotThrow(() => validateChat({ title: '😀'.repeat(40), body }))
  assert.throws(() => validateChat({ title: '😀'.repeat(41), body }), /40/)
  assert.throws(() => validateChat({ title: '太长的聊天', body: `${body}\n我：消息 151` }), /150/)
})
