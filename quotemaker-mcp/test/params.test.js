import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateParams, buildHash, slugify, deriveFilename, timestamp, TEMPLATES, FONTS } from '../src/params.js'

function rejects(input, param) {
  assert.throws(() => validateParams(input), err => {
    assert.equal(err.param, param, `expected error on ${param}, got: ${err.message}`)
    assert.ok(err.message.startsWith(param), err.message)
    return true
  })
}

test('text is required and nothing else is', () => {
  const out = validateParams({ text: '# Hi' })
  assert.deepEqual(out, { text: '# Hi', preview: true })
  rejects({}, 'text')
  rejects({ text: '   ' }, 'text')
  rejects({ text: 42 }, 'text')
})

test('unknown parameters are rejected by name', () => {
  rejects({ text: 'x', colour: '#000000' }, 'colour')
})

test('colors must be six-digit hex and are lowercased', () => {
  const out = validateParams({ text: 'x', header: '#FFD54F', bold: '#a3e635', underline: '#EF4444' })
  assert.equal(out.header, '#ffd54f')
  assert.equal(out.bold, '#a3e635')
  assert.equal(out.underline, '#ef4444')
  rejects({ text: 'x', header: 'ffd54f' }, 'header')
  rejects({ text: 'x', bold: '#fff' }, 'bold')
  rejects({ text: 'x', underline: 'red' }, 'underline')
})

test('fonts match the built-in list case-insensitively and return the canonical name', () => {
  const out = validateParams({ text: 'x', hfont: 'playfair display', bfont: 'SYSTEM-UI' })
  assert.equal(out.hfont, 'Playfair Display')
  assert.equal(out.bfont, 'system-ui')
  rejects({ text: 'x', hfont: 'Comic Sans' }, 'hfont')
  rejects({ text: 'x', bfont: 'Playfair' }, 'bfont')
})

test('sizes must be integers from 16 to 72, numbers or numeric strings', () => {
  const out = validateParams({ text: 'x', hsize: 40, bsize: '24' })
  assert.equal(out.hsize, 40)
  assert.equal(out.bsize, 24)
  rejects({ text: 'x', hsize: 15 }, 'hsize')
  rejects({ text: 'x', bsize: 73 }, 'bsize')
  rejects({ text: 'x', hsize: 30.5 }, 'hsize')
  rejects({ text: 'x', bsize: 'big' }, 'bsize')
})

test('bg must be a known template id', () => {
  for (const t of TEMPLATES) assert.equal(validateParams({ text: 'x', bg: t.id }).bg, t.id)
  rejects({ text: 'x', bg: 'template-9' }, 'bg')
})

test('watermark text is any string and wmshow accepts booleans and common strings', () => {
  assert.equal(validateParams({ text: 'x', wm: '@me' }).wm, '@me')
  rejects({ text: 'x', wm: 5 }, 'wm')
  assert.equal(validateParams({ text: 'x', wmshow: false }).wmshow, false)
  assert.equal(validateParams({ text: 'x', wmshow: '0' }).wmshow, false)
  assert.equal(validateParams({ text: 'x', wmshow: 'yes' }).wmshow, true)
  rejects({ text: 'x', wmshow: 'maybe' }, 'wmshow')
})

test('filename drops a .jpg extension and rejects path separators', () => {
  assert.equal(validateParams({ text: 'x', filename: 'my-quote.jpg' }).filename, 'my-quote')
  assert.equal(validateParams({ text: 'x', filename: 'plain' }).filename, 'plain')
  rejects({ text: 'x', filename: '  ' }, 'filename')
  rejects({ text: 'x', filename: '../escape' }, 'filename')
  rejects({ text: 'x', filename: 'a\\b' }, 'filename')
})

test('output_dir must be non-empty and preview defaults to true', () => {
  assert.equal(validateParams({ text: 'x', output_dir: '/tmp/q' }).output_dir, '/tmp/q')
  rejects({ text: 'x', output_dir: '' }, 'output_dir')
  assert.equal(validateParams({ text: 'x', preview: 'false' }).preview, false)
  rejects({ text: 'x', preview: 'sometimes' }, 'preview')
})

test('the hash carries only link keys in link order with wmshow as 1 or 0', () => {
  const params = validateParams({
    text: '# T\n\nBody & more', header: '#112233', bg: 'template-2', wmshow: false,
    filename: 'ignored', output_dir: '/ignored', preview: false,
  })
  const hash = buildHash(params)
  assert.equal(hash, 'text=%23+T%0A%0ABody+%26+more&header=%23112233&bg=template-2&wmshow=0')
  const back = new URLSearchParams(hash)
  assert.equal(back.get('text'), '# T\n\nBody & more')
  assert.equal(back.get('filename'), null)
})

test('slugify lowercases, strips accents, and collapses non-alphanumerics', () => {
  assert.equal(slugify('  The Road — Not Taken!  '), 'the-road-not-taken')
  assert.equal(slugify('Café Été'), 'cafe-ete')
  assert.equal(slugify('***'), '')
})

test('timestamp is YYYYMMDD-HHMMSS in local time', () => {
  assert.equal(timestamp(new Date(2026, 9, 28, 14, 15, 2)), '20261028-141502')
})

test('deriveFilename uses the first heading when there is one', () => {
  const name = deriveFilename('intro line\n## The Road Not Taken\nbody', new Date(2026, 9, 28, 14, 15, 2))
  assert.equal(name, 'the-road-not-taken-20261028-141502')
})

test('deriveFilename uses the first six words when there is no heading', () => {
  const name = deriveFilename('Two roads **diverged** in a yellow wood, and sorry', new Date(2026, 9, 28, 0, 0, 0))
  assert.equal(name, 'two-roads-diverged-in-a-yellow-20261028-000000')
})

test('deriveFilename falls back to quote when nothing slugs', () => {
  assert.equal(deriveFilename('***', new Date(2026, 0, 1, 0, 0, 0)), 'quote-20260101-000000')
})

test('the built-in font list has the six page fonts', () => {
  assert.deepEqual(FONTS, ['Playfair Display', 'Lora', 'Georgia', 'Inter', 'system-ui', 'Courier New'])
})
