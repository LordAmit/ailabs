import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadConfig } from '../src/config.js'

function tempConfig(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'qm-config-'))
  const path = join(dir, 'config.toml')
  if (contents !== null) writeFileSync(path, contents)
  return { dir, path }
}

test('a missing config file yields the defaults resolved against its directory', () => {
  const { dir, path } = tempConfig(null)
  const config = loadConfig(path)
  assert.equal(config.appDir, resolve(dir, '../quotemaker'))
  assert.equal(config.quotesDir, resolve(dir, 'quotes'))
  assert.equal(config.appUrl, null)
})

test('relative paths resolve against the config file directory', () => {
  const { dir, path } = tempConfig('app_dir = "../site"\nquotes_dir = "out/pics"\n')
  const config = loadConfig(path)
  assert.equal(config.appDir, resolve(dir, '../site'))
  assert.equal(config.quotesDir, resolve(dir, 'out/pics'))
})

test('absolute paths are kept as given', () => {
  const { path } = tempConfig('app_dir = "/srv/quotemaker"\nquotes_dir = "/tmp/quotes"\n')
  const config = loadConfig(path)
  assert.equal(config.appDir, '/srv/quotemaker')
  assert.equal(config.quotesDir, '/tmp/quotes')
})

test('an empty or blank app_url becomes null', () => {
  const { path } = tempConfig('app_url = "   "\n')
  assert.equal(loadConfig(path).appUrl, null)
})

test('a set app_url is returned trimmed', () => {
  const { path } = tempConfig('app_url = " https://example.test/quotemaker/ "\n')
  assert.equal(loadConfig(path).appUrl, 'https://example.test/quotemaker/')
})

test('keys missing from the file fall back to defaults', () => {
  const { dir, path } = tempConfig('app_url = "https://example.test/"\n')
  const config = loadConfig(path)
  assert.equal(config.appDir, resolve(dir, '../quotemaker'))
  assert.equal(config.quotesDir, resolve(dir, 'quotes'))
})

test('a malformed file throws', () => {
  const { path } = tempConfig('app_dir = \n')
  assert.throws(() => loadConfig(path))
})
