# Quote Maker MCP Server

A local MCP server that renders Quote Maker images for Claude Code and Claude Desktop. It drives the web app in a headless browser and calls the app's own export, so each file is the same 1536x2048 JPEG a browser download produces.

## Install

```
cd /Users/amitsealami/git/antigravity/quotemaker-mcp
npm install
npx playwright install chromium
npm test
```

## Configure

`config.toml` next to `server.js`:

```toml
app_dir = "../quotemaker"   # folder with index.html, app.js, style.css
quotes_dir = "quotes"       # where JPEGs go unless a call passes output_dir
app_url = ""                # set to a URL to render that page instead of app_dir
```

Relative paths resolve against the folder that holds the file. The defaults work for a checkout where this folder sits next to `quotemaker`.

## Register

Claude Code, available in every project:

```
claude mcp add -s user quotemaker -- /opt/homebrew/bin/node /Users/amitsealami/git/antigravity/quotemaker-mcp/server.js
```

Claude Desktop, in its MCP settings file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "quotemaker": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/amitsealami/git/antigravity/quotemaker-mcp/server.js"]
    }
  }
}
```

Desktop does not search the shell PATH, so the command is the absolute path to `node`.

## Tools

### render_quote

| Parameter | Type | Default | Notes |
|---|---|---|---|
| text | string | required | Markdown. `#` headings and `**bold**` are highlighted, `<u>` is underlined, lists work. |
| header, bold, underline | string | app defaults | Hex colors like `#ffd54f` |
| hfont, bfont | string | Playfair Display, Lora | One of the names from `list_fonts` |
| hsize, bsize | integer | 36, 28 | 16 to 72 |
| bg | string | template-1 | One of the ids from `list_templates` |
| wm | string | @username | Watermark text |
| wmshow | boolean | true | Show the watermark |
| filename | string | derived | Without extension. Derived from the first heading, or the first six words, plus a timestamp. |
| output_dir | string | quotes_dir | Absolute, or relative to this folder |
| preview | boolean | true | Return a 384x512 preview image in the result |

Result: a text block with the saved path, the size, and `overflow: true|false`, then the preview image when requested. Overflow means the text did not fit the canvas; shorten it or lower the sizes and render again. The canvas holds roughly 40 words of body text at the default sizes.

An invalid value returns an error naming the parameter, for example `bg must be one of template-1, template-2, template-3, template-4`.

### list_templates

Returns the four template ids with a short description of each background.

### list_fonts

Returns the six font family names accepted by `hfont` and `bfont`.

## Command line

The same renderer from a shell, with the same parameter names as flags:

```
npm run render -- --text "# Title

Body with **bold**." --bg template-2 --bsize 24 --no-preview
```

Prints the saved path and the overflow flag. Exits 1 with the message on an invalid parameter.

## How it works

1. On the first call the server serves `app_dir` on a loopback port and launches one headless Chromium that stays open for later calls. Service workers are blocked so the page always loads the files on disk.
2. Each call opens `index.html` with the parameters in the URL hash, the same share link the app's Copy Link button produces, and waits for the page to report `data-ready`.
3. It measures overflow from the layout, then calls the page's `exportQuoteImage()` and writes the returned JPEG to disk. The preview is drawn from that image inside the page.

Custom fonts uploaded in a browser live in that browser's storage and are not available here. The six built-in fonts are.

## Troubleshooting

- **Could not launch Chromium.** Run `npx playwright install chromium`.
- **app_dir has no index.html.** Fix `app_dir` in `config.toml`, or set `app_url`.
- **Fonts look wrong.** Web fonts load from Google Fonts over the network. Offline, the render finishes with fallback fonts and the result notes it.
- **Edited the web app and renders did not change.** Not expected, since service workers are blocked and files are served with no caching. Restart the server if it happens.

## Tests

`npm test` runs the pure tests for config and parameters, an end-to-end render against the sibling `quotemaker` folder, and a client-driven test of the MCP server over stdio. The browser tests skip with a message when Chromium is not installed.
