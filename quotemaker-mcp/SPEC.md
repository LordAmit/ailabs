# Spec: Quote Maker MCP Server

## Objective

A local MCP server that renders Quote Maker images on request from Claude Code and Claude Desktop.

Claude receives markdown and style parameters, calls `render_quote`, and the server produces the same 1536x2048 JPEG the web app exports. The file is saved to a quotes folder and a small preview is returned inline so Claude Desktop shows the result and Claude can judge it. The server also reports whether the text overflowed the canvas, so Claude can shorten the text or reduce the font size without inspecting pixels.

The server drives the existing web page through its share link and obtains the image by calling the page's own export function, so the file is the same one a browser download produces.

User stories:

- As the user in Claude Code, I ask for quotes from several passages in one template and get JPEG files in the quotes folder.
- As the user in Claude Desktop, I ask for one quote and see the preview in the chat, with the full-size file saved on disk.
- As Claude, when a render overflows, I learn that from the tool result and render again with shorter text or a smaller size.

## Tech Stack

- Node 20 or newer, ES modules. Node 26 is installed on the development machine.
- `@modelcontextprotocol/sdk` for the stdio server and tool definitions.
- `playwright` with its bundled Chromium for headless rendering.
- `smol-toml` to read `config.toml`.
- `node:test` for tests. No other dependencies.

## Commands

```
Install:            npm install && npx playwright install chromium
Run (stdio):        npm start
Test:               npm test
Render from shell:  npm run render -- --text "# Title" --bg template-2
Register (Code):    claude mcp add quotemaker -- node /Users/amitsealami/git/antigravity/quotemaker-mcp/server.js
```

Claude Desktop registration is a JSON entry in its MCP settings pointing at the same command. The README carries the exact snippet.

## Project Structure

```
quotemaker-mcp/
  SPEC.md            This document
  DECISIONS.md       Choices considered and why one was taken
  README.md          Install, registration, tool reference
  config.toml        Paths and optional page URL
  package.json
  server.js          MCP wiring: tool names, schemas, handlers
  src/config.js      Loads config.toml, resolves paths against the server directory
  src/params.js      Validates render parameters, builds the share link hash, derives file names
  src/render.js      Static file server, browser lifecycle, export call, overflow check
  src/cli.js         Shell entry point used by `npm run render`
  test/              node:test files, one per module, plus one end-to-end render test
  quotes/            Default output folder, created on first render, ignored by git
```

## Configuration

`config.toml` next to `server.js`:

```toml
# Folder that holds the Quote Maker web app (index.html, app.js, style.css).
app_dir = "../quotemaker"

# Where rendered JPEGs are written unless a call passes output_dir.
quotes_dir = "quotes"

# When set, the server opens this page instead of serving app_dir.
# Example: "https://daspoi.github.io/quotemaker/"
app_url = ""
```

Relative paths resolve against the directory that contains `config.toml`. The file ships with these defaults so a fresh clone next to the quotemaker folder works without edits.

## Tools

### render_quote

Parameters mirror the share link so Claude can reason about one vocabulary:

| Name | Type | Default | Notes |
|---|---|---|---|
| text | string | required | Markdown content |
| header | string | page default | Hex color like `#ffd54f` |
| bold | string | page default | Hex color |
| underline | string | page default | Hex color |
| hfont | string | page default | Family name, e.g. `Playfair Display` |
| bfont | string | page default | Family name, e.g. `Lora` |
| hsize | integer | page default | 16 to 72 |
| bsize | integer | page default | 16 to 72 |
| bg | string | page default | `template-1` to `template-4` |
| wm | string | page default | Watermark text |
| wmshow | boolean | page default | Show watermark |
| filename | string | derived | Without extension; `.jpg` is appended |
| output_dir | string | `quotes_dir` | Absolute, or relative to the server directory |
| preview | boolean | true | Return a 384x512 inline preview |

Result:

- Text block with the saved path, image size, and `overflow: true|false`.
- When `preview` is true, an image block with the 384x512 JPEG preview.

Validation errors, such as an unknown template or a size outside the range, return an error result that names the parameter. The server does not silently drop values, which differs from the page, because Claude needs to know a parameter was wrong.

Derived file name: a slug of the first heading, or of the first six words when there is no heading, followed by a timestamp, for example `the-road-not-taken-20261028-141502.jpg`.

### list_templates

No parameters. Returns the four template ids with a one-line description of each background.

### list_fonts

No parameters. Returns the six built-in family names accepted by `hfont` and `bfont`.

## Rendering

1. On first use the server starts a static file server on a random loopback port for `app_dir`, unless `app_url` is set, and launches one headless Chromium that stays open for later calls.
2. Each render opens `index.html` with the share link hash built from the parameters, in a page with a 1400x1000 viewport.
3. The server waits for `data-ready="true"` on the root element and for network idle with a timeout, then calls the page's `exportQuoteImage()` through `page.evaluate`. That function runs html2canvas exactly as the download button does and resolves to a 1536x2048 JPEG data URL, which the server decodes and writes to disk.
4. Overflow is measured in the page: the rendered content's bottom edge lies below the canvas's inner area or over the watermark.
5. When `preview` is true, the page draws the exported image onto a 384x512 canvas and returns a second JPEG data URL. No image library runs on the Node side.
6. The browser stays open between calls and closes when the server process exits.

## Code Style

ES modules, two-space indent, no semicolon omission, no classes where a function and a closure suffice. Functions that touch the browser live in `src/render.js` only, so `src/params.js` stays pure and testable without Chromium.

```js
// src/params.js
export function buildHash(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    search.set(key, key === 'wmshow' ? (value ? '1' : '0') : String(value))
  }
  return search.toString()
}
```

Errors thrown to the MCP layer carry the offending parameter name in the message: `bg must be one of template-1, template-2, template-3, template-4`.

## Testing Strategy

`node:test`, run with `npm test`. Tests are named by what they check.

- `test/params.test.js`: hash building, color and range validation, font name acceptance, slug derivation. Pure, no browser.
- `test/config.test.js`: defaults, relative path resolution, `app_url` override.
- `test/render.test.js`: end-to-end render of a short quote asserts a 1536x2048 JPEG on disk and `overflow: false`; a render of a very long quote asserts `overflow: true`. Skipped with a message when Chromium is not installed.
- `test/server.test.js`: connects to `server.js` over stdio with the SDK client, lists the three tools, renders one quote and checks the preview image block, and checks that a bad parameter and an unknown tool return error results.

Coverage target: every branch in `params.js` and `config.js`. The render test covers the happy path and the overflow path only.

## Boundaries

- Always: run `npm test` before committing; keep `quotes/` out of git.
- Ask first: adding any dependency beyond the three listed; changing the share link vocabulary or the export function, which would also change the page.
- Never: modify files under `quotemaker/` from this project; deploy anything; commit rendered images.

## Success Criteria

- `render_quote` with only `text` saves a 1536x2048 JPEG under `quotes/` and returns its path, size, overflow flag, and a 384x512 preview.
- The saved image is the output of the page's own export function, so it matches a browser download of the same link in every respect.
- A quote that does not fit the canvas returns `overflow: true`.
- An invalid `bg`, color, or size returns an error naming the parameter.
- `list_templates` and `list_fonts` return the ids and names the page accepts.
- After `claude mcp add`, the three tools appear in a Claude Code session and work. The same command registered in Claude Desktop shows the preview inline.
- A second render completes in under four seconds on the development machine.
- `npm test` passes.

## Open Questions

None at the time of writing. Decisions taken during the interview are recorded in DECISIONS.md.
