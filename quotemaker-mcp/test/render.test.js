import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { SERVER_DIR } from '../src/config.js'
import { close, jpegSize, render, FULL_WIDTH, FULL_HEIGHT, PREVIEW_WIDTH, PREVIEW_HEIGHT } from '../src/render.js'

const chromiumInstalled = existsSync(chromium.executablePath())
const skip = chromiumInstalled ? false : 'Chromium is not installed; run: npx playwright install chromium'

const quotesDir = mkdtempSync(join(tmpdir(), 'qm-render-'))
const config = {
  appDir: resolve(SERVER_DIR, '../quotemaker'),
  quotesDir,
  appUrl: null,
}
const fixedNow = new Date(2026, 9, 28, 12, 0, 0)

after(async () => { await close() })

test('a short quote renders a 1536x2048 JPEG with a 384x512 preview and no overflow', { skip }, async () => {
  const result = await render(
    { text: '# A Short Title\n\nOne line of **body** text.', bg: 'template-2', wm: '@test' },
    { config, now: fixedNow },
  )
  assert.equal(dirname(result.path), quotesDir)
  assert.equal(basename(result.path), 'a-short-title-20261028-120000.jpg')
  const file = readFileSync(result.path)
  assert.deepEqual(jpegSize(file), { width: FULL_WIDTH, height: FULL_HEIGHT })
  assert.equal(result.width, FULL_WIDTH)
  assert.equal(result.height, FULL_HEIGHT)
  assert.equal(result.overflow, false)
  assert.ok(Buffer.isBuffer(result.preview))
  assert.deepEqual(jpegSize(result.preview), { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT })
})

test('a quote too long for the canvas reports overflow and skips the preview when asked', { skip }, async () => {
  const paragraph = 'Two roads diverged in a yellow wood, and sorry I could not travel both. '
  const result = await render(
    { text: `# Long\n\n${paragraph.repeat(12)}`, preview: false },
    { config, now: fixedNow },
  )
  assert.equal(result.overflow, true)
  assert.equal(result.preview, null)
  assert.deepEqual(jpegSize(readFileSync(result.path)), { width: FULL_WIDTH, height: FULL_HEIGHT })
})

test('a given filename is used and a repeat gets a numeric suffix', { skip }, async () => {
  const first = await render({ text: 'hello', filename: 'named', preview: false }, { config })
  const second = await render({ text: 'hello', filename: 'named.jpg', preview: false }, { config })
  assert.equal(basename(first.path), 'named.jpg')
  assert.equal(basename(second.path), 'named-2.jpg')
})

test('output_dir overrides the configured quotes folder', { skip }, async () => {
  const other = mkdtempSync(join(tmpdir(), 'qm-other-'))
  const result = await render({ text: 'elsewhere', output_dir: other, preview: false }, { config })
  assert.equal(dirname(result.path), other)
})

test('an invalid parameter is rejected before any rendering', async () => {
  await assert.rejects(render({ text: 'x', bg: 'template-9' }, { config }), /^Error: bg must be one of/)
})

test('a missing app directory is reported with the config keys to set', async () => {
  await assert.rejects(
    render({ text: 'x' }, { config: { ...config, appDir: '/nonexistent/dir' } }),
    /app_dir has no index\.html/,
  )
})
