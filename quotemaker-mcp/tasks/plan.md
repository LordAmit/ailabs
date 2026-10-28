# Implementation Plan: Quote Maker MCP Server

Implements SPEC.md. Each step ends with a check that must pass before the next starts.

## Components and dependencies

```
config.js ──┐
            ├──> render.js ──> cli.js
params.js ──┘        │
                     └──> server.js (MCP)
```

- `config.js` and `params.js` are pure and have no dependency on each other. They are built first and tested without a browser.
- `render.js` depends on both. It owns the static file server, the browser, the export call, and the overflow measurement.
- `cli.js` and `server.js` are thin callers of `render.js`. The CLI comes first because it is the fastest way to check real output; the MCP layer adds only protocol wiring.

## Build order

1. Scaffold: `package.json`, `config.toml`, `.gitignore`, dependencies, Chromium download.
2. `config.js` with tests.
3. `params.js` with tests.
4. `render.js` with the end-to-end test.
5. `cli.js` and the `render` npm script.
6. `server.js` with the three tools, checked with a stdio smoke test.
7. README, registration in Claude Code, one real render from a session.

Steps 2 and 3 are independent and can be done in either order. Everything else is sequential.

## Key design points

- **Static server.** `node:http` serving `app_dir` on `127.0.0.1` with an OS-assigned port. Content types for html, css, js, json, jpg, png, woff2. Started lazily on the first render and shared by all later renders. Skipped when `app_url` is set.
- **Browser lifecycle.** One Chromium launched lazily with one context, reused across calls. Viewport 1400x1000. Closed on process exit.
- **Readiness.** Wait for `html[data-ready="true"]`, then network idle with a timeout so an offline machine still renders with fallback fonts instead of hanging. `exportQuoteImage()` itself awaits `document.fonts.ready`.
- **Capture.** `page.evaluate(() => exportQuoteImage())` returns the JPEG data URL the download button would save. The server strips the data URL prefix, base64-decodes it, and writes the file. For the preview, a second `page.evaluate` loads that data URL into an Image, draws it onto a 384x512 canvas, and returns a JPEG data URL at quality 85.
- **Overflow.** Evaluate in the page: the watermark's bottom edge, or the rendered content's bottom edge when the watermark is hidden, compared against the canvas's bottom edge minus its padding. Returns a boolean.
- **File names.** Slug of the first heading, else the first six words, plus a `YYYYMMDD-HHMMSS` timestamp. Collisions are impossible within a second and unlikely otherwise. If the file exists, append `-2`, `-3`.
- **Errors.** `params.js` throws `Error` objects whose message names the parameter. `server.js` turns those into MCP error results. Anything else, such as a browser crash, is surfaced with its message and the browser is relaunched on the next call.

## Risks

| Risk | Mitigation |
|---|---|
| Google Fonts unreachable, render uses fallback fonts | Network idle wait has a timeout; the result text notes when the font load timed out. |
| Chromium not installed after `npm install` | Install step documented; the render test skips with a clear message; the server returns an error that names the install command. |
| html2canvas output differs between headless and desktop Chromium | Same engine and same code path; checked by eye against a browser download in step 7. |
| MCP SDK API differences between versions | Pin the SDK version in `package.json`; smoke test exercises initialize, list, and call. |
| Claude Desktop cannot find `node` on PATH | README gives the absolute node path for the Desktop config. |

## Verification checkpoints

- After step 1: `npm test` runs with zero tests and exits 0; `npx playwright --version` prints a version.
- After steps 2 and 3: `npm test` passes with the pure tests.
- After step 4: the render test writes a 1536x2048 JPEG produced by `exportQuoteImage()`, a 384x512 preview, and reports overflow correctly for a long text.
- After step 5: `npm run render -- --text "# Hello"` writes a file under `quotes/`.
- After step 6: the smoke test lists three tools and a `render_quote` call returns a path and a preview image block.
- After step 7: `claude mcp list` shows `quotemaker`, and a session renders a quote from a chat request.
