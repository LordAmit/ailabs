import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SERVER_DIR } from '../src/config.js'
import { jpegSize } from '../src/render.js'

const skip = existsSync(chromium.executablePath()) ? false : 'Chromium is not installed; run: npx playwright install chromium'

let client
let transport
const outputDir = mkdtempSync(join(tmpdir(), 'qm-server-'))

before(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(SERVER_DIR, 'server.js')],
    stderr: 'pipe',
  })
  client = new Client({ name: 'test-client', version: '0.0.0' })
  await client.connect(transport)
})

after(async () => {
  await client.close()
})

test('the server lists the three tools', async () => {
  const { tools } = await client.listTools()
  assert.deepEqual(tools.map(t => t.name).sort(), ['list_fonts', 'list_templates', 'render_quote'])
  const renderTool = tools.find(t => t.name === 'render_quote')
  assert.deepEqual(renderTool.inputSchema.required, ['text'])
})

test('list_templates and list_fonts return the ids and names the page accepts', async () => {
  const templates = await client.callTool({ name: 'list_templates', arguments: {} })
  assert.match(templates.content[0].text, /^template-1: /m)
  assert.match(templates.content[0].text, /^template-4: /m)
  const fonts = await client.callTool({ name: 'list_fonts', arguments: {} })
  assert.equal(fonts.content[0].text.split('\n').length, 6)
  assert.match(fonts.content[0].text, /Playfair Display/)
})

test('render_quote saves the file and returns a text block plus a preview image', { skip }, async () => {
  const result = await client.callTool({
    name: 'render_quote',
    arguments: { text: '# Via MCP\n\nRendered through the server.', output_dir: outputDir, filename: 'mcp' },
  })
  assert.notEqual(result.isError, true, result.content[0] && result.content[0].text)
  const [summary, image] = result.content
  assert.equal(summary.type, 'text')
  assert.match(summary.text, /^saved: .*mcp\.jpg$/m)
  assert.match(summary.text, /^size: 1536x2048$/m)
  assert.match(summary.text, /^overflow: false$/m)
  assert.equal(image.type, 'image')
  assert.equal(image.mimeType, 'image/jpeg')
  assert.deepEqual(jpegSize(Buffer.from(image.data, 'base64')), { width: 384, height: 512 })
  assert.deepEqual(jpegSize(readFileSync(join(outputDir, 'mcp.jpg'))), { width: 1536, height: 2048 })
  assert.equal(result.structuredContent.overflow, false)
})

test('render_quote returns an error result naming a bad parameter', async () => {
  const result = await client.callTool({ name: 'render_quote', arguments: { text: 'x', hsize: 500 } })
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /^hsize must be an integer from 16 to 72/)
})

test('an unknown tool returns an error result', async () => {
  const result = await client.callTool({ name: 'nope', arguments: {} })
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /unknown tool: nope/)
})
