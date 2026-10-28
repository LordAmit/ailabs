#!/usr/bin/env node
// Shell entry: node src/cli.js --text "# Title" [--bg template-2] [--hsize 40] ...
// Flags mirror the render_quote parameters. Prints the saved path and the
// overflow flag; exits 1 with the error message on failure.
import { close, render } from './render.js'

const USAGE = `Usage: npm run render -- --text "<markdown>" [options]

Options (same names as the render_quote tool):
  --text <markdown>      required
  --header <hex>         --bold <hex>         --underline <hex>
  --hfont <family>       --bfont <family>
  --hsize <16-72>        --bsize <16-72>
  --bg <template-1..4>   --wm <text>          --wmshow <true|false>
  --filename <name>      --output_dir <dir>   --no-preview
`

function parseArgs(argv) {
  const params = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--no-preview') {
      params.preview = false
      continue
    }
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`)
    const key = arg.slice(2).replace(/-/g, '_')
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`${key} needs a value`)
    params[key] = value
    i += 1
  }
  return { params }
}

async function main() {
  let parsed
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}`)
    process.exit(1)
  }
  if (parsed.help) {
    process.stdout.write(USAGE)
    return
  }
  try {
    const result = await render(parsed.params)
    process.stdout.write(`${result.path}\n`)
    process.stdout.write(`size: ${result.width}x${result.height}\n`)
    process.stdout.write(`overflow: ${result.overflow}\n`)
    if (result.fontsTimedOut) process.stdout.write('note: web fonts did not finish loading; fallback fonts may have been used\n')
  } catch (err) {
    process.stderr.write(`${err.message}\n`)
    process.exitCode = 1
  } finally {
    await close()
  }
}

main()
