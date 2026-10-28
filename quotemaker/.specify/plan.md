# Technical Plan & Architecture

This document describes the architectural layout and component responsibilities for the Quote Maker application.

## 1. Component Overview

```mermaid
graph TD
    Editor[Markdown Input & Controls] -->|Sync State| Controller[App Controller / State Store]
    FontsDB[IndexedDB Font Storage] <-->|Fetch/Save| Controller
    Controller -->|Update HTML/CSS| RenderCanvas[4:3 Preview Canvas]
    RenderCanvas -->|Export to Canvas| ImageExporter[html2canvas Export Engine]
    ImageExporter -->|Trigger Download| User[User Download]
```

---

## 2. File Responsibilities

### UI & Layout
*   **File:** [index.html](index.html)
*   **Purpose:** Provides the structural layout (split-screen editor vs. locked 3:4 preview canvas) and utility control elements (font selectors, sliders, color inputs, upload button).

### Core Logic & State Management
*   **File:** [app.js](app.js)
*   **Purpose:** Implements:
    *   State tracking for customization inputs (colors, active font, size, watermark).
    *   Markdown parser integration (using local `marked` parser).
    *   IndexedDB wrapper to read, write, and register custom uploaded web fonts.
    *   Image export logic using local `html2canvas` to render the preview to a 1536x2048 PNG.
    *   Keyboard shortcut event listeners on the markdown textarea (`Cmd/Ctrl` + `B`/`I`/`U`) to wrap selections.
    *   Reset handler to restore color pickers, font selectors, and font sizes to original defaults.
    *   A simple updateBackgroundTexture() function to toggle background class names on the export canvas, allowing CSS to load high-resolution static background images from the `images/` directory.
    *   Shareable link helpers: applyStateFromURL() reads content and design settings from the URL hash on startup; buildShareURL() and copyShareLink() produce a link from the current inputs.

### Design System & Styling
*   **File:** [style.css](style.css)
*   **Purpose:** Standardizes the UI layout, styling for control panels, typography, custom highlighter CSS styling, custom background selections, and locking the 3:4 aspect ratio of the editor preview container. Includes explicit styling for custom scrollbars and utility reset buttons.

### Local Libraries (Offline/PWA support)
*   **Files:** 
    *   [marked.min.js](lib/marked.min.js)
    *   [html2canvas.min.js](lib/html2canvas.min.js)
*   **Purpose:** Local minified vendor dependencies to allow standard Markdown parsing and canvas image export without relying on network CDNs.

### Web App Manifest (PWA metadata)
*   **File:** [manifest.json](manifest.json)
*   **Purpose:** Metadata to define the PWA configuration, name, start URL, background/theme colors, and app icons for installation.

### Service Worker (PWA Caching)
*   **File:** [sw.js](sw.js)
*   **Purpose:** Registers listeners for install, activate, and fetch events to pre-cache resources and serve them offline.
