# Decisions

Choices made for the Quote Maker MCP server, with the alternatives considered. SPEC.md describes the server as it is; this file records why.

## 2026-10-28 Sibling folder in the antigravity repo

Chosen: `antigravity/quotemaker-mcp/` next to `quotemaker/`.

Alternatives: a subfolder inside `quotemaker/`, or a separate repository.

Why: the quotemaker folder is the deployable web app with its own spec process, and `make serve` would expose `node_modules` from a subfolder. A separate repository adds remote management for a small tool. The repo already holds independent projects as sibling folders.

## 2026-10-28 Drive the page through the share link

Chosen: the server opens `index.html` with the share link hash.

Alternatives: expose a JavaScript state API on `window` and call it from Playwright; re-implement the layout in Node.

Why: the share link already carries every setting, so setting state needs no further page change, and the same vocabulary serves people, links, and the server.

## 2026-10-28 Use the page's export function, not a screenshot

Chosen: the server calls `exportQuoteImage()` in the page and saves what it returns. The page's download handler was split so that function exists.

Alternative: a Playwright element screenshot at a 2.56 device scale factor, which is faster by about a second and needs no page change.

Why: the user wants the server's output to match a browser download as closely as possible. Two render paths can drift as the page changes; one path cannot. The extra second per render is acceptable. The preview is built in the page from the exported image for the same reason, and it avoids an image library on the Node side.

## 2026-10-28 Serve the local checkout by default

Chosen: a loopback static server for `app_dir`, with `app_url` as an optional override.

Alternatives: always render the GitHub Pages site; require `make serve` to be running.

Why: renders then match the code on disk, including changes not yet deployed, and nothing else has to be running. The Pages URL remains available for a machine without the checkout.

## 2026-10-28 Output to a quotes folder inside the server directory

Chosen: `quotes/` next to `server.js`, ignored by git, with a per-call `output_dir` override.

Alternatives: a folder under `~/Pictures`; a path chosen at registration time.

Why: the user asked for it. It keeps everything the server produces in one place and needs no setup.

## 2026-10-28 Save to disk and return a small preview

Chosen: the full image goes to disk; the tool result carries a 384x512 preview.

Alternatives: return the full image inline; return only the path.

Why: the user calls the tool from both Claude Code and Claude Desktop. Claude Code works from the path. Claude Desktop needs something visible in the chat, and a full 1536x2048 image in every result costs far more tokens than a preview.

## 2026-10-28 Built-in fonts only in the first version

Chosen: the six fonts the page ships with.

Alternatives: register uploaded fonts from a fonts folder on each page load.

Why: uploaded fonts live in the user's browser storage and are invisible to headless Chromium. Supporting them needs a page change and a fonts folder, which can come later. The user agreed to defer it.

## 2026-10-28 Configuration in config.toml

Chosen: `config.toml` with `app_dir`, `quotes_dir`, and `app_url`, parsed with `smol-toml`.

Alternatives: JSON, which needs no dependency; environment variables set at registration.

Why: the user asked for a TOML file. The parser is small and the file reads better with comments.

## 2026-10-28 Validation errors instead of silent fallback

Chosen: an invalid parameter returns an error naming it.

Alternative: mirror the page, which ignores malformed values.

Why: the page's caller is a person who sees the result. The server's caller is Claude, which needs to know a parameter was wrong to correct it.
