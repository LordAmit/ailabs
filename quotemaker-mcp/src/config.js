// Loads config.toml and resolves its paths against the directory that holds it.
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'smol-toml'

export const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULTS = {
  app_dir: '../quotemaker',
  quotes_dir: 'quotes',
  app_url: '',
}

function resolvePath(baseDir, value) {
  return isAbsolute(value) ? value : resolve(baseDir, value)
}

// Returns { appDir, quotesDir, appUrl }. appDir and quotesDir are absolute.
// appUrl is a non-empty string or null. A missing file yields the defaults;
// a malformed file throws.
export function loadConfig(configPath = resolve(SERVER_DIR, 'config.toml')) {
  let fromFile = {}
  try {
    fromFile = parse(readFileSync(configPath, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  const baseDir = dirname(configPath)
  const merged = { ...DEFAULTS, ...fromFile }
  const appUrl = typeof merged.app_url === 'string' ? merged.app_url.trim() : ''
  return {
    appDir: resolvePath(baseDir, String(merged.app_dir)),
    quotesDir: resolvePath(baseDir, String(merged.quotes_dir)),
    appUrl: appUrl || null,
  }
}
