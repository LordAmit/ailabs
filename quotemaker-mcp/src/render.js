// Renders quotes by driving the Quote Maker page in headless Chromium and
// calling the page's own exportQuoteImage(), so the result is the same file a
// browser download produces. Owns the static file server and the browser.
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import { loadConfig, SERVER_DIR } from './config.js'
import { buildHash, deriveFilename, validateParams } from './params.js'

export const FULL_WIDTH = 1536
export const FULL_HEIGHT = 2048
export const PREVIEW_WIDTH = 384
export const PREVIEW_HEIGHT = 512

const READY_TIMEOUT_MS = 20000
const NETWORK_IDLE_TIMEOUT_MS = 8000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
}

const state = {
  staticServer: null,
  staticDir: null,
  staticUrl: null,
  browser: null,
  page: null,
}

// Serves `dir` on a loopback port chosen by the OS. Rejects paths that leave dir.
function startStaticServer(dir) {
  const root = resolve(dir)
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
      const filePath = normalize(join(root, relative))
      if (filePath !== root && !filePath.startsWith(root + sep)) {
        res.writeHead(403).end()
        return
      }
      const info = await stat(filePath).catch(() => null)
      if (!info || !info.isFile()) {
        res.writeHead(404).end()
        return
      }
      const body = await readFile(filePath)
      res.writeHead(200, {
        'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'content-length': body.length,
        'cache-control': 'no-store',
      })
      res.end(body)
    } catch (err) {
      res.writeHead(500).end(String(err && err.message))
    }
  })
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolveServer({ server, url: `http://127.0.0.1:${port}/` })
    })
  })
}

async function ensureBaseUrl(config) {
  if (config.appUrl) return config.appUrl.endsWith('/') ? config.appUrl : config.appUrl + '/'
  if (!existsSync(join(config.appDir, 'index.html'))) {
    throw new Error(`app_dir has no index.html: ${config.appDir}. Set app_dir or app_url in config.toml.`)
  }
  if (state.staticServer && state.staticDir === config.appDir) return state.staticUrl
  if (state.staticServer) {
    state.staticServer.close()
    state.staticServer = null
  }
  const { server, url } = await startStaticServer(config.appDir)
  state.staticServer = server
  state.staticDir = config.appDir
  state.staticUrl = url
  return url
}

async function ensurePage() {
  if (state.browser && state.browser.isConnected() && state.page && !state.page.isClosed()) {
    return state.page
  }
  let browser
  try {
    browser = await chromium.launch()
  } catch (err) {
    throw new Error(`Could not launch Chromium: ${err.message}. Run: npx playwright install chromium`)
  }
  browser.on('disconnected', () => {
    if (state.browser === browser) {
      state.browser = null
      state.page = null
    }
  })
  // No service worker: the page must always load the files currently on disk.
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  state.browser = browser
  state.page = page
  return page
}

// Width and height from a JPEG's start-of-frame marker.
export function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('not a JPEG')
  let offset = 2
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) throw new Error('malformed JPEG')
    const marker = buffer[offset + 1]
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2
      continue
    }
    const length = buffer.readUInt16BE(offset + 2)
    const isSOF = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isSOF) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  throw new Error('JPEG has no start-of-frame marker')
}

function decodeDataUrl(dataUrl) {
  const match = /^data:image\/jpeg;base64,(.+)$/s.exec(dataUrl || '')
  if (!match) throw new Error('export did not return a JPEG data URL')
  return Buffer.from(match[1], 'base64')
}

// Picks `${base}.jpg` in dir, or `${base}-2.jpg`, `${base}-3.jpg`, ... if taken.
async function uniquePath(dir, base) {
  let candidate = join(dir, `${base}.jpg`)
  let n = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${base}-${n}.jpg`)
    n += 1
  }
  return candidate
}

// True when the content or the watermark extends past the canvas's inner area,
// or the content runs into the watermark.
function measureOverflow() {
  const inner = document.querySelector('#export-canvas .canvas-inner')
  const content = document.getElementById('rendered-content')
  const watermark = document.getElementById('canvas-watermark')
  const innerRect = inner.getBoundingClientRect()
  const contentRect = content.getBoundingClientRect()
  const tolerance = 0.5
  if (watermark && watermark.style.display !== 'none') {
    const wmRect = watermark.getBoundingClientRect()
    return wmRect.bottom > innerRect.bottom + tolerance || contentRect.bottom > wmRect.top + tolerance
  }
  return contentRect.bottom > innerRect.bottom + tolerance
}

async function makePreview({ dataUrl, width, height }) {
  const img = new Image()
  await new Promise((resolveImg, reject) => {
    img.onload = resolveImg
    img.onerror = () => reject(new Error('preview image failed to load'))
    img.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// Renders one quote. `input` is the raw parameter object; `options.config`
// overrides config.toml and `options.now` fixes the timestamp (both for tests).
// Resolves to { path, width, height, overflow, fontsTimedOut, preview }.
export async function render(input, options = {}) {
  const params = validateParams(input)
  const config = options.config || loadConfig()
  const baseUrl = await ensureBaseUrl(config)
  const page = await ensurePage()

  // A hash-only change would not reload the page, so leave it first.
  await page.goto('about:blank')
  await page.goto(`${new URL('index.html', baseUrl).href}#${buildHash(params)}`, { waitUntil: 'load' })
  await page.waitForSelector('html[data-ready="true"]', { timeout: READY_TIMEOUT_MS })
  let fontsTimedOut = false
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {
    fontsTimedOut = true
  })

  const overflow = await page.evaluate(measureOverflow)
  const dataUrl = await page.evaluate(() => exportQuoteImage())
  const image = decodeDataUrl(dataUrl)
  const { width, height } = jpegSize(image)

  let preview = null
  if (params.preview) {
    const previewUrl = await page.evaluate(makePreview, { dataUrl, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT })
    preview = decodeDataUrl(previewUrl)
  }

  const outputDir = params.output_dir
    ? (isAbsolute(params.output_dir) ? params.output_dir : resolve(SERVER_DIR, params.output_dir))
    : config.quotesDir
  await mkdir(outputDir, { recursive: true })
  const base = params.filename || deriveFilename(params.text, options.now)
  const path = await uniquePath(outputDir, base)
  await writeFile(path, image)

  return { path, width, height, overflow, fontsTimedOut, preview }
}

export async function close() {
  if (state.browser) {
    const browser = state.browser
    state.browser = null
    state.page = null
    await browser.close().catch(() => {})
  }
  if (state.staticServer) {
    state.staticServer.close()
    state.staticServer = null
    state.staticDir = null
    state.staticUrl = null
  }
}
