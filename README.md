# AI Magic Wand

Local, self-contained AI-powered object selection and image splitting tool. Runs
the **MediaPipe Interactive Segmenter v2 ("Magic Touch")** model entirely on your
own machine — no cloud APIs, no CDN calls at runtime.

Load any image, click an object, and the AI instantly finds its boundaries. From
there you can export the cutout, split the image into independent foreground and
background layers, or delete objects from the canvas entirely.

---

## Features

### AI Object Selection

- **Point-and-Click Detection** — Click any object and the Magic Touch model
  identifies its full boundary automatically. No drawing required.
- **Add Tool (green)** — Click the object to select it. The model processes the
  entire object from a single point hint.
- **Remove Tool (red)** — Draw around a wrongly-selected area to erase it from
  the mask. Runs entirely client-side — no model re-inference, so the rest of
  your selection stays exactly where you left it.
- **Lasso Tool (blue)** — Draw freely around the area you want to guide the
  model toward. Useful for objects the single-click tool struggles with.
- **Multi Select** — Draw multiple closed polygon sections. Each section becomes
  an independent selection. Press "Send to AI" to process all sections at once.
- **Custom Select** — Draw a closed polygon to add an area directly to the
  selection without invoking the AI. Perfect for filling gaps the model missed.
- **Add Selection** — Save the current working mask as an independent selection,
  then clear the canvas and start selecting the next object. Each saved
  selection becomes its own layer in Split Layers.

### Image Splitting (Split Layers)

- Splits the image into **N+1 independent layers**: one foreground cutout per
  selected object plus one background with transparent holes.
- Each foreground layer is **tight-cropped** to its alpha bounds — no wasted
  transparent space around the object.
- All layers are **independently draggable** with pixel-accurate hit testing.
- Layers are saved internally as binary PNGs to `resources/workloads/images/`
  via the server API. No browser download prompts.
- A **split manifest** JSON is saved alongside the PNGs for downstream tools.

### Object Deletion

- **Delete Object** — Remove the currently selected object from the canvas.
  The deleted area becomes transparent and stays transparent across all
  subsequent operations.
- **Layer-Level Delete** — In Split Layers mode, enter delete-highlight mode
  to click and remove any individual split layer independently.

### Export

- Export as **PNG** (transparent background), **JPG** (white background), or
  **WebP** at configurable quality (50%–100%).
- Export respects the current editor state: deleted objects stay deleted,
  dragged layers stay in their moved positions.

### Editor UX

- **Confirmation modals** for destructive actions (Add, Delete Object).
- **Event lock overlay** with progress bar during AI processing and layer
  operations — prevents accidental double-clicks.
- **Tight alpha bounds** extraction — exported/cutout images are cropped to
  the exact bounding box of the non-transparent pixels.
- **Layer hit testing** — click on any pixel of a split layer to grab it,
  even when layers overlap.
- **Per-layer shape highlighting** — visual tint and edge outline when
  entering delete-highlight mode in layers.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| AI Model | MediaPipe Interactive Segmenter v2 ("Magic Touch") |
| Runtime | MediaPipe Vision WASM (CPU delegate) |
| Package | `@mediapipe/tasks-vision` ^1.0.1 |
| Server | Node.js (built-in `http` module, zero dependencies) |
| Frontend | Vanilla HTML/CSS/JS (ES modules) |

---

## Setup (one time)

```bash
npm install
```

This automatically (via the `postinstall` script):
- Copies the MediaPipe WASM runtime from `node_modules` into `./vendor`
- Downloads the Magic Touch model (~30 MB) into `./assets`

If the model download gets interrupted, re-run:

```bash
npm run postinstall
```

---

## Run

```bash
npm start
```

The server auto-detects a free port and prints the URL:

```
  ╔══════════════════════════════════════════╗
  ║       Magic Wand Server — Running        ║
  ╠══════════════════════════════════════════╣
  ║  http://localhost:PORT/mwandtool.html    ║
  ║  Images → resources\workloads\images     ║
  ╚══════════════════════════════════════════╝
```

Open the printed URL in your browser.

> Opening `mwandtool.html` directly via `file://` will **not** work — the page
> needs to be served over HTTP for the local model/WASM fetches to succeed.

---

## Folder Structure

```
.
├── mwandtool.html              # Main application page
├── package.json
├── server.js                   # Node.js static server + save API
├── ref-boundaries.md           # MediaPipe API reference index
├── assets/                     # (created by postinstall)
│   └── interactive_segmentation.task
├── vendor/                     # (created by postinstall)
│   ├── vision_bundle.mjs
│   └── wasm/
├── scripts/
│   └── setup.js                # Main application logic (ES module)
├── resources/
│   └── workloads/
│       └── images/             # Split layer PNGs saved here by the server
└── node_modules/
```

---

## Server API

The built-in Node.js server provides one endpoint:

### `POST /api/save-layer?name=<filename>`

Accepts raw image bytes in the request body and writes them to
`resources/workloads/images/<filename>`.

**Query parameters:**
- `name` — filename (sanitized server-side; only `[a-zA-Z0-9._-]` allowed)

**Response:**
```json
{
  "success": true,
  "file": "selection-1_1725123456789.png",
  "path": "D:\\project\\resources\\workloads\\images\\selection-1_1725123456789.png",
  "bytes": 245760
}
```

---

## How It Works

1. **Load** — The MediaPipe WASM runtime and Magic Touch model are loaded
   entirely from local files. `setImage()` runs once per image to extract
   features.

2. **Segment** — Each click or stroke calls `segment()` which reuses the
   cached features. This is why per-click segmentation is fast — the expensive
   feature extraction only happens once.

3. **Mask** — The model returns a float confidence mask (0.0–1.0 per pixel).
   The `CONFIDENCE_THRESHOLD` (0.5) converts this into a binary alpha map.
   Removal polygons are applied locally without re-invoking the model.

4. **Split** — Each registered selected area (from Add Selection, Multi Select,
   or Custom Select) gets its own full-resolution alpha mask. The server saves
   each foreground and the leftover background as binary PNGs.

5. **Layers** — Tight-cropped display canvases are created from each alpha
   mask's bounding box. Pointer hit-testing determines which layer to drag
   based on actual opaque pixels, not bounding rectangles.

---

## Troubleshooting

- **"not a valid Flatbuffer buffer"** — The page was pinned to an old MediaPipe
  runtime that can't parse the newer v2 model format. This project uses
  `@mediapipe/tasks-vision@^1.0.1` which matches.

- **Model download fails** — Usually a proxy or firewall blocking
  `storage.googleapis.com`. Try a different network, or manually download the
  model and save it to `assets/interactive_segmentation.task`.

- **Port already in use** — The server auto-detects a free port. If you need a
  specific port: `PORT=8080 npm start`.

- **Split layers not saving** — Make sure you ran `npm start` (our server), not
  a separate static file server. The save API only exists on our server.
