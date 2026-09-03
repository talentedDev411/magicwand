const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT        = process.env.PORT || 0; // 0 = auto-pick free port
const STATIC_ROOT = __dirname;
const IMAGES_DIR  = path.join(__dirname, "resources", "workloads", "images");

/* Ensure the images output directory exists */
fs.mkdirSync(IMAGES_DIR, { recursive: true });

/* ──────────────────────────────────────────────
   MIME types for static file serving
   ────────────────────────────────────────────── */

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".mjs":  "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".json": "application/json",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg":  "image/svg+xml",
    ".gif":  "image/gif",
    ".ico":  "image/x-icon",
    ".task": "application/octet-stream",
    ".wasm": "application/wasm",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf":  "font/ttf",
};

/* ──────────────────────────────────────────────
   Static file server
   ────────────────────────────────────────────── */

function serveStatic(req, res) {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let filePath  = path.join(STATIC_ROOT, urlPath);

    /* Default to the main HTML page for root */
    if (urlPath === "/" || urlPath === "") {
        filePath = path.join(STATIC_ROOT, "mwandtool.html");
    }

    const ext         = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not Found");
            return;
        }
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
    });
}

/* ──────────────────────────────────────────────
   API: POST /api/save-layer?name=filename.png
   Body: raw PNG bytes
   Saves to resources/workloads/images/<filename>
   ────────────────────────────────────────────── */

function handleSaveLayer(req, res) {
    const urlObj  = new URL(req.url, "http://localhost:" + PORT);
    const rawName = urlObj.searchParams.get("name");

    if (!rawName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Missing ?name= parameter" }));
    }

    /* Sanitize: only allow safe characters in the filename */
    const safeName = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!safeName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid filename" }));
    }

    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const filePath = path.join(IMAGES_DIR, safeName);

        try {
            fs.writeFileSync(filePath, buffer);
            console.log("  Saved: " + safeName + "  (" + buffer.length + " bytes)");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                success: true,
                file:    safeName,
                path:    filePath,
                bytes:   buffer.length
            }));
        } catch (err) {
            console.error("  Save error:", err.message);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
    });

    req.on("error", (err) => {
        console.error("  Request error:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
    });
}

/* ──────────────────────────────────────────────
   HTTP server
   ────────────────────────────────────────────── */

const server = http.createServer((req, res) => {
    /* CORS headers for local dev */
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Filename");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    /* POST /api/save-layer — save a PNG to the workloads folder */
    if (req.method === "POST" && req.url.startsWith("/api/save-layer")) {
        return handleSaveLayer(req, res);
    }

    /* Everything else: static files */
    serveStatic(req, res);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error('  Port ' + PORT + ' is busy. Try: set PORT=XXXX node server.js');
    } else {
        console.error('  Server error:', err.message);
    }
    process.exit(1);
});

server.listen(PORT, () => {
    const actualPort = server.address().port;
    console.log("");
    console.log("  ╔══════════════════════════════════════════╗");
    console.log("  ║       Magic Wand Server — Running        ║");
    console.log("  ╠══════════════════════════════════════════╣");
    console.log("  ║  http://localhost:" + actualPort + "/mwandtool.html       ║");
    console.log("  ║  Images → " + path.relative(process.cwd(), IMAGES_DIR));
    console.log("  ╚══════════════════════════════════════════╝");
    console.log("");
});
