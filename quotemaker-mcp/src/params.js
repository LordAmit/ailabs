// Parameter validation, share link hash building, and file naming.
// Pure: no filesystem, no browser.

export const TEMPLATES = [
  { id: 'template-1', description: 'Light cream paper with small flecks and creases' },
  { id: 'template-2', description: 'Warm tan paper' },
  { id: 'template-3', description: 'Light grey card stock' },
  { id: 'template-4', description: 'Aged tan paper with a heavier edge shadow' },
]

export const FONTS = ['Playfair Display', 'Lora', 'Georgia', 'Inter', 'system-ui', 'Courier New']

export const SIZE_RANGE = { min: 16, max: 72 }

// Keys that travel in the share link, in link order.
const LINK_KEYS = ['text', 'header', 'bold', 'underline', 'hfont', 'bfont', 'hsize', 'bsize', 'bg', 'wm', 'wmshow']
const COLOR_KEYS = ['header', 'bold', 'underline']
const FONT_KEYS = ['hfont', 'bfont']
const SIZE_KEYS = ['hsize', 'bsize']
const ALL_KEYS = [...LINK_KEYS, 'filename', 'output_dir', 'preview']

const HEX_COLOR = /^#[0-9a-f]{6}$/i

function paramError(name, message) {
  const err = new Error(`${name} ${message}`)
  err.param = name
  return err
}

function toBoolean(name, value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(v)) return true
    if (['0', 'false', 'no', 'off'].includes(v)) return false
  }
  throw paramError(name, 'must be true or false')
}

function toSize(name, value) {
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(n) || n < SIZE_RANGE.min || n > SIZE_RANGE.max) {
    throw paramError(name, `must be an integer from ${SIZE_RANGE.min} to ${SIZE_RANGE.max}`)
  }
  return n
}

function toFont(name, value) {
  const wanted = String(value).trim().toLowerCase()
  const match = FONTS.find(f => f.toLowerCase() === wanted)
  if (!match) throw paramError(name, `must be one of ${FONTS.join(', ')}`)
  return match
}

function toColor(name, value) {
  const v = String(value).trim()
  if (!HEX_COLOR.test(v)) throw paramError(name, 'must be a hex color like #ffd54f')
  return v.toLowerCase()
}

// Returns a normalized copy containing only the keys that were given.
// Throws an Error whose message starts with the offending parameter name.
export function validateParams(input) {
  if (!input || typeof input !== 'object') throw paramError('params', 'must be an object')
  for (const key of Object.keys(input)) {
    if (!ALL_KEYS.includes(key)) throw paramError(key, 'is not a known parameter')
  }
  const out = {}

  if (typeof input.text !== 'string' || !input.text.trim()) throw paramError('text', 'is required')
  out.text = input.text

  for (const key of COLOR_KEYS) if (input[key] !== undefined) out[key] = toColor(key, input[key])
  for (const key of FONT_KEYS) if (input[key] !== undefined) out[key] = toFont(key, input[key])
  for (const key of SIZE_KEYS) if (input[key] !== undefined) out[key] = toSize(key, input[key])

  if (input.bg !== undefined) {
    const id = String(input.bg).trim()
    if (!TEMPLATES.some(t => t.id === id)) {
      throw paramError('bg', `must be one of ${TEMPLATES.map(t => t.id).join(', ')}`)
    }
    out.bg = id
  }

  if (input.wm !== undefined) {
    if (typeof input.wm !== 'string') throw paramError('wm', 'must be a string')
    out.wm = input.wm
  }
  if (input.wmshow !== undefined) out.wmshow = toBoolean('wmshow', input.wmshow)

  if (input.filename !== undefined) {
    const name = String(input.filename).trim().replace(/\.jpe?g$/i, '')
    if (!name) throw paramError('filename', 'must not be empty')
    if (/[\\/]/.test(name)) throw paramError('filename', 'must not contain path separators')
    out.filename = name
  }
  if (input.output_dir !== undefined) {
    const dir = String(input.output_dir).trim()
    if (!dir) throw paramError('output_dir', 'must not be empty')
    out.output_dir = dir
  }
  out.preview = input.preview === undefined ? true : toBoolean('preview', input.preview)

  return out
}

// The share link hash for the given (validated) parameters, without the '#'.
export function buildHash(params) {
  const search = new URLSearchParams()
  for (const key of LINK_KEYS) {
    const value = params[key]
    if (value === undefined) continue
    search.set(key, key === 'wmshow' ? (value ? '1' : '0') : String(value))
  }
  return search.toString()
}

export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function pad(n) {
  return String(n).padStart(2, '0')
}

export function timestamp(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

// Base file name (no extension): slug of the first markdown heading, or of the
// first six words when there is no heading, plus a timestamp.
export function deriveFilename(text, date = new Date()) {
  const lines = String(text).split('\n')
  const heading = lines.find(line => /^\s*#{1,6}\s+\S/.test(line))
  let source
  if (heading) {
    source = heading.replace(/^\s*#{1,6}\s+/, '')
  } else {
    source = String(text).replace(/[#*_<>\/`]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ')
  }
  const slug = slugify(source).slice(0, 60).replace(/-+$/, '') || 'quote'
  return `${slug}-${timestamp(date)}`
}
