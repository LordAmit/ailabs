// Constants
const DB_NAME = 'QuoteMakerFontsDB';
const DB_VERSION = 1;
const STORE_NAME = 'fonts';

// State management
let db = null;
let customFonts = [];

// DOM Elements
const markdownInput = document.getElementById('markdown-input');
const renderedContent = document.getElementById('rendered-content');
const colorHeader = document.getElementById('color-header');
const colorBold = document.getElementById('color-bold');
const colorItalic = document.getElementById('color-italic');
const fontHeaderSelect = document.getElementById('font-header-select');
const fontBodySelect = document.getElementById('font-body-select');
const fontSizeHeaderSlider = document.getElementById('font-size-header');
const fontSizeHeaderVal = document.getElementById('font-size-header-val');
const fontSizeBodySlider = document.getElementById('font-size-body');
const fontSizeBodyVal = document.getElementById('font-size-body-val');
const btnHeaderDec = document.getElementById('btn-header-dec');
const btnHeaderInc = document.getElementById('btn-header-inc');
const btnBodyDec = document.getElementById('btn-body-dec');
const btnBodyInc = document.getElementById('btn-body-inc');
const bgSelect = document.getElementById('bg-select');
const watermarkInput = document.getElementById('watermark-input');
const watermarkToggle = document.getElementById('watermark-toggle');
const fontUpload = document.getElementById('font-upload');
const uploadedFontsList = document.getElementById('uploaded-fonts-list');
const btnDownload = document.getElementById('btn-download');
const btnReset = document.getElementById('btn-reset');
const btnResetDesign = document.getElementById('btn-reset-design');
const exportCanvas = document.getElementById('export-canvas');
const canvasWatermark = document.getElementById('canvas-watermark');

// Default initial markdown text
const defaultMarkdown = `# Header here

Text content here. We can use bullet lists:

- item 1
- item 2

And we can <u>underline</u> **texts**.`;

// Initialize Application
async function init() {
    markdownInput.value = defaultMarkdown;

    // Bind event listeners
    markdownInput.addEventListener('input', updatePreview);
    colorHeader.addEventListener('input', updateHighlightColors);
    colorBold.addEventListener('input', updateHighlightColors);
    colorItalic.addEventListener('input', updateHighlightColors);
    fontHeaderSelect.addEventListener('change', updateHeaderFont);
    fontBodySelect.addEventListener('change', updateBodyFont);

    fontSizeHeaderSlider.addEventListener('input', updateHeaderFontSize);
    fontSizeBodySlider.addEventListener('input', updateBodyFontSize);

    bgSelect.addEventListener('change', updateBackgroundTexture);
    watermarkInput.addEventListener('input', updateWatermark);
    watermarkToggle.addEventListener('change', updateWatermarkVisibility);
    fontUpload.addEventListener('change', handleFontUpload);
    btnDownload.addEventListener('click', downloadImage);
    btnReset.addEventListener('click', resetAppData);
    if (btnResetDesign) {
        btnResetDesign.addEventListener('click', resetDesignSettings);
    }
    markdownInput.addEventListener('keydown', handleEditorShortcuts);
    window.addEventListener('resize', resizePreview);

    btnHeaderDec.addEventListener('click', () => adjustHeaderFontSize(-2));
    btnHeaderInc.addEventListener('click', () => adjustHeaderFontSize(2));
    btnBodyDec.addEventListener('click', () => adjustBodyFontSize(-2));
    btnBodyInc.addEventListener('click', () => adjustBodyFontSize(2));

    // Mobile tabs setup
    const appContainer = document.querySelector('.app-container');
    const tabEditor = document.getElementById('tab-editor');
    const tabPreview = document.getElementById('tab-preview');

    tabEditor.addEventListener('click', () => {
        tabEditor.classList.add('active');
        tabPreview.classList.remove('active');
        appContainer.classList.add('show-editor');
        appContainer.classList.remove('show-preview');
        resizePreview();
    });

    tabPreview.addEventListener('click', () => {
        tabPreview.classList.add('active');
        tabEditor.classList.remove('active');
        appContainer.classList.add('show-preview');
        appContainer.classList.remove('show-editor');
        resizePreview();
    });

    // Initialize Database and Load Custom Fonts
    try {
        db = await openDB();
        await loadSavedFonts();
    } catch (e) {
        console.error("IndexedDB initialization failed:", e);
    }

    // Set initial preview
    updatePreview();
    updateHighlightColors();
    updateHeaderFontSize();
    updateBodyFontSize();
    updateHeaderFont();
    updateBodyFont();
    updateBackgroundTexture();
    updateWatermark();
    updateWatermarkVisibility();
    resizePreview();
}

// Markdown Rendering
function updatePreview() {
    try {
        if (window.marked && typeof window.marked.parse === 'function') {
            renderedContent.innerHTML = window.marked.parse(markdownInput.value);
        } else {
            // Minimal fallback parser if library fails to load
            renderedContent.innerHTML = markdownInput.value
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
                .replace(/\*(.*)\*/gim, '<em>$1</em>')
                .replace(/\n/gim, '<br>');
        }
        wrapBoldWords(renderedContent);
    } catch (err) {
        console.error("Error parsing markdown", err);
    }
}

// Wrap words in bold and underlined text in individual spans. html2canvas draws
// backgrounds and borders on an inline element's single bounding box, so a
// span that wraps across lines gets one full-width box at the bottom instead
// of one per line. Bold words become separate boxes; underlined words keep
// their trailing space so the underline stays continuous within a line.
function wrapBoldWords(container) {
    container.querySelectorAll('strong').forEach(el => {
        wrapTextNodes(el, 'highlight-word', false);
    });
    container.querySelectorAll('u').forEach(el => {
        wrapTextNodes(el, 'underline-word', true);
    });
}

function wrapTextNodes(node, className, keepTrailingSpace) {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const parts = keepTrailingSpace ? text.match(/\S+\s*|\s+/g) || [] : text.split(/(\s+)/);
        const fragment = document.createDocumentFragment();

        parts.forEach(part => {
            if (part.length > 0) {
                if (/^\s+$/.test(part)) {
                    fragment.appendChild(document.createTextNode(part));
                } else {
                    const span = document.createElement('span');
                    span.className = className;
                    span.textContent = part;
                    fragment.appendChild(span);
                }
            }
        });

        node.parentNode.replaceChild(fragment, node);
        return;
    }

    const children = Array.from(node.childNodes);
    children.forEach(child => {
        wrapTextNodes(child, className, keepTrailingSpace);
    });
}

// Custom highlight colors handler
function updateHighlightColors() {
    document.documentElement.style.setProperty('--highlight-header-color', colorHeader.value);
    document.documentElement.style.setProperty('--highlight-bold-color', colorBold.value);
    document.documentElement.style.setProperty('--underline-italic-color', colorItalic.value);
}

// Font Controls
function updateHeaderFont() {
    document.documentElement.style.setProperty('--font-family-header', fontHeaderSelect.value);
}

function updateBodyFont() {
    document.documentElement.style.setProperty('--font-family-body', fontBodySelect.value);
}

function updateHeaderFontSize() {
    const size = fontSizeHeaderSlider.value;
    fontSizeHeaderVal.textContent = size;
    document.documentElement.style.setProperty('--font-size-header', `${size}px`);
}

function updateBodyFontSize() {
    const size = fontSizeBodySlider.value;
    fontSizeBodyVal.textContent = size;
    document.documentElement.style.setProperty('--font-size-body', `${size}px`);
}

function adjustHeaderFontSize(delta) {
    let currentVal = parseInt(fontSizeHeaderSlider.value);
    let newVal = Math.min(Math.max(currentVal + delta, parseInt(fontSizeHeaderSlider.min)), parseInt(fontSizeHeaderSlider.max));
    fontSizeHeaderSlider.value = newVal;
    updateHeaderFontSize();
}

function adjustBodyFontSize(delta) {
    let currentVal = parseInt(fontSizeBodySlider.value);
    let newVal = Math.min(Math.max(currentVal + delta, parseInt(fontSizeBodySlider.min)), parseInt(fontSizeBodySlider.max));
    fontSizeBodySlider.value = newVal;
    updateBodyFontSize();
}

// Background textures changer
function updateBackgroundTexture() {
    exportCanvas.className = `export-canvas ${bgSelect.value}`;
}

// Watermark handlers
function updateWatermark() {
    canvasWatermark.textContent = watermarkInput.value;
}

function updateWatermarkVisibility() {
    canvasWatermark.style.display = watermarkToggle.checked ? 'block' : 'none';
}

// IndexedDB Helper Functions
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const dbInstance = e.target.result;
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'name' });
            }
        };

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function saveFontToDB(name, buffer, fileType) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.put({
            name: name,
            data: buffer,
            type: fileType
        });

        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function getFontsFromDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function deleteFontFromDB(name) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(name);

        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// Load fonts from DB & register
async function loadSavedFonts() {
    try {
        const savedFonts = await getFontsFromDB();
        for (const fontInfo of savedFonts) {
            await registerFontFace(fontInfo.name, fontInfo.data);
            addFontOption(fontInfo.name);
            addFontToUIList(fontInfo.name);
        }
    } catch (err) {
        console.error("Failed to load saved fonts", err);
    }
}

// Dynamic registration in DOM
function registerFontFace(name, buffer) {
    return new Promise((resolve, reject) => {
        const fontFace = new FontFace(name, buffer);
        fontFace.load().then((loadedFace) => {
            document.fonts.add(loadedFace);
            resolve(loadedFace);
        }).catch((err) => {
            console.error(`Error loading font face: ${name}`, err);
            reject(err);
        });
    });
}

// Add Custom Font to dropdown selects
function addFontOption(name) {
    // Avoid duplicates in Header select
    if (![...fontHeaderSelect.options].some(opt => opt.value === `'${name}', sans-serif`)) {
        const optionHeader = document.createElement('option');
        optionHeader.value = `'${name}', sans-serif`;
        optionHeader.textContent = `${name} (Uploaded)`;
        fontHeaderSelect.appendChild(optionHeader);
    }

    // Avoid duplicates in Body select
    if (![...fontBodySelect.options].some(opt => opt.value === `'${name}', sans-serif`)) {
        const optionBody = document.createElement('option');
        optionBody.value = `'${name}', sans-serif`;
        optionBody.textContent = `${name} (Uploaded)`;
        fontBodySelect.appendChild(optionBody);
    }
}

// Add Custom Font to list in Sidebar Controls
function addFontToUIList(name) {
    const item = document.createElement('div');
    item.className = 'uploaded-font-item';
    item.innerHTML = `
        <span>${name}</span>
        <button class="btn-delete-font" data-name="${name}" aria-label="Delete font">✕</button>
    `;

    item.querySelector('.btn-delete-font').addEventListener('click', async (e) => {
        const fontName = e.target.getAttribute('data-name');
        await removeFont(fontName);
        item.remove();
    });

    uploadedFontsList.appendChild(item);
}

// Handle Custom Font Upload file selection
async function handleFontUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Use filename (minus extension) as Font Face name
    const fontName = file.name.replace(/\.[^/.]+$/, "");

    const reader = new FileReader();
    reader.onload = async (event) => {
        const buffer = event.target.result;
        try {
            await saveFontToDB(fontName, buffer, file.type);
            await registerFontFace(fontName, buffer);
            addFontOption(fontName);
            addFontToUIList(fontName);

            // Apply to body font instantly by default
            fontBodySelect.value = `'${fontName}', sans-serif`;
            updateBodyFont();
        } catch (err) {
            alert(`Failed to save or register font: ${err.message}`);
        }
    };
    reader.readAsArrayBuffer(file);
}

// Remove Custom Font
async function removeFont(name) {
    try {
        await deleteFontFromDB(name);

        // Find and remove from Header select
        const optionHeader = [...fontHeaderSelect.options].find(opt => opt.value === `'${name}', sans-serif`);
        if (optionHeader) {
            fontHeaderSelect.removeChild(optionHeader);
        }

        // Find and remove from Body select
        const optionBody = [...fontBodySelect.options].find(opt => opt.value === `'${name}', sans-serif`);
        if (optionBody) {
            fontBodySelect.removeChild(optionBody);
        }

        // Fallback font selections
        fontHeaderSelect.value = "'Playfair Display', Georgia, serif";
        fontBodySelect.value = "Lora, Georgia, serif";
        updateHeaderFont();
        updateBodyFont();

        // Find registered font face and delete it
        for (const fontFace of document.fonts) {
            if (fontFace.family === name) {
                document.fonts.delete(fontFace);
                break;
            }
        }
    } catch (err) {
        console.error("Error removing font", err);
    }
}

// Export geometry: the canvas is authored at 600x800 (3:4).
// Scale 2.56 yields exactly 1536 x 2048px.
const EXPORT_WIDTH = 600;
const EXPORT_HEIGHT = 800;
const EXPORT_SCALE = 2.56;

// Collect the text of every same-origin stylesheet so it can be inlined into
// the html2canvas clone. html2canvas renders into an about:blank iframe and
// does NOT wait for <link rel="stylesheet"> to load there; under the service
// worker (installed PWA / offline) that request can fail outright, which is
// what produced unstyled, wrongly-sized exports.
function collectSameOriginCSS() {
    let css = '';
    for (const sheet of document.styleSheets) {
        let rules;
        try {
            rules = sheet.cssRules;
        } catch (e) {
            // Cross-origin sheet (e.g. Google Fonts) — not readable, skip it.
            // Those font faces are carried over via document.fonts instead.
            continue;
        }
        if (!rules) continue;
        for (const rule of rules) {
            css += rule.cssText + '\n';
        }
    }
    return css;
}

// Resolve the CSS to inline into the clone. Reading document.styleSheets is the
// fast path; it fails under a file:// origin, where Chrome treats every file as
// an opaque origin. fetch() is the fallback for the odd case where the sheet is
// unreadable but still retrievable.
async function resolveExportCSS() {
    const fromStyleSheets = collectSameOriginCSS();
    if (fromStyleSheets.trim()) return fromStyleSheets;

    try {
        const res = await fetch('style.css');
        if (res.ok) return await res.text();
    } catch (e) {
        // file:// blocks fetch entirely.
    }
    return '';
}

// Make the cloned document self-contained and render-ready
function prepareExportClone(clonedDoc, inlinedCSS) {
    // Relative urls (background textures) must resolve against the real page,
    // not about:blank.
    const base = clonedDoc.createElement('base');
    base.href = document.baseURI;
    clonedDoc.head.insertBefore(base, clonedDoc.head.firstChild);

    // Inline the stylesheets rather than relying on the <link> loading in time.
    const style = clonedDoc.createElement('style');
    style.textContent = inlinedCSS;
    clonedDoc.head.appendChild(style);

    // Re-apply the live CSS custom properties (colors, fonts, sizes).
    const liveVars = document.documentElement.style;
    for (const prop of liveVars) {
        if (prop.startsWith('--')) {
            clonedDoc.documentElement.style.setProperty(prop, liveVars.getPropertyValue(prop));
        }
    }

    // The on-screen preview sits inside a clipped, viewport-scaled box. Lift the
    // canvas out to the document origin at its true 600x800 size so the capture
    // region is exactly (0, 0, 600, 800) regardless of preview scale, scroll
    // position or which mobile tab is active.
    const clonedCanvas = clonedDoc.getElementById('export-canvas');
    if (clonedCanvas) {
        clonedDoc.body.style.margin = '0';
        clonedDoc.body.style.overflow = 'visible';
        clonedCanvas.style.position = 'absolute';
        clonedCanvas.style.top = '0';
        clonedCanvas.style.left = '0';
        clonedCanvas.style.width = `${EXPORT_WIDTH}px`;
        clonedCanvas.style.height = `${EXPORT_HEIGHT}px`;
        clonedCanvas.style.transform = 'none';
        clonedDoc.body.appendChild(clonedCanvas);
    }

    // Sync custom font faces to the cloned iframe context
    document.fonts.forEach(font => {
        try {
            clonedDoc.fonts.add(font);
        } catch (e) {
            // Some UA-provided faces cannot be adopted across documents; ignore.
        }
    });
}

// High-resolution Canvas image export
async function downloadImage() {
    if (!window.html2canvas) {
        alert("Image renderer library is still loading, please wait.");
        return;
    }

    btnDownload.textContent = "Generating...";
    btnDownload.disabled = true;

    const inlinedCSS = await resolveExportCSS();

    // Without the stylesheet the clone renders as unstyled text at the wrong
    // size. Fail loudly rather than hand back a broken image.
    if (!inlinedCSS.trim()) {
        alert(
            "Could not read the stylesheet, so the image would export unstyled.\n\n" +
            "This happens when the page is opened directly from disk (file://). " +
            "Serve the folder over http (e.g. `python3 -m http.server`) or use the installed app."
        );
        btnDownload.textContent = "Download Image (3:4)";
        btnDownload.disabled = false;
        return;
    }

    // Ensure all custom fonts are ready in document context
    document.fonts.ready.then(() => {
        html2canvas(exportCanvas, {
            scale: EXPORT_SCALE,
            // prepareExportClone() moves the canvas to the document origin, so
            // the capture region is fixed regardless of preview scale/scroll.
            x: 0,
            y: 0,
            width: EXPORT_WIDTH,
            height: EXPORT_HEIGHT,
            scrollX: 0,
            scrollY: 0,
            windowWidth: Math.max(document.documentElement.clientWidth, EXPORT_WIDTH),
            windowHeight: Math.max(document.documentElement.clientHeight, EXPORT_HEIGHT),
            useCORS: true,
            // Must stay false: a tainted canvas makes toDataURL() throw
            // SecurityError. Better to drop an unloadable background than to
            // fail the whole export.
            allowTaint: false,
            // JPEG has no alpha; transparent pixels would flatten to black.
            backgroundColor: '#ffffff',
            logging: false,
            onclone: (clonedDoc) => prepareExportClone(clonedDoc, inlinedCSS)
        }).then((canvas) => {
            const link = document.createElement('a');
            link.download = `quote_${Date.now()}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();

            btnDownload.textContent = "Download Image (3:4)";
            btnDownload.disabled = false;
        }).catch((err) => {
            console.error("Image generation failed", err);
            alert(`Could not generate image.\n\n${err && (err.message || err)}`);
            btnDownload.textContent = "Download Image (3:4)";
            btnDownload.disabled = false;
        });
    });
}

// Reset/Wipe database and reload
function resetAppData() {
    if (confirm("Are you sure you want to clear all custom fonts and settings?")) {
        indexedDB.deleteDatabase(DB_NAME);
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
    }
}

// Reset only design related settings (colors, fonts, sizes)
function resetDesignSettings() {
    colorHeader.value = '#ffd54f';
    colorBold.value = '#a3e635';
    colorItalic.value = '#ef4444';
    fontHeaderSelect.value = "'Playfair Display', Georgia, serif";
    fontBodySelect.value = "Lora, Georgia, serif";
    fontSizeHeaderSlider.value = 36;
    fontSizeBodySlider.value = 28;

    updateHighlightColors();
    updateHeaderFontSize();
    updateBodyFontSize();
    updateHeaderFont();
    updateBodyFont();
}

// Markdown formatting helper shortcuts
function handleEditorShortcuts(e) {
    const isMeta = e.ctrlKey || e.metaKey;
    if (!isMeta) return;

    let markerStart = '';
    let markerEnd = '';

    if (e.key === 'b' || e.key === 'B') {
        markerStart = '**';
        markerEnd = '**';
    } else if (e.key === 'u' || e.key === 'U') {
        markerStart = '<u>';
        markerEnd = '</u>';
    } else if (e.key === 'i' || e.key === 'I') {
        markerStart = '*';
        markerEnd = '*';
    } else {
        return;
    }

    e.preventDefault();

    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const text = markdownInput.value;
    const selectedText = text.substring(start, end);

    // Check if the selected text is already wrapped in these markers
    const hasMarker = text.substring(start - markerStart.length, start) === markerStart &&
        text.substring(end, end + markerEnd.length) === markerEnd;

    let newText = '';
    let newSelectionStart = start;
    let newSelectionEnd = end;

    if (hasMarker) {
        // Unwrap the markers
        newText = text.substring(0, start - markerStart.length) +
            selectedText +
            text.substring(end + markerEnd.length);
        newSelectionStart = start - markerStart.length;
        newSelectionEnd = end - markerStart.length;
    } else {
        // Wrap the markers
        newText = text.substring(0, start) +
            markerStart + selectedText + markerEnd +
            text.substring(end);
        newSelectionStart = start + markerStart.length;
        newSelectionEnd = end + markerStart.length;
    }

    markdownInput.value = newText;
    markdownInput.setSelectionRange(newSelectionStart, newSelectionEnd);
    updatePreview();
}

// Responsive Preview container scaling
function resizePreview() {
    const previewArea = document.querySelector('.preview-area');
    const box = document.querySelector('.preview-aspect-ratio-box');
    if (!previewArea || !box) return;

    const padding = 32; // total space margins
    const availableWidth = previewArea.clientWidth - padding;
    const availableHeight = previewArea.clientHeight - padding;

    const scaleWidth = availableWidth / 600;
    const scaleHeight = availableHeight / 800;
    const scale = Math.min(1, scaleWidth, scaleHeight);

    box.style.setProperty('--preview-scale', scale);
}



// Launch the app
window.addEventListener('DOMContentLoaded', init);

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully:', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}
