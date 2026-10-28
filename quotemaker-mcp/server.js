#!/usr/bin/env node
// MCP server over stdio. Exposes render_quote, list_templates, and list_fonts.
// stdout is the protocol channel, so nothing here writes to it directly.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { close, render } from './src/render.js'
import { FONTS, SIZE_RANGE, TEMPLATES } from './src/params.js'

const hexColor = (what) => ({ type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: `${what}, hex like #ffd54f` })
const font = (what) => ({ type: 'string', enum: FONTS, description: what })
const size = (what) => ({ type: 'integer', minimum: SIZE_RANGE.min, maximum: SIZE_RANGE.max, description: `${what} in px` })

const TOOLS = [
  {
    name: 'render_quote',
    description:
      'Render a Quote Maker image: markdown on a 3:4 textured paper canvas, saved as a 1536x2048 JPEG. ' +
      'Markdown supports # headings (highlighted), **bold** (highlighted), <u>underline</u>, and lists. ' +
      'The canvas holds roughly 40 words of body text at the default sizes; check `overflow` in the result and, ' +
      'if true, shorten the text or lower hsize/bsize and render again. ' +
      'Only `text` is required; omitted settings keep the app defaults (yellow heading highlight, green bold, ' +
      'red underline, Playfair Display heading, Lora body, 36/28 px, template-1, watermark shown). ' +
      'The result gives the saved path and, unless preview is false, a 384x512 preview image.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Markdown content of the quote' },
        header: hexColor('Heading highlight color'),
        bold: hexColor('Bold text highlight color'),
        underline: hexColor('Underline color'),
        hfont: font('Heading font family'),
        bfont: font('Body font family'),
        hsize: size('Heading font size'),
        bsize: size('Body font size'),
        bg: { type: 'string', enum: TEMPLATES.map(t => t.id), description: 'Background template; see list_templates' },
        wm: { type: 'string', description: 'Watermark text, e.g. @username' },
        wmshow: { type: 'boolean', description: 'Show the watermark' },
        filename: { type: 'string', description: 'File name without extension; derived from the text when omitted' },
        output_dir: { type: 'string', description: 'Folder for the JPEG; the configured quotes folder when omitted' },
        preview: { type: 'boolean', description: 'Return a 384x512 preview image (default true)' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_templates',
    description: 'List the background template ids accepted by render_quote, with a short description of each.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_fonts',
    description: 'List the font family names accepted by render_quote for hfont and bfont.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

function text(value) {
  return { type: 'text', text: value }
}

async function callTool(name, args) {
  switch (name) {
    case 'list_templates':
      return { content: [text(TEMPLATES.map(t => `${t.id}: ${t.description}`).join('\n'))] }
    case 'list_fonts':
      return { content: [text(FONTS.join('\n'))] }
    case 'render_quote': {
      const result = await render(args || {})
      const lines = [
        `saved: ${result.path}`,
        `size: ${result.width}x${result.height}`,
        `overflow: ${result.overflow}`,
      ]
      if (result.fontsTimedOut) lines.push('note: web fonts did not finish loading; fallback fonts may have been used')
      const content = [text(lines.join('\n'))]
      if (result.preview) {
        content.push({ type: 'image', data: result.preview.toString('base64'), mimeType: 'image/jpeg' })
      }
      return { content, structuredContent: { path: result.path, width: result.width, height: result.height, overflow: result.overflow } }
    }
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

const server = new Server(
  { name: 'quotemaker', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    return await callTool(name, args)
  } catch (err) {
    return { content: [text(err && err.message ? err.message : String(err))], isError: true }
  }
})

async function shutdown() {
  await close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

const transport = new StdioServerTransport()
transport.onclose = shutdown
await server.connect(transport)
