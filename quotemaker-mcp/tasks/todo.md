# Tasks: Quote Maker MCP Server

- [x] Task 1: Scaffold the project
  - Acceptance: `package.json` with the three dependencies pinned, scripts `start`, `test`, `render`; `config.toml` with the documented defaults; `.gitignore` covering `node_modules/` and `quotes/`; Chromium downloaded.
  - Verify: `npm test` exits 0 with no tests; `npx playwright --version` prints a version.
  - Files: package.json, config.toml, .gitignore

- [x] Task 2: Config loading
  - Acceptance: `loadConfig()` returns absolute `appDir` and `quotesDir` resolved against the config file's directory, and `appUrl` as a string or null. Missing keys fall back to defaults. A missing file falls back to defaults.
  - Verify: `npm test` passes test/config.test.js: defaults, relative resolution, absolute paths kept, `app_url` empty means null.
  - Files: src/config.js, test/config.test.js

- [x] Task 3: Parameter validation, hash building, file naming
  - Acceptance: `validateParams()` accepts the documented fields, rejects bad hex colors, sizes outside 16 to 72, unknown templates, and unknown fonts, each with an error naming the field. `buildHash()` produces the share link hash. `deriveFilename()` slugs the first heading or first six words and appends a timestamp.
  - Verify: `npm test` passes test/params.test.js covering every branch.
  - Files: src/params.js, test/params.test.js

- [x] Task 4: Renderer
  - Acceptance: `render(params, options)` starts the static server and browser on first use, waits for readiness, obtains the image by calling the page's `exportQuoteImage()`, saves it, returns `{ path, width, height, overflow, preview }` where preview is a 384x512 JPEG buffer built in the page or null, and reuses the browser on later calls.
  - Verify: `npm test` passes test/render.test.js: a short quote yields 1536x2048 and overflow false; a long quote yields overflow true; the preview is 384x512. Skips when Chromium is absent.
  - Files: src/render.js, test/render.test.js

- [x] Task 5: Command-line entry
  - Acceptance: `npm run render -- --text "# Hi" --bg template-2 --bsize 24` writes a file under `quotes/` and prints its path and overflow flag. Unknown flags and invalid values print the error and exit 1.
  - Verify: run the command and open the file.
  - Files: src/cli.js, package.json

- [x] Task 6: MCP server
  - Acceptance: stdio server exposes `render_quote`, `list_templates`, `list_fonts` with the schemas from SPEC.md. `render_quote` returns a text block and, when preview is true, an image block. Validation errors return `isError: true` with the message.
  - Verify: `npm test` passes test/server.test.js, which connects to the server over stdio with the SDK client, lists tools, renders one quote, and checks the error results.
  - Files: server.js, test/server.test.js

- [x] Task 7: README and registration
  - Acceptance: README covers install, Claude Code registration, Claude Desktop config snippet with absolute paths, the tool reference, and the config file. Server registered in Claude Code.
  - Verify: `claude mcp list` shows `quotemaker`; a new session renders one quote and the file appears in `quotes/`.
  - Files: README.md
