/* =========================================================
   MEDIAPIPE
========================================================= */

import {
    FilesetResolver,
    InteractiveSegmenter
}
from
"../vendor/vision_bundle.mjs";


/* =========================================================
   CONSTANTS
========================================================= */

/*
    BrushMode is a TypeScript `const enum` in Google's source, so it
    gets inlined at compile time and the compiled vision_bundle.mjs
    never actually exports it as an object - importing it throws
    "does not provide an export named 'BrushMode'".

    Its underlying numeric values (confirmed via the cross-platform
    SDK, e.g. Python's BrushMode(enum.IntEnum)) are:

        0 = UNSPECIFIED (do not use)
        1 = POSITIVE
        2 = NEGATIVE
        3 = LASSO

    So we use the raw numbers directly - this matches what the
    original code already had.
*/

const BRUSH_POSITIVE = 1;
const BRUSH_NEGATIVE = 2;
const BRUSH_LASSO = 3;


/*
    Official Magic Touch model.
*/

const MODEL_URL =
"./assets/interactive_segmentation.task";


/*
    Matching MediaPipe WASM.
*/

const WASM_URL =
"./vendor/wasm";


/* =========================================================
   DOM
========================================================= */

const fileInput =
document.getElementById("fileInput");

const image =
document.getElementById("image");

const maskCanvas =
document.getElementById("maskCanvas");

const interactionCanvas =
document.getElementById("interactionCanvas");

const compositeCanvas =
document.getElementById("compositeCanvas");
const compositeCtx = compositeCanvas.getContext("2d");

const deleteObjectButton =
document.getElementById("deleteObjectButton");

const exportFormat = document.getElementById("exportFormat");
const exportQuality = document.getElementById("exportQuality");

const maskCtx =
maskCanvas.getContext("2d");

const interactionCtx =
interactionCanvas.getContext("2d");

const addButton =
document.getElementById("addButton");

const removeButton =
document.getElementById("removeButton");

const lassoButton =
document.getElementById("lassoButton");

const multiSelectButton =
document.getElementById("multiSelectButton");

const sendAiButton =
document.getElementById("sendAiButton");

const customSelectButton =
document.getElementById("customSelectButton");

const addSelectionButton =
document.getElementById("addSelectionButton");

const clearButton =
document.getElementById("clearButton");

const downloadButton =
document.getElementById("downloadButton");

const layersButton =
document.getElementById("layersButton");

const resetLayerPositionButton =
document.getElementById("resetLayerPositionButton");

const exitLayersButton =
document.getElementById("exitLayersButton");

const stage =
document.getElementById("stage");

// layer canvases are created dynamically per-split — no static DOM refs

const status =
document.getElementById("status");

const spinner =
document.getElementById("spinner");

const hint =
document.getElementById("hint");

const loadingScreen =
document.getElementById("loading-screen");

const loadingMessage =
document.getElementById("loading-message");

const progress =
document.getElementById("progress");

const errorBox =
document.getElementById("error-box");

const errorMessage =
document.getElementById("error-message");

const addConfirmModal = document.getElementById("add-confirm-modal");
const addConfirmCancel = document.getElementById("add-confirm-cancel");
const addConfirmProceed = document.getElementById("add-confirm-proceed");

const deleteConfirmModal = document.getElementById("delete-confirm-modal");
const deleteConfirmCancel = document.getElementById("delete-confirm-cancel");
const deleteConfirmProceed = document.getElementById("delete-confirm-proceed");

const eventLock = document.getElementById("event-lock");
const eventLockMessage = document.getElementById("event-lock-message");
const eventLockProgress = document.getElementById("event-lock-progress");

let processingSnapshot = null;


/* =========================================================
   STATE
========================================================= */

let segmenter = null;

let imageLoaded = false;

let imageSetInSegmenter = false;

let imageWidth = 0;

let imageHeight = 0;

let currentMode =
"add";

let currentMask = null;

let strokes = [];

let removalPolygons = [];

/*
Shared with drawMask() and the download/cutout function -
confidence values from the model are floats 0.0-1.0.
*/
const CONFIDENCE_THRESHOLD = 0.5;

let currentStroke = [];

let drawing = false;

let processing = false;

let multiSelectMode = false;

let pendingStrokes = [];

// Completed free-transform multi-selection sections.
let multiSections = [];
// Authoritative completed Multi Select state. Every closed area gets one immutable
// record here. Split Layers uses this list directly; AI masks never determine the
// number of split foreground layers.
let multiSelectionState = [];
// Every completed selected area—regardless of tool—gets an immutable unique
// ID and its own alpha mask. Split Layers uses this registry as its sole
// source of truth for the number of foreground images.
let selectedAreaRegistry = [];
let selectedAreaSequence = 0;
function makeSelectedAreaId(source = 'selection') {
    selectedAreaSequence += 1;
    return `${source}-area-${Date.now()}-${selectedAreaSequence}-${Math.random().toString(36).slice(2, 8)}`;
}
function registerSelectedArea({ source, polygon = null, alpha, color = null }) {
    if (!alpha || alpha.length !== imageWidth * imageHeight) return null;
    const record = {
        id: makeSelectedAreaId(source),
        source,
        polygon: Array.isArray(polygon) ? polygon.map(p => ({ x: p.x, y: p.y })) : null,
        alpha: new Uint8ClampedArray(alpha),
        color,
        createdAt: Date.now()
    };
    selectedAreaRegistry.push(record);
    return record;
}
// Materialized split resources for completed Multi Select sections.
// Each entry is independent and survives changes to the working mask.
let multiSplitResources = [];
// Editor-owned split resources; Split Layers never downloads or writes files.
let activeSplitResources = [];
const multiSectionColors = [
    "rgba(255, 82, 82, .95)",
    "rgba(255, 193, 7, .95)",
    "rgba(76, 175, 80, .95)",
    "rgba(33, 150, 243, .95)",
    "rgba(156, 39, 176, .95)",
    "rgba(0, 188, 212, .95)"
];

let customSelectMode = false;
let deleteHighlightMode = false;
let activeDeleteLayerIndex = -1;
let deletedMask = null;
let cachedAlphaMask = null;
let manualAddMask = null;

// Each entry: { alpha: Uint8ClampedArray (imageWidth * imageHeight), color: string }
let selections = [];
const SELECTION_COLORS = [
    "rgba(255, 82, 82, 0.35)",
    "rgba(255, 193, 7, 0.35)",
    "rgba(76, 175, 80, 0.35)",
    "rgba(33, 150, 243, 0.35)",
    "rgba(156, 39, 176, 0.35)",
    "rgba(0, 188, 212, 0.35)"
];

// Dynamic layer canvases and their drag state
let layerCanvasElements = [];
let layerOffsets = [];
let layerDragActive = false;
let layerDragIdx = -1;
let layerDragStartX = 0;
let layerDragStartY = 0;
let layerDragOriginX = 0;
let layerDragOriginY = 0;


/* =========================================================
   UI
========================================================= */

function setStatus(
    text,
    busy = false
) {

    status.textContent =
        text;

    spinner.classList.toggle(
        "visible",
        busy
    );

}




function showError(
    error
) {

    console.error(
        error
    );

    errorBox.classList.add(
        "visible"
    );

    errorMessage.textContent =
        error?.stack ||
        error?.message ||
        String(error);

    setStatus(
        "ERROR"
    );

}


function hideError() {

    errorBox.classList.remove(
        "visible"
    );

}


/* =========================================================
   BUTTON STATE
========================================================= */

function setButtonBusy(button, busy, busyLabel = "Processing...") {
    if (!button) return;
    if (busy) {
        if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent.trim();
        button.textContent = busyLabel;
        button.classList.add("busy");
        button.disabled = true;
    } else {
        button.textContent = button.dataset.idleLabel || button.textContent;
        button.classList.remove("busy");
    }
}

function setProgress(percent, message) {
    progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    loadingMessage.textContent = message;
    if (eventLockProgress) eventLockProgress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (eventLockMessage) eventLockMessage.textContent = message;
}

function setProcessBusy(busy, label = "Processing...") {
    if (busy) {
        if (eventLock) eventLock.classList.add("visible");
        if (eventLock) eventLockMessage.textContent = label;
        if (eventLockProgress) eventLockProgress.style.width = "8%";
    } else if (eventLock) {
        eventLock.classList.remove("visible");
        eventLockProgress.style.width = "0%";
    }
}

function lockEditor(label = "Processing...") {
    if (processing) return false;
    processing = true;
    document.body.classList.add("processing-cursor");
    processingSnapshot = [];
    document.querySelectorAll("button, select, .file-button").forEach(el => {
        processingSnapshot.push({ el, disabled: el.disabled });
        el.disabled = true;
    });
    fileInput.disabled = true;
    setProcessBusy(true, label);
    setStatus(label, true);
    hint.textContent = label;
    return true;
}

function unlockEditor() {
    if (processingSnapshot) {
        processingSnapshot.forEach(({ el, disabled }) => {
            if (el && el.isConnected) el.disabled = disabled;
        });
    }
    processingSnapshot = null;
    processing = false;
    document.body.classList.remove("processing-cursor");
    setProcessBusy(false);
    fileInput.disabled = false;
    if (imageLoaded) enableTools(); else disableTools();
    const hasAnything = currentMask || selections.length > 0;
    if (hasAnything) {
        downloadButton.disabled = false;
        layersButton.disabled = stage.classList.contains("layers-mode");
        deleteObjectButton.disabled = !currentMask || stage.classList.contains("layers-mode");
        exportFormat.disabled = false;
        exportQuality.disabled = false;
    }
    if (stage.classList.contains("layers-mode")) {
        deleteObjectButton.disabled = false;
        downloadButton.disabled = false;
        exportFormat.disabled = false;
        exportQuality.disabled = false;
        resetLayerPositionButton.disabled = false;
        resetLayerPositionButton.style.display = "";
        exitLayersButton.disabled = false;
        exitLayersButton.style.display = "";
    }
}

async function runLocked(label, task) {
    if (!lockEditor(label)) return;
    try {
        await new Promise(requestAnimationFrame);
        return await task();
    } finally {
        unlockEditor();
    }
}

function enableTools() {
    addButton.disabled = false;
    removeButton.disabled = false;
    lassoButton.disabled = false;
    multiSelectButton.disabled = false;
    customSelectButton.disabled = false;
    addSelectionButton.disabled = !currentMask;
    clearButton.disabled = false;
    exportFormat.disabled = !currentMask && !stage.classList.contains("layers-mode");
    exportQuality.disabled = !currentMask && !stage.classList.contains("layers-mode");
    downloadButton.disabled = !currentMask && !stage.classList.contains("layers-mode");
    layersButton.disabled = !currentMask && selections.length === 0 && multiSelectionState.length === 0;
    deleteObjectButton.disabled = true;
    sendAiButton.disabled = !(multiSections.length > 0);
}

function disableTools() {
    [addButton, removeButton, lassoButton, multiSelectButton, sendAiButton, customSelectButton, addSelectionButton, clearButton, downloadButton, layersButton, deleteObjectButton, exportFormat, exportQuality].forEach(el => { if (el) el.disabled = true; });
}

/* =========================================================
   MODE
========================================================= */

function resetInteractionState() {
    drawing = false;
    currentStroke = [];
    redrawInteraction();
}

function setMode(mode) {
    // Every mode is mutually exclusive.
    currentMode = mode;
    multiSelectMode = mode === "multi";
    customSelectMode = mode === "custom";

    [addButton, removeButton, lassoButton, multiSelectButton, customSelectButton].forEach(b => b.classList.remove("active", "mode-active"));

    if (mode === "add") {
        addButton.classList.add("active");
        hint.textContent = "🟢 Click the object or paint the area that belongs to it";
    } else if (mode === "remove") {
        removeButton.classList.add("active");
        hint.textContent = "🔴 Paint the wrongly-selected area to remove it";
    } else if (mode === "lasso") {
        lassoButton.classList.add("active");
        hint.textContent = "🔵 Draw around the area you want to guide the segmenter";
    } else if (mode === "multi") {
        multiSelectButton.classList.add("mode-active");
        hint.textContent = multiSections.length ? "Multi Select: draw another closed section, or press ✨ Send to AI" : "Multi Select: draw a closed section. Return to the starting point to finish it.";
    } else if (mode === "custom") {
        customSelectButton.classList.add("mode-active");
        hint.textContent = "Custom Select: draw a closed area to add it directly to the selection — no AI";
    }

    resetInteractionState();
}

addButton.addEventListener("click", () => { if (!processing) setMode("add"); });
removeButton.addEventListener("click", () => { if (!processing) setMode("remove"); });
lassoButton.addEventListener("click", () => { if (!processing) setMode("lasso"); });

function openAddConfirmation(point) {
    return new Promise(resolve => {
        if (!addConfirmModal) return resolve(true);
        addConfirmModal.classList.add("visible");
        addConfirmModal.dataset.point = JSON.stringify(point);
        const finish = value => {
            addConfirmModal.classList.remove("visible");
            addConfirmCancel?.removeEventListener("click", onCancel);
            addConfirmProceed?.removeEventListener("click", onProceed);
            addConfirmModal.removeEventListener("click", onBackdrop);
            resolve(value);
        };
        const onCancel = () => finish(false);
        const onProceed = () => {
            // Set loading cursor immediately on confirmation
            document.body.classList.add("processing-cursor");
            finish(true);
        };
        const onBackdrop = e => { if (e.target === addConfirmModal) finish(false); };
        addConfirmCancel?.addEventListener("click", onCancel);
        addConfirmProceed?.addEventListener("click", onProceed);
        addConfirmModal.addEventListener("click", onBackdrop);
    });
}

multiSelectButton.addEventListener("click", () => {
    if (processing) return;
    if (currentMode === "multi") {
        setMode("add");
        multiSections = [];
        multiSelectionState = [];
        selectedAreaRegistry = [];
        multiSplitResources = [];
        sendAiButton.disabled = true;
    } else {
        setMode("multi");
    }
});

customSelectButton.addEventListener("click", () => {
    if (processing) return;
    if (currentMode === "custom") setMode("add");
    else setMode("custom");
});

sendAiButton.addEventListener("click", async () => {
    if (processing || currentMode !== "multi" || !multiSections.length) return;
    const sectionsToSend = multiSections.map(section => ({ brushMode: BRUSH_LASSO, point: [...section], isCompleted: true }));
    strokes.push(...sectionsToSend);
    // Keep completed Multi Select polygons alive for Split Layers.
    // AI segmentation receives copies and may build a combined mask, but that
    // combined mask must never replace the individual split resources.
    currentStroke = [];
    sendAiButton.disabled = true;
    redrawInteraction();
    await runSegmentation("Sending multi-select to AI...");
    if (currentMode === "multi") hint.textContent = "Multi Select: draw another closed section, or press ✨ Send to AI";
});

/*
   ADD SELECTION
   Saves the current working mask as an independent selection,
   then resets the working state so the user can select the next object.
   selections[] is the temporary store — all in-memory, destroyed on
   page unload or image reload.
*/

function storeCurrentSelection() {
    if (!imageLoaded) return null;
    const alpha = cachedAlphaMask || computeImageAlphaMask();
    const color = SELECTION_COLORS[selections.length % SELECTION_COLORS.length];
    const record = registerSelectedArea({ source: 'saved-selection', alpha, color });
    if (!record) throw new Error('Unable to register saved selection.');
    selections.push({ id: record.id, alpha: record.alpha, color, source: 'saved-selection' });
    updateSelectionsUI();
    return alpha;
}

function updateSelectionsUI() {
    if (selections.length > 0) {
        addSelectionButton.textContent = `＋ Add Selection (${selections.length})`;
    } else {
        addSelectionButton.textContent = "＋ Add Selection";
    }
}

addSelectionButton.addEventListener("click", async () => {
    if (processing || !currentMask || !imageLoaded) return;
    await runLocked("Saving selection...", async () => {
        setProgress(50, "Storing selection...");
        storeCurrentSelection();
        // Reset working mask for the next selection
        strokes = [];
        removalPolygons = [];
        currentStroke = [];
        currentMask = null;
        deletedMask = null;
        cachedAlphaMask = null;
        manualAddMask = null;
        stage.classList.remove("deleted-mode");
        compositeCtx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
        clearCanvases();
        setProgress(100, `Selection ${selections.length} saved.`);
        setStatus(`Selection ${selections.length} saved — select another object`);
        hint.textContent = selections.length > 1
            ? `${selections.length} objects saved. Click another object, or press Split Layers.`
            : `1 object saved. Click another object to select it.`;
        layersButton.disabled = false;
        downloadButton.disabled = true;
        deleteObjectButton.disabled = true;
        exportFormat.disabled = true;
        exportQuality.disabled = true;
        sendAiButton.disabled = true;
    });
});

/* =========================================================
   CLEAR CANVASES
========================================================= */

function clearCanvases() {

    maskCtx.clearRect(
        0,
        0,
        maskCanvas.width,
        maskCanvas.height
    );

    interactionCtx.clearRect(
        0,
        0,
        interactionCanvas.width,
        interactionCanvas.height
    );

}


/* =========================================================
   INITIALIZE
========================================================= */

async function initialize() {

    disableTools();

    hideError();

    try {

        setProgress(
            10,
            "Loading MediaPipe WebAssembly..."
        );

        setStatus(
            "Loading MediaPipe...",
            true
        );


        const vision =
            await FilesetResolver.forVisionTasks(
                WASM_URL
            );


        setProgress(
            45,
            "Loading Magic Touch model..."
        );

        setStatus(
            "Loading AI model...",
            true
        );


        /*
        -----------------------------------------------------
        Create Interactive Segmenter.

        CPU is deliberately used here first.

        Your previous logs showed the WebGL graph was being
        invoked. CPU avoids the GL path while we establish
        that the actual segmentation pipeline works.
        -----------------------------------------------------
        */

        /*
        v2 InteractiveSegmenter has no task-specific config options
        beyond baseOptions - outputCategoryMask/outputConfidenceMasks
        no longer exist and are silently ignored if passed. The task
        always returns a single confidence-mask MPMask.
        */

        segmenter =
            await InteractiveSegmenter.createFromOptions(
                vision,
                {
                    baseOptions: {
                        modelAssetPath:
                            MODEL_URL,

                        delegate:
                            "CPU"
                    }
                }
            );


        setProgress(
            100,
            "AI object selector is ready."
        );


        setStatus(
            "AI Ready"
        );


        hint.textContent =
            "Load an image, then click an object";


        enableTools();


        setTimeout(
            () => {

                loadingScreen.classList.add(
                    "hidden"
                );

            },
            500
        );


    }
    catch (error) {

        showError(
            error
        );

        loadingMessage.textContent =
            "Failed to initialize.";

    }

}


initialize();


/* =========================================================
   IMAGE LOADING
========================================================= */

fileInput.addEventListener(
    "change",
    event => {

        const file =
            event.target.files[0];


        if (!file) {

            return;

        }


        hideError();
        setStatus("Loading image...", true);
        hint.textContent = "Loading image...";

        const url =
            URL.createObjectURL(
                file
            );


        image.onload =
            async () => {

                imageWidth =
                    image.naturalWidth;

                imageHeight =
                    image.naturalHeight;


                /*
                Canvas coordinates remain in the
                original image resolution.
                */

                maskCanvas.width =
                    imageWidth;

                maskCanvas.height =
                    imageHeight;


                interactionCanvas.width =
                    imageWidth;

                interactionCanvas.height =
                    imageHeight;


                imageLoaded =
                    true;


                strokes = [];

                removalPolygons = [];

                currentStroke = [];

                currentMask = null;
                deletedMask = null;
                cachedAlphaMask = null;
                manualAddMask = null;
                selections = [];
                updateSelectionsUI();
                stage.classList.remove("deleted-mode");

                drawing = false;
                pendingStrokes = [];
                multiSelectMode = false;
                customSelectMode = false;
                multiSections = [];
                multiSelectionState = [];
        selectedAreaRegistry = [];
                multiSplitResources = [];
                multiSelectButton.classList.remove("mode-active");
                customSelectButton.classList.remove("mode-active");
                sendAiButton.disabled = true;


                clearCanvases();


                downloadButton.disabled =
                    true;

                layersButton.disabled =
                    true;

                exitLayersMode();


                /*
                -----------------------------------------------------
                setImage() runs the expensive feature-extraction pass
                over the whole image. It should run ONCE per image,
                not once per click - segment() is the cheap part that
                reuses these cached features for each stroke.
                -----------------------------------------------------
                */

                if (segmenter) {
                    if (lockEditor("Analyzing image...")) {
                        try {
                            setProgress(35, "Analyzing image...");
                            await new Promise(requestAnimationFrame);
                            segmenter.setImage(image);
                            imageSetInSegmenter = true;
                            setProgress(100, "Image analysis complete.");
                        } finally {
                            unlockEditor();
                        }
                    }
                } else {
                    imageSetInSegmenter = false;
                }


                setStatus(
                    `${imageWidth} × ${imageHeight}`
                );


                hint.textContent =
                    "Click the object you want to select";


                URL.revokeObjectURL(
                    url
                );

            };


        image.onerror =
            error => {

                console.error(
                    error
                );

                setStatus(
                    "Image failed to load"
                );

                URL.revokeObjectURL(
                    url
                );

            };


        image.src =
            url;

    }
);


/* =========================================================
   COORDINATES
========================================================= */

function getNormalizedPoint(
    event
) {

    const rect =
        interactionCanvas.getBoundingClientRect();


    const px =
        event.clientX -
        rect.left;


    const py =
        event.clientY -
        rect.top;


    let x =
        px /
        rect.width;


    let y =
        py /
        rect.height;


    x =
        Math.max(
            0,
            Math.min(
                1,
                x
            )
        );


    y =
        Math.max(
            0,
            Math.min(
                1,
                y
            )
        );


    return {
        x,
        y
    };

}


/* =========================================================
   POINTER DOWN
========================================================= */

interactionCanvas.addEventListener("pointerdown", async event => {
    if (event.button !== 0 || !imageLoaded || processing) return;
    const point = getNormalizedPoint(event);

    // Add is a direct click event: no drawing/selection rectangle.
    if (currentMode === "add") {
        if (!segmenter) return;
        const confirmed = await openAddConfirmation(point);
        if (!confirmed || processing || currentMode !== "add") return;
        strokes.push({ brushMode: BRUSH_POSITIVE, point: [point], isCompleted: true });
        await runSegmentation("Selecting object at clicked point...");
        return;
    }

    if (!segmenter && !customSelectMode && currentMode !== "multi") return;
    try { interactionCanvas.setPointerCapture(event.pointerId); } catch (_) {}
    drawing = true;
    currentStroke = [point];
    redrawInteraction();
});

interactionCanvas.addEventListener("pointermove", event => {
    if (!drawing || processing) return;
    const point = getNormalizedPoint(event);
    const last = currentStroke[currentStroke.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.002) currentStroke.push(point);
    redrawInteraction();
});

interactionCanvas.addEventListener("pointerup", async event => {
    if (!drawing || processing) return;
    drawing = false;
    try { interactionCanvas.releasePointerCapture(event.pointerId); } catch (_) {}
    if (currentStroke.length < 2) { currentStroke = []; redrawInteraction(); return; }

    if (currentMode === "multi") {
        const first = currentStroke[0];
        const last = currentStroke[currentStroke.length - 1];
        const closeDistance = Math.hypot(last.x - first.x, last.y - first.y);
        const closeThreshold = 0.035;
        if (currentStroke.length >= 3 && closeDistance <= closeThreshold) {
            currentStroke[currentStroke.length - 1] = { ...first };
            const completedSection = [...currentStroke];
            const sectionAlpha = rasterizeNormalizedPolygonToAlpha(completedSection);
            const sectionIndex = multiSelectionState.length;
            const color = multiSectionColors[sectionIndex % multiSectionColors.length];
            const record = registerSelectedArea({
                source: 'multi-selection', polygon: completedSection,
                alpha: sectionAlpha, color
            });
            if (!record) throw new Error('Unable to register Multi Select area.');
            const stateRecord = {
                id: record.id,
                index: sectionIndex,
                polygon: record.polygon,
                alpha: record.alpha,
                color: record.color,
                source: record.source
            };
            multiSections.push(completedSection);
            multiSelectionState.push(stateRecord);
            multiSplitResources.push({
                id: record.id,
                alpha: new Uint8ClampedArray(record.alpha),
                color,
                kind: 'multi-selection',
                source: 'multi-section',
                index: sectionIndex
            });
            currentStroke = [];
            sendAiButton.disabled = false;
            setStatus(`Multi Select: section ${multiSections.length} completed`);
            hint.textContent = "Section completed. Draw another section, or press ✨ Send to AI";
        } else {
            setStatus("Multi Select: section not closed");
            hint.textContent = "Return the end of the line to the starting point to close this section";
        }
        redrawInteraction();
        return;
    }

    if (currentMode === "custom") {
        const polygon = [...currentStroke];
        currentStroke = [];
        redrawInteraction();
        if (polygon.length >= 3) {
            await runLocked("Applying custom selection...", async () => {
                setProgress(50, "Applying custom selection...");
                applyCustomSelection(polygon);
                setProgress(100, "Custom selection applied.");
            });
        }
        return;
    }

    if (currentMode === "remove") {
        if (currentStroke.length >= 3) {
            await runLocked("Removing selected area...", async () => {
                removalPolygons.push([...currentStroke]);
                setProgress(80, "Updating selection...");
                drawMask();
                setProgress(100, "Selected area removed.");
            });
        }
        currentStroke = [];
        redrawInteraction();
        return;
    }

    const stroke = {
        brushMode: currentMode === "lasso" ? BRUSH_LASSO : BRUSH_POSITIVE,
        point: [...currentStroke],
        isCompleted: true
    };
    strokes.push(stroke);
    currentStroke = [];
    redrawInteraction();
    await runSegmentation("Selecting object...");
});

interactionCanvas.addEventListener("pointercancel", event => {
    drawing = false;
    currentStroke = [];
    try { interactionCanvas.releasePointerCapture(event.pointerId); } catch (_) {}
    redrawInteraction();
});

/* =========================================================
   RUN SEGMENTATION
========================================================= */

async function runSegmentation(label = "Selecting object...") {

    if (
        !segmenter ||
        !imageLoaded ||
        strokes.length === 0
    ) {

        return;

    }


    if (
        processing
    ) {

        return;

    }


    if (!lockEditor(label)) return;
    try {
        setProgress(20, label);
        hint.textContent = "AI is finding the object boundary...";

        /*
        setImage() already ran once when the image was loaded -
        segment() reuses those cached features, which is what makes
        per-click segmentation fast. Fallback here only covers the
        case where the model wasn't ready yet at image-load time.
        */

        if (
            !imageSetInSegmenter
        ) {

            segmenter.setImage(
                image
            );

            imageSetInSegmenter =
                true;

        }


        /*
        -----------------------------------------------------
        THIS IS THE IMPORTANT CALL.

        Google's Interactive Segmenter API:

            segment([
                {
                    brushMode: 1,
                    point: [...],
                    isCompleted: true
                }
            ])

        -----------------------------------------------------
        */

        console.log(
            "SEGMENTATION INPUT:",
            strokes
        );


        /*
        v2 API: segment() returns the MPMask directly (a single
        confidence mask), not a wrapped { categoryMask } object.
        */

        setProgress(55, "AI is segmenting the selected regions...");
        const mask = segmenter.segment(strokes);
        setProgress(85, "Rendering selection...");


        console.log(
            "SEGMENTATION RESULT (MPMask):",
            mask
        );


        if (
            !mask
        ) {

            throw new Error(
                "MediaPipe returned no segmentation mask."
            );

        }


        currentMask =
            mask;


        drawMask();

        // Cache alpha for delete/export — avoids re-reading MPMask later
        cachedAlphaMask = computeImageAlphaMask();


        downloadButton.disabled = false;
        layersButton.disabled = false;
        deleteObjectButton.disabled = true;
        exportFormat.disabled = false;
        exportQuality.disabled = false;


        setStatus(
            "Object selected"
        );


        hint.textContent =
            "🟢 Add   🔴 Remove   🔵 Lasso";


    }
    catch (error) {

        console.error(
            "SEGMENTATION ERROR:",
            error
        );


        showError(
            error
        );


        setStatus(
            "Segmentation failed"
        );

    }
    finally {
        if (eventLockProgress) eventLockProgress.style.width = "100%";
        unlockEditor();
        if (currentMode === "multi") sendAiButton.disabled = multiSections.length === 0;
        if (currentMask) addSelectionButton.disabled = false;
    }

}


/* =========================================================
   REMOVE-TOOL MASKING (local eraser, no model call)
========================================================= */

/*
Ray-casting point-in-polygon test. Coordinates and polygon points
are all normalized [0,1], matching the stroke points collected from
pointer events.
*/

/*
Zeroes out (in place) any mask value whose pixel falls inside a
user-traced "remove" loop. This runs entirely client-side on the
mask data we already have - it never calls the model, so it can't
cause the model to re-guess the object boundary elsewhere.

Rasterizes each removal polygon onto an offscreen canvas (same
resolution as the mask) using the browser's own path-fill, instead
of a hand-rolled point-in-polygon test. This matters because a
freehand loop from a mouse/finger very often crosses over itself
slightly - a manual ray-casting test can misclassify large chunks
of area as "inside" for a self-intersecting shape, which is exactly
the symptom of a circled region wiping out an unrelated part of the
object. Canvas fill uses the standard nonzero winding rule, which
resolves self-intersecting loops the way they visually look to the
user, and is also much faster since it's one native fill per
polygon instead of testing every mask pixel against every edge.
*/

function applyRemovals(
    maskData,
    maskWidth,
    maskHeight
) {

    if (
        removalPolygons.length === 0
    ) {

        return maskData;

    }


    const temp =
        document.createElement(
            "canvas"
        );

    temp.width =
        maskWidth;

    temp.height =
        maskHeight;


    const ctx =
        temp.getContext(
            "2d"
        );

    ctx.fillStyle =
        "#fff";


    for (
        const polygon of removalPolygons
    ) {

        if (
            polygon.length < 3
        ) {

            continue;

        }


        ctx.beginPath();

        ctx.moveTo(
            polygon[0].x * maskWidth,
            polygon[0].y * maskHeight
        );


        for (
            let i = 1;
            i < polygon.length;
            i++
        ) {

            ctx.lineTo(
                polygon[i].x * maskWidth,
                polygon[i].y * maskHeight
            );

        }


        ctx.closePath();

        ctx.fill();

    }


    const removalPixels =
        ctx.getImageData(
            0,
            0,
            maskWidth,
            maskHeight
        ).data;


    for (
        let i = 0;
        i < maskData.length;
        i++
    ) {

        /*
        Alpha channel of the rasterized removal shape at this pixel
        - non-zero means it was inside a drawn removal loop.
        */

        if (
            removalPixels[i * 4 + 3] > 0
        ) {

            maskData[i] = 0;

        }

    }


    return maskData;

}


/*
Shared by the download button and the "Split into layers" feature.
Combines the AI confidence mask with any local removals, then
resamples it from the model's mask resolution up (or down) to the
image's actual pixel resolution, returning a plain 0/255-per-pixel
Uint8ClampedArray alpha map the size of the image.
*/

function computeImageAlphaMask() {

    const maskWidth =
        currentMask.width;

    const maskHeight =
        currentMask.height;

    // Copy to avoid mutating the MPMask's internal buffer
    const maskData =
        new Float32Array(currentMask.getAsFloat32Array());

    applyRemovals(
        maskData,
        maskWidth,
        maskHeight
    );

    // Deleted pixels are always transparent in exports/layers.
    if (deletedMask && deletedMask.length === imageWidth * imageHeight) {
        for (let y = 0; y < imageHeight; y++) {
            for (let x = 0; x < imageWidth; x++) {
                const i = y * imageWidth + x;
                if (deletedMask[i]) maskData[Math.min(maskData.length - 1, Math.floor(y * maskHeight / imageHeight) * maskWidth + Math.floor(x * maskWidth / imageWidth))] = 0;
            }
        }
    }


    const alpha =
        new Uint8ClampedArray(
            imageWidth * imageHeight
        );


    for (
        let y = 0;
        y < imageHeight;
        y++
    ) {

        const maskY =
            Math.min(
                maskHeight - 1,
                Math.floor(
                    y * maskHeight / imageHeight
                )
            );


        for (
            let x = 0;
            x < imageWidth;
            x++
        ) {

            const maskX =
                Math.min(
                    maskWidth - 1,
                    Math.floor(
                        x * maskWidth / imageWidth
                    )
                );


            const maskIndex =
                maskY * maskWidth + maskX;


            const selected =
                maskData[maskIndex] >= CONFIDENCE_THRESHOLD;


            const manualSelected = manualAddMask && manualAddMask.length === imageWidth * imageHeight
                ? manualAddMask[y * imageWidth + x] === 1
                : false;

            alpha[
                y * imageWidth + x
            ] = (selected || manualSelected) ? 255 : 0;

        }

    }


    return alpha;

}


function renderComposite() {
    if (!imageLoaded) return;
    compositeCanvas.width = imageWidth;
    compositeCanvas.height = imageHeight;
    compositeCtx.clearRect(0, 0, imageWidth, imageHeight);
    compositeCtx.drawImage(image, 0, 0, imageWidth, imageHeight);

    if (!deletedMask) return;
    const pixels = compositeCtx.getImageData(0, 0, imageWidth, imageHeight);
    for (let i = 0; i < deletedMask.length; i++) {
        if (deletedMask[i]) pixels.data[i * 4 + 3] = 0;
    }
    compositeCtx.putImageData(pixels, 0, 0);
}

function applyDeleteSelection() {
    const alpha = computeImageAlphaMask();
    if (!deletedMask || deletedMask.length !== alpha.length) deletedMask = new Uint8Array(alpha.length);
    for (let i = 0; i < alpha.length; i++) if (alpha[i]) deletedMask[i] = 1;
    stage.classList.add("deleted-mode");
    renderComposite();
    drawMask();
}

/* =========================================================
   CUSTOM LOCAL SELECTION
========================================================= */

function applyCustomSelection(polygon) {

    if (!imageWidth || !imageHeight || polygon.length < 3) return;

    // Rasterize the user's custom area at image resolution.
    const temp = document.createElement("canvas");
    temp.width = imageWidth;
    temp.height = imageHeight;
    const ctx = temp.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(polygon[0].x * imageWidth, polygon[0].y * imageHeight);
    for (let i = 1; i < polygon.length; i++) {
        ctx.lineTo(polygon[i].x * imageWidth, polygon[i].y * imageHeight);
    }
    ctx.closePath();
    ctx.fill();

    const customPixels = ctx.getImageData(0, 0, imageWidth, imageHeight).data;
    const customAlpha = new Uint8ClampedArray(imageWidth * imageHeight);
    for (let i = 0; i < customAlpha.length; i++) {
        customAlpha[i] = customPixels[i * 4 + 3] > 0 ? 255 : 0;
    }
    const customRecord = registerSelectedArea({
        source: 'custom-selection',
        polygon,
        alpha: customAlpha,
        color: SELECTION_COLORS[selectedAreaRegistry.length % SELECTION_COLORS.length]
    });
    if (!customRecord) throw new Error('Unable to register Custom Select area.');

    // IMPORTANT: blend/union with the existing AI selection instead of
    // replacing it. This is specifically for filling small areas the model missed.
    let existing = null;
    if (currentMask) {
        existing = computeImageAlphaMask();
    }

    if (!manualAddMask || manualAddMask.length !== imageWidth * imageHeight) {
        manualAddMask = new Uint8Array(imageWidth * imageHeight);
    }
    for (let i = 0; i < manualAddMask.length; i++) {
        if (customPixels[i * 4 + 3] > 0) manualAddMask[i] = 1;
    }

    const values = new Float32Array(imageWidth * imageHeight);
    for (let i = 0; i < values.length; i++) {
        const customSelected = manualAddMask[i] === 1;
        const alreadySelected = existing ? existing[i] > 0 : false;
        values[i] = (customSelected || alreadySelected) ? 1 : 0;
    }

    currentMask = {
        width: imageWidth,
        height: imageHeight,
        getAsFloat32Array() { return values; }
    };

    // Custom polygons are intentionally not stored as persistent AI marks.
    currentStroke = [];
    drawMask();
    cachedAlphaMask = computeImageAlphaMask();

    downloadButton.disabled = false;
    layersButton.disabled = false;
    setStatus(existing ? "Custom area blended into selection" : "Custom selection ready");
    hint.textContent = existing
        ? "Custom area added to the existing selection — draw another area if needed"
        : "Custom selection ready — no AI marks were added";
}


/* =========================================================
   DRAW MASK
========================================================= */

function drawMask() {

    maskCtx.clearRect(
        0,
        0,
        maskCanvas.width,
        maskCanvas.height
    );


    if (
        !currentMask
    ) {

        return;

    }


    const width =
        currentMask.width;


    const height =
        currentMask.height;


    /*
    v2 API: this is a confidence mask - float values 0.0-1.0 per
    pixel, not a 0/255 category mask. Threshold it to decide what's
    "selected". (CONFIDENCE_THRESHOLD is declared once, near the top.)
    */

    // Copy to avoid mutating the MPMask's internal buffer
    const data =
        new Float32Array(currentMask.getAsFloat32Array());


    applyRemovals(
        data,
        width,
        height
    );


    const temp =
        document.createElement(
            "canvas"
        );


    temp.width =
        width;

    temp.height =
        height;


    const ctx =
        temp.getContext(
            "2d"
        );


    const imageData =
        ctx.createImageData(
            width,
            height
        );


    /*
    ---------------------------------------------------------
    Convert category mask into visible overlay.
    ---------------------------------------------------------
    */

    for (
        let i = 0;
        i < data.length;
        i++
    ) {

        /*
        Below threshold = background, skip it.
        */

        if (
            data[i] < CONFIDENCE_THRESHOLD
        ) {

            continue;

        }


        const p =
            i * 4;


        imageData.data[p] =
            0;

        imageData.data[p + 1] =
            180;

        imageData.data[p + 2] =
            255;

        imageData.data[p + 3] =
            100;

    }


    ctx.putImageData(
        imageData,
        0,
        0
    );


    /*
    ---------------------------------------------------------
    Scale mask to original image size.
    ---------------------------------------------------------
    */

    maskCtx.drawImage(
        temp,
        0,
        0,
        maskCanvas.width,
        maskCanvas.height
    );

    if (deletedMask) {
        const deletedOverlay = document.createElement("canvas");
        deletedOverlay.width = imageWidth;
        deletedOverlay.height = imageHeight;
        const dctx = deletedOverlay.getContext("2d");
        const dimg = dctx.createImageData(imageWidth, imageHeight);
        for (let i = 0; i < deletedMask.length; i++) {
            if (deletedMask[i]) dimg.data[i * 4 + 3] = 255;
        }
        dctx.putImageData(dimg, 0, 0);
        maskCtx.save();
        maskCtx.globalCompositeOperation = "destination-out";
        maskCtx.drawImage(deletedOverlay, 0, 0, maskCanvas.width, maskCanvas.height);
        maskCtx.restore();
    }

    // Persistent manual additions are rendered as part of the final selection.
    if (manualAddMask && manualAddMask.length === imageWidth * imageHeight) {
        const manualCanvas = document.createElement("canvas");
        manualCanvas.width = imageWidth;
        manualCanvas.height = imageHeight;
        const mctx = manualCanvas.getContext("2d");
        const mimg = mctx.createImageData(imageWidth, imageHeight);
        for (let i = 0; i < manualAddMask.length; i++) {
            if (manualAddMask[i] && !(deletedMask && deletedMask[i])) {
                mimg.data[i * 4] = 0;
                mimg.data[i * 4 + 1] = 180;
                mimg.data[i * 4 + 2] = 255;
                mimg.data[i * 4 + 3] = 100;
            }
        }
        mctx.putImageData(mimg, 0, 0);
        maskCtx.drawImage(manualCanvas, 0, 0, maskCanvas.width, maskCanvas.height);
    }

}


/* =========================================================
   DRAW CURRENT STROKE
========================================================= */

function redrawInteraction() {

    interactionCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);

    // Completed multi-select sections stay visible until Send to AI.
    if (multiSelectMode) {
        multiSections.forEach((section, index) => {
            drawPath(section, multiSectionColors[index % multiSectionColors.length], true);
        });
    }

    if (!currentStroke.length) return;

    let color = "rgba(30,140,255,.95)";
    if (currentMode === "remove") color = "rgba(255,60,60,.9)";
    if (multiSelectMode && currentMode === "add") {
        color = multiSectionColors[multiSections.length % multiSectionColors.length];
    }

    drawPath(currentStroke, color, false);
}

function drawPath(points, color, closed) {
    if (!points || !points.length) return;

    const ctx = interactionCtx;
    const width = interactionCanvas.width;
    const height = interactionCanvas.height;
    const lineWidth = (multiSelectMode || currentMode === "lasso") ? 3 : Math.max(12, imageWidth / 150);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (points.length === 1) {
        const p = points[0];
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, lineWidth / 2 + 1, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    ctx.beginPath();
    points.forEach((p, i) => {
        const x = p.x * width;
        const y = p.y * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    if (closed) ctx.closePath();
    ctx.stroke();

    // Strong endpoint marker makes the closure target obvious.
    const first = points[0];
    ctx.beginPath();
    ctx.arc(first.x * width, first.y * height, 5, 0, Math.PI * 2);
    ctx.fill();
}


/* =========================================================
   CLEAR
========================================================= */

clearButton.addEventListener("click", async () => {
    if (processing) return;
    await runLocked("Clearing selection...", async () => {
        setProgress(35, "Clearing selection...");
        strokes = [];
        removalPolygons = [];
        currentStroke = [];
        currentMask = null;
        deletedMask = null;
        cachedAlphaMask = null;
        manualAddMask = null;
        selections = [];
        updateSelectionsUI();
        stage.classList.remove("deleted-mode");
        compositeCtx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
        drawing = false;
        pendingStrokes = [];
        multiSections = [];
        setMode("add");
        sendAiButton.disabled = true;
        addSelectionButton.disabled = true;
        clearCanvases();
        exitLayersMode();
        setProgress(100, "Selection cleared.");
        setStatus(imageLoaded ? "Ready" : "No image");
        hint.textContent = imageLoaded ? "Click the object you want to select" : "Load an image";
    });
});

/* =========================================================
   DOWNLOAD SELECTED OBJECT
========================================================= */

/* =========================================================
   TIGHT ALPHA BOUNDS / EXTRACTION
   A selection/object is stored as a full-image alpha mask because that
   makes segmentation and coordinate math simple. Whenever it becomes
   an independent exported layer, however, its canvas must be reduced to
   the exact non-transparent bounds. This keeps the visual shape intact
   while removing the old full-image transparent area.
========================================================= */

function getAlphaBounds(alpha, width = imageWidth, height = imageHeight) {
    if (!alpha || alpha.length !== width * height) return null;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            if (alpha[row + x] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < minX || maxY < minY) return null;

    return {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
    };
}

function renderTightLayerCanvas(alpha) {
    const bounds = getAlphaBounds(alpha);
    if (!bounds) return null;

    const c = document.createElement('canvas');
    c.width = bounds.width;
    c.height = bounds.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });

    // Draw only the source pixels belonging to the tight bounds.
    ctx.drawImage(
        image,
        bounds.x, bounds.y, bounds.width, bounds.height,
        0, 0, bounds.width, bounds.height
    );

    const pixels = ctx.getImageData(0, 0, bounds.width, bounds.height);
    for (let y = 0; y < bounds.height; y++) {
        for (let x = 0; x < bounds.width; x++) {
            const sourceIndex = (bounds.y + y) * imageWidth + (bounds.x + x);
            const px = (y * bounds.width + x) * 4;
            if (!alpha[sourceIndex]) pixels.data[px + 3] = 0;
        }
    }
    ctx.putImageData(pixels, 0, 0);

    return { canvas: c, ctx, bounds };
}

function renderTightLeftoverCanvas(combinedAlpha) {
    // The leftover/background is intentionally kept at full image size;
    // only independent foreground objects are tight-cropped.
    return renderLeftoverCanvas(combinedAlpha);
}

function applyShapeHighlight(layer) {
    const c = layer.canvas;
    const ctx = layer.ctx;
    const w = c.width;
    const h = c.height;
    const pixels = ctx.getImageData(0, 0, w, h);
    const src = pixels.data;
    const original = new Uint8ClampedArray(src);

    // Tint only the real object pixels.
    for (let i = 0; i < src.length; i += 4) {
        if (original[i + 3] > 0) {
            const a = 0.34;
            src[i] = Math.round(original[i] * (1 - a) + 255 * a);
            src[i + 1] = Math.round(original[i + 1] * (1 - a) + 60 * a);
            src[i + 2] = Math.round(original[i + 2] * (1 - a) + 60 * a);
        }
    }

    // Add an outline from the actual alpha silhouette, not the rectangular
    // canvas bounds. A pixel is an edge pixel when any 4/8-neighbour is
    // transparent or outside the canvas.
    const isOpaque = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return false;
        return original[(y * w + x) * 4 + 3] > 8;
    };

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!isOpaque(x, y)) continue;
            let edge = false;
            for (let oy = -1; oy <= 1 && !edge; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    if (ox === 0 && oy === 0) continue;
                    if (!isOpaque(x + ox, y + oy)) { edge = true; break; }
                }
            }
            if (edge) {
                const i = (y * w + x) * 4;
                src[i] = 255;
                src[i + 1] = 35;
                src[i + 2] = 35;
                src[i + 3] = 255;
            }
        }
    }

    ctx.putImageData(pixels, 0, 0);
}

function renderLayersEditorComposite() {
    if (!imageLoaded || !imageWidth || !imageHeight || !layerCanvasElements.length) return null;
    const out = document.createElement("canvas");
    out.width = imageWidth;
    out.height = imageHeight;
    const ctx = out.getContext("2d");

    // Base = full leftover image. It remains present even when every split
    // foreground object is transparent outside its own component.
    const background = layerCanvasElements.find(layer => layer.isBackground);
    if (background?.canvas && background.canvas.dataset.deleted !== "true") {
        ctx.drawImage(background.canvas, 0, 0, imageWidth, imageHeight);
    }

    // Draw each foreground resource independently. Each resource owns a full
    // source-sized export canvas; its current drag offset is applied here.
    for (const layer of layerCanvasElements) {
        if (layer.isBackground || !layer.canvas || layer.canvas.dataset.deleted === "true") continue;
        const source = layer.exportCanvas || layer.canvas;
        const offset = getLayerImageOffset(layer);
        if (source.width === imageWidth && source.height === imageHeight) {
            ctx.drawImage(source, offset.x, offset.y, imageWidth, imageHeight);
        } else {
            ctx.drawImage(source, (layer.originX || 0) + offset.x, (layer.originY || 0) + offset.y);
        }
    }
    return out;
}

async function exportSelection() {
    if (!imageLoaded) return;

    const format = exportFormat.value;
    const quality = Number(exportQuality.value);
    const mime = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    const extension = format === "jpeg" ? "jpg" : format;

    // Layers Mode exports the complete editor canvas, including leftover and
    // every still-visible independently movable split resource.
    if (stage.classList.contains("layers-mode")) {
        let output = renderLayersEditorComposite();
        if (!output) return;
        if (format === "jpeg") {
            const jpeg = document.createElement("canvas");
            jpeg.width = imageWidth; jpeg.height = imageHeight;
            const jctx = jpeg.getContext("2d");
            jctx.fillStyle = "#fff";
            jctx.fillRect(0, 0, imageWidth, imageHeight);
            jctx.drawImage(output, 0, 0);
            output = jpeg;
        }
        const blob = await new Promise(resolve => output.toBlob(resolve, mime, quality));
        if (!blob) throw new Error("Browser could not encode this image format.");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `edited-image.${extension}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
    }

    let output;

    if (deletedMask) {
        renderComposite();
        const full = document.createElement("canvas");
        full.width = imageWidth;
        full.height = imageHeight;
        const fctx = full.getContext("2d");
        if (format === "jpeg") {
            fctx.fillStyle = "#fff";
            fctx.fillRect(0, 0, imageWidth, imageHeight);
        }
        fctx.drawImage(compositeCanvas, 0, 0);

        // Tight-crop the remaining visible pixels too.
        const fullPixels = fctx.getImageData(0, 0, imageWidth, imageHeight).data;
        const remainingAlpha = new Uint8ClampedArray(imageWidth * imageHeight);
        for (let i = 0; i < remainingAlpha.length; i++) remainingAlpha[i] = fullPixels[i * 4 + 3] > 0 ? 255 : 0;
        const bounds = getAlphaBounds(remainingAlpha);
        if (!bounds) return;
        output = document.createElement("canvas");
        output.width = bounds.width;
        output.height = bounds.height;
        const octx = output.getContext("2d");
        if (format === "jpeg") {
            octx.fillStyle = "#fff";
            octx.fillRect(0, 0, bounds.width, bounds.height);
        }
        octx.drawImage(full, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    } else {
        if (!currentMask) return;
        const alpha = cachedAlphaMask || computeImageAlphaMask();
        const tight = renderTightLayerCanvas(alpha);
        if (!tight) return;
        output = tight.canvas;
        if (format === "jpeg") {
            const jpegCanvas = document.createElement("canvas");
            jpegCanvas.width = output.width;
            jpegCanvas.height = output.height;
            const jctx = jpegCanvas.getContext("2d");
            jctx.fillStyle = "#fff";
            jctx.fillRect(0, 0, output.width, output.height);
            jctx.drawImage(output, 0, 0);
            output = jpegCanvas;
        }
    }

    const blob = await new Promise(resolve => output.toBlob(resolve, mime, quality));
    if (!blob) throw new Error("Browser could not encode this image format.");

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${deletedMask ? "remaining-image" : "selected-object"}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}


downloadButton.addEventListener("click", async () => {
    if (processing || !currentMask) return;
    await runLocked("Exporting image...", async () => {
        setProgress(30, "Preparing image...");
        await new Promise(requestAnimationFrame);
        setProgress(65, "Encoding image...");
        await exportSelection();
        setProgress(100, `Exported ${exportFormat.value.toUpperCase()}`);
    });
});

function performDeleteObject() {
    // In layers mode, delete the independently materialized resource that
    // the user actually clicked. Do not mutate the original composite mask.
    if (stage.classList.contains("layers-mode") && activeDeleteLayerIndex >= 0) {
        const layer = layerCanvasElements[activeDeleteLayerIndex];
        if (!layer || !layer.canvas) return;

        const pixels = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i + 3] = 0;
        layer.ctx.putImageData(pixels, 0, 0);
        layer.alpha = new Uint8ClampedArray(layer.canvas.width * layer.canvas.height);
        layer.canvas.dataset.deleted = "true";
        activeDeleteLayerIndex = -1;
        setStatus("Split image deleted");
        hint.textContent = "Selected split image was deleted. The other split image remains independent.";
        clearLayerHighlights();
        return;
    }

    const len = imageWidth * imageHeight;
    if (!deletedMask || deletedMask.length !== len) deletedMask = new Uint8Array(len);
    let count = 0;
    for (let i = 0; i < len; i++) {
        if (cachedAlphaMask[i]) { deletedMask[i] = 1; count++; }
    }
    stage.classList.add("deleted-mode");
    renderComposite();
    drawMask();
    setStatus("Object deleted");
    hint.textContent = "Object removed. You can export, split layers, or select another object.";
}


function highlightLayersForDelete() {
    // Every split resource is independently selectable. The highlight is
    // generated from that resource's own alpha data; never from the source
    // composite or its rectangular canvas bounds.
    layerCanvasElements.forEach(layer => {
        if (!layer.resourceId) return;
        applyShapeHighlight(layer);
    });
}


function clearLayerHighlights() {
    // Restore the exact pixels that existed before highlighting.
    // Do NOT rebuild the split: rebuilding would recreate/collapse resources
    // and would also reset any independent layer movement.
    if (!stage.classList.contains("layers-mode")) return;
    layerCanvasElements.forEach(layer => {
        if (!layer.originalImageData || !layer.ctx) return;
        if (layer.originalImageData.width !== layer.canvas.width || layer.originalImageData.height !== layer.canvas.height) return;
        layer.ctx.putImageData(layer.originalImageData, 0, 0);
        layer.alpha = getCanvasAlpha(layer.canvas);
    });
}

deleteObjectButton.addEventListener("click", () => {
    if (processing || (!currentMask && selections.length === 0)) return;
    if (!stage.classList.contains("layers-mode")) {
        // Outside layers mode: show modal immediately
        if (deleteConfirmModal) deleteConfirmModal.classList.add("visible");
        return;
    }
    // In layers mode: enter delete-highlight mode
    deleteHighlightMode = !deleteHighlightMode;
    activeDeleteLayerIndex = -1;
    deleteObjectButton.classList.toggle("active", deleteHighlightMode);
    if (deleteHighlightMode) {
        highlightLayersForDelete();
        layerCanvasElements.forEach(layer => {
        });
        hint.textContent = "Click the highlighted object to delete it, or click Delete Object again to cancel";
    } else {
        clearLayerHighlights();
        layerCanvasElements.forEach(layer => {
        });
        hint.textContent = "Drag any layer to move it";
    }
});

deleteConfirmCancel?.addEventListener("click", () => {
    deleteConfirmModal.classList.remove("visible");
    deleteHighlightMode = false;
    activeDeleteLayerIndex = -1;
    deleteObjectButton.classList.remove("active");
    clearLayerHighlights();
    hint.textContent = "Drag any layer to move it";
});

deleteConfirmProceed?.addEventListener("click", () => {
    deleteConfirmModal.classList.remove("visible");
    deleteHighlightMode = false;
    deleteObjectButton.classList.remove("active");
    performDeleteObject();
});

deleteConfirmModal?.addEventListener("click", e => {
    if (e.target === deleteConfirmModal) {
        deleteConfirmModal.classList.remove("visible");
        deleteHighlightMode = false;
        deleteObjectButton.classList.remove("active");
        clearLayerHighlights();
            hint.textContent = "Drag any layer to move it";
    }
});

exportFormat.addEventListener("change", () => { if (!processing) setStatus(`Export format: ${exportFormat.value.toUpperCase()}`); });
exportQuality.addEventListener("change", () => { if (!processing) setStatus(`Export quality: ${Math.round(Number(exportQuality.value) * 100)}%`); });/* =========================================================
   LAYERS MODE
   Splits the image into N+1 entities:
     - N foreground layers: each selected object, cut out with exact
       alpha shape, independently draggable
     - 1 background: everything else, with transparent holes where
       ALL selected objects were
   Each selection stored in selections[] is its own independent
   object — exact pixel shape, no bounding box.
========================================================= */

// Dynamic layer drag state is declared at the top of the file
// layerCanvasElements = [{ canvas, ctx, offsetX, offsetY, alpha, color }, ...]


function rasterizeNormalizedPolygonToAlpha(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return null;
    const c = document.createElement("canvas");
    c.width = imageWidth;
    c.height = imageHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, imageWidth, imageHeight);
    ctx.beginPath();
    polygon.forEach((p, i) => {
        const x = Math.max(0, Math.min(imageWidth - 1, p.x * imageWidth));
        const y = Math.max(0, Math.min(imageHeight - 1, p.y * imageHeight));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    const data = ctx.getImageData(0, 0, imageWidth, imageHeight).data;
    const alpha = new Uint8ClampedArray(imageWidth * imageHeight);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    return alpha;
}

function collectSplitAlphaEntries() {
    // ABSOLUTE SOURCE OF TRUTH: each selected-area record owns a unique ID.
    // Split Layers must create one foreground image for every unique ID.
    const records = selectedAreaRegistry.filter(r =>
        r && r.id && r.alpha && r.alpha.length === imageWidth * imageHeight
    );
    if (records.length) {
        return records.map((r, i) => ({
            id: r.id,
            alpha: new Uint8ClampedArray(r.alpha),
            polygon: r.polygon ? r.polygon.map(p => ({ ...p })) : null,
            color: r.color || multiSectionColors[i % multiSectionColors.length],
            kind: r.source === 'multi-selection' ? 'multi-selection' : 'selection',
            source: r.source,
            index: i
        }));
    }
    // Compatibility fallback for pre-registry state.
    if (multiSelectionState.length) {
        return multiSelectionState.map((r, i) => {
            const alpha = r.alpha?.length === imageWidth * imageHeight
                ? new Uint8ClampedArray(r.alpha)
                : rasterizeNormalizedPolygonToAlpha(r.polygon);
            if (!alpha) throw new Error(`Multi Select area ${i + 1} has no valid mask.`);
            const id = r.id || makeSelectedAreaId('multi-selection');
            r.id = id;
            if (!selectedAreaRegistry.some(x => x.id === id)) {
                selectedAreaRegistry.push({ id, source: 'multi-selection', polygon: r.polygon, alpha: new Uint8ClampedArray(alpha), color: r.color });
            }
            return { id, alpha, polygon: r.polygon, color: r.color, kind: 'multi-selection', source: 'multi-selection-state', index: i };
        });
    }
    if (selections.length) {
        return selections.filter(s => s?.alpha?.length === imageWidth * imageHeight).map((s, i) => {
            const id = s.id || makeSelectedAreaId('saved-selection');
            s.id = id;
            if (!selectedAreaRegistry.some(x => x.id === id)) {
                selectedAreaRegistry.push({ id, source: 'saved-selection', polygon: null, alpha: new Uint8ClampedArray(s.alpha), color: s.color });
            }
            return { id, alpha: new Uint8ClampedArray(s.alpha), color: s.color, kind: 'selection', source: 'saved-selection', index: i };
        });
    }
    if (currentMask || cachedAlphaMask) {
        const alpha = cachedAlphaMask || computeImageAlphaMask();
        if (alpha?.length === imageWidth * imageHeight) {
            const existing = selectedAreaRegistry.find(r => r.source === 'current-selection');
            const record = existing || registerSelectedArea({ source: 'current-selection', alpha });
            if (record) return [{ id: record.id, alpha: new Uint8ClampedArray(record.alpha), color: null, kind: 'selection', source: 'current-selection', index: 0 }];
        }
    }
    return [];
}

function buildAllLayers() {
    const resources = [];
    const allAlphas = collectSplitAlphaEntries();
    if (allAlphas.length === 0) return;
    // Split contract: explicit Multi Select areas are never unioned into one
    // foreground resource. The leftover is the only intentionally unioned item.
    if (multiSelectionState.length > 0 && allAlphas.length !== multiSelectionState.length) {
        throw new Error(`Split Layers could not materialize all Multi Select areas (${multiSelectionState.length} expected, ${allAlphas.length} found).`);
    }

    // Union is used ONLY for the leftover image. Each foreground alpha remains
    // completely independent and is materialized as its own full-resolution
    // image resource with transparent pixels everywhere outside that object.
    const combinedAlpha = new Uint8ClampedArray(imageWidth * imageHeight);
    for (const entry of allAlphas) {
        for (let i = 0; i < combinedAlpha.length; i++) {
            if (entry.alpha[i]) combinedAlpha[i] = 1;
        }
    }

    const leftover = renderLeftoverCanvas(combinedAlpha);
    resources.push({
        id: `split-leftover-${Date.now()}`,
        type: "leftover",
        canvas: leftover.canvas,
        ctx: leftover.ctx,
        alpha: getCanvasAlpha(leftover.canvas),
        color: null,
        bounds: { x: 0, y: 0, width: imageWidth, height: imageHeight },
        originX: 0,
        originY: 0,
        isBackground: true
    });

    for (let idx = 0; idx < allAlphas.length; idx++) {
        const entry = allAlphas[idx];
        const full = renderLayerCanvas(entry.alpha);
        if (!full) continue;
        const bounds = getAlphaBounds(entry.alpha) || { x: 0, y: 0, width: imageWidth, height: imageHeight };
        resources.push({
            id: entry.id || `split-selection-${idx + 1}-${Date.now()}-${idx}`,
            type: entry.kind || "selection",
            canvas: full.canvas,
            ctx: full.ctx,
            alpha: getCanvasAlpha(full.canvas),
            sourceAlpha: new Uint8ClampedArray(entry.alpha),
            color: entry.color,
            bounds,
            originX: 0,
            originY: 0,
            isBackground: false,
            independentResource: true
        });
    }

    return {
        bgCanvas: leftover.canvas,
        bgCtx: leftover.ctx,
        fgLayers: resources.filter(r => !r.isBackground),
        resources
    };
}

function getCanvasAlpha(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    return alpha;
}


function resetLayerPosition() {
    layerCanvasElements.forEach(layer => {
        layer.offsetX = 0;
        layer.offsetY = 0;
        layer.canvas.style.transform = "translate(0px, 0px)";
    });
}


function destroyLayerCanvases() {
    layerCanvasElements.forEach(layer => {
        if (layer.canvas.parentNode) layer.canvas.parentNode.removeChild(layer.canvas);
    });
    layerCanvasElements = [];
    layerDragActive = false;
    layerDragIdx = -1;
}


// Helper: style a layer canvas for display inside #stage
function styleLayerCanvas(canvas, zIndex, bounds = null) {
    canvas.classList.add("layer-canvas");
    canvas.style.position = "absolute";
    canvas.style.left = bounds ? `${(bounds.x / imageWidth) * 100}%` : "0";
    canvas.style.top = bounds ? `${(bounds.y / imageHeight) * 100}%` : "0";
    canvas.style.width = bounds ? `${(bounds.width / imageWidth) * 100}%` : "100%";
    canvas.style.height = bounds ? `${(bounds.height / imageHeight) * 100}%` : "100%";
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
    canvas.style.zIndex = String(zIndex);
    canvas.style.cursor = "grab";
    canvas.style.display = "block";
}


async function persistSplitResourcesInternal(resources) {
    // Editor-internal temporary binary store. The logical resource namespace
    // mirrors /resources/workloads/images/; IndexedDB holds the actual Blob
    // bytes so Split Layers never initiates browser downloads.
    const logicalRoot = '/resources/workloads/images/';
    if (!window.indexedDB) return { logicalRoot, persisted: false };
    try {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('mwandtool-resources', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('images', { keyPath: 'id' });
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        for (const r of resources) {
            const blob = await canvasToBlob(r.canvas);
            store.put({ id: r.id, path: `${logicalRoot}${r.id}.png`, blob, width: imageWidth, height: imageHeight, type: r.type || 'selection', createdAt: Date.now() });
            r.resourcePath = `${logicalRoot}${r.id}.png`;
        }
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
        db.close();
        return { logicalRoot, persisted: true };
    } catch (e) {
        console.warn('Internal split resource persistence unavailable:', e);
        return { logicalRoot, persisted: false };
    }
}

async function enterLayersMode() {
    const hasSelections = selections.length > 0;
    const hasMultiSelections = multiSelectionState.length > 0;
    const hasCurrent = currentMask || cachedAlphaMask;
    if (!hasSelections && !hasCurrent && !hasMultiSelections) return;
    if (!imageLoaded || processing || stage.classList.contains("layers-mode")) return;

    await runLocked("Splitting layers...", async () => {
        setProgress(25, "Preparing layers...");
        const imageRect = image.getBoundingClientRect();
        const displayWidth = imageRect.width || stage.clientWidth || imageWidth;
        const displayHeight = imageRect.height || stage.clientHeight || imageHeight;

        setProgress(40, "Building layer canvases...");
        const result = buildAllLayers();
        if (!result) return;

        // Remove any existing layer canvases
        destroyLayerCanvases();

        // Add background canvas first (lowest z-index)
        styleLayerCanvas(result.bgCanvas, 1);
        stage.appendChild(result.bgCanvas);
        const bgResource = result.resources.find(r => r.isBackground);
        layerCanvasElements.push({
            canvas: result.bgCanvas,
            ctx: result.bgCtx,
            offsetX: 0,
            offsetY: 0,
            originX: 0,
            originY: 0,
            bounds: bgResource.bounds,
            alpha: bgResource.alpha,
            originalImageData: bgResource.ctx.getImageData(0, 0, imageWidth, imageHeight),
            resourceId: bgResource.id,
            resourceType: bgResource.type,
            isBackground: true
        });

        // Add foreground canvases as TIGHT DISPLAY OBJECTS.
        // The saved/exported split resource remains full source-image size,
        // but the interactive layer must occupy only its own real bounds.
        // This makes each multi-select component independently draggable,
        // independently hittable, and independent of every other component.
        for (let i = 0; i < result.fgLayers.length; i++) {
            const fg = result.fgLayers[i];
            const tight = renderTightLayerCanvas(fg.sourceAlpha || fg.alpha);
            if (!tight) continue;
            styleLayerCanvas(tight.canvas, 10 + i, tight.bounds);
            stage.appendChild(tight.canvas);
            layerCanvasElements.push({
                canvas: tight.canvas,
                ctx: tight.ctx,
                offsetX: 0,
                offsetY: 0,
                originX: tight.bounds.x,
                originY: tight.bounds.y,
                bounds: tight.bounds,
                alpha: getCanvasAlpha(tight.canvas),
                originalImageData: tight.ctx.getImageData(0, 0, tight.canvas.width, tight.canvas.height),
                sourceAlpha: fg.sourceAlpha,
                sourceCanvasWidth: imageWidth,
                sourceCanvasHeight: imageHeight,
                color: fg.color,
                resourceId: fg.id,
                resourceType: fg.type,
                isBackground: false,
                exportCanvas: fg.canvas
            });
        }

        // Attach pointer listeners to the topmost canvas
        // (it captures all events; we hit-test to find which layer)
        attachLayerPointerListeners(stage);

        stage.style.width = `${displayWidth}px`;
        stage.style.height = `${displayHeight}px`;
        stage.classList.add("layers-mode");
        layersButton.disabled = true;
        deleteHighlightMode = false;
        deleteObjectButton.disabled = false;
        downloadButton.disabled = false;
        exportFormat.disabled = false;
        exportQuality.disabled = false;
        resetLayerPositionButton.disabled = false;
        resetLayerPositionButton.style.display = "";
        exitLayersButton.disabled = false;
        exitLayersButton.style.display = "";
        // Split Layers is an editor-only operation. Keep all split resources
        // in memory for further editing. Explicit Export is the only action
        // that creates a downloadable file.
        activeSplitResources = result.resources;
        setProgress(92, "Saving temporary split resources...");
        const workspace = await persistSplitResourcesInternal(activeSplitResources);
        activeSplitResources.forEach(r => { r.editorOwned = true; r.workspacePath = workspace.logicalRoot; });
        setProgress(100, "Layers split into independent editor resources.");
        setStatus(`${activeSplitResources.length} independent images created (${selectedAreaRegistry.length} selected areas + 1 leftover)`);
        hint.textContent = `${activeSplitResources.length} independent images ready. Each selected area is its own layer.`;
    });
}


function exitLayersMode() {
    destroyLayerCanvases();
    activeSplitResources = [];
    detachLayerPointerListeners();
    stage.classList.remove("layers-mode");
    deleteHighlightMode = false;
    deleteObjectButton.disabled = true;
    resetLayerPositionButton.disabled = true;
    resetLayerPositionButton.style.display = "none";
    exitLayersButton.disabled = true;
    exitLayersButton.style.display = "none";
    stage.style.width = "";
    stage.style.height = "";
    if (imageLoaded && (currentMask || selections.length > 0 || multiSelectionState.length > 0) && !processing) layersButton.disabled = false;
}


layersButton.addEventListener("click", enterLayersMode);
exitLayersButton.addEventListener("click", exitLayersMode);
resetLayerPositionButton.addEventListener("click", resetLayerPosition);


/*
   Dynamic pointer listeners for layer dragging.
   We attach to one canvas element and use hit-testing to determine
   which layer (fg or bg) the user clicked on based on alpha pixel data.
*/

let attachedLayerElement = null;

function attachLayerPointerListeners(el) {
    detachLayerPointerListeners();
    // Listen on the entire stage, not the topmost foreground canvas.
    // Tight-cropped foreground canvases do not cover the leftover/background
    // area, so attaching only to a foreground canvas makes the leftover
    // impossible to click/select outside that canvas rectangle.
    attachedLayerElement = el;
    el.addEventListener("pointerdown", onLayerPointerDown);
    el.addEventListener("pointermove", onLayerPointerMove);
    el.addEventListener("pointerup", endLayerDrag);
    el.addEventListener("pointercancel", endLayerDrag);
    el.addEventListener("dblclick", e => { e.preventDefault(); e.stopPropagation(); });
}

function detachLayerPointerListeners() {
    if (!attachedLayerElement) return;
    attachedLayerElement.removeEventListener("pointerdown", onLayerPointerDown);
    attachedLayerElement.removeEventListener("pointermove", onLayerPointerMove);
    attachedLayerElement.removeEventListener("pointerup", endLayerDrag);
    attachedLayerElement.removeEventListener("pointercancel", endLayerDrag);
    attachedLayerElement = null;
}


function hitTestLayers(clientX, clientY) {
    // Each foreground layer has its OWN tight display canvas.
    // Test that local canvas directly, so one split component cannot
    // swallow another component merely because they share the source image size.
    for (let i = layerCanvasElements.length - 1; i >= 0; i--) {
        const layer = layerCanvasElements[i];
        const rect = layer.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const x = Math.floor((clientX - rect.left) * layer.canvas.width / rect.width);
        const y = Math.floor((clientY - rect.top) * layer.canvas.height / rect.height);
        if (x < 0 || y < 0 || x >= layer.canvas.width || y >= layer.canvas.height) continue;
        const px = layer.ctx.getImageData(x, y, 1, 1).data;
        if (px[3] >= 10) return i;
    }
    return -1;
}


function onLayerPointerDown(event) {
    if (processing || !stage.classList.contains("layers-mode")) return;

    // If in delete-highlight mode, clicking any opaque layer triggers delete modal
    if (deleteHighlightMode) {
        const idx = hitTestLayers(event.clientX, event.clientY);
        if (idx >= 0 && layerCanvasElements[idx].resourceId) {
            activeDeleteLayerIndex = idx;
            if (deleteConfirmModal) deleteConfirmModal.classList.add("visible");
            return;
        }
    }

    const hitIdx = hitTestLayers(event.clientX, event.clientY);
    const idx = hitIdx >= 0 ? hitIdx : 0; // clicked empty area → drag background

    layerDragActive = true;
    layerDragIdx = idx;
    layerDragStartX = event.clientX;
    layerDragStartY = event.clientY;
    layerDragOriginX = layerCanvasElements[idx].offsetX;
    layerDragOriginY = layerCanvasElements[idx].offsetY;
    layerCanvasElements[idx].canvas.classList.add("dragging");

    // Bring dragged layer to top
    layerCanvasElements[idx].canvas.style.zIndex = String(100 + layerCanvasElements.length);

    try { attachedLayerElement.setPointerCapture(event.pointerId); } catch (_) {}
}


function onLayerPointerMove(event) {
    if (!layerDragActive || layerDragIdx < 0) return;

    const dx = event.clientX - layerDragStartX;
    const dy = event.clientY - layerDragStartY;
    const layer = layerCanvasElements[layerDragIdx];
    layer.offsetX = layerDragOriginX + dx;
    layer.offsetY = layerDragOriginY + dy;
    layer.canvas.style.transform = `translate(${layer.offsetX}px, ${layer.offsetY}px)`;
}


function endLayerDrag(event) {
    if (!layerDragActive) return;
    layerDragActive = false;
    if (layerDragIdx >= 0 && layerCanvasElements[layerDragIdx]) {
        layerCanvasElements[layerDragIdx].canvas.classList.remove("dragging");
    }
    layerDragIdx = -1;
    try { if (attachedLayerElement) attachedLayerElement.releasePointerCapture(event.pointerId); } catch (_) {}
}


/*
   FILE SAVING — Split selections into actual PNG files on disk.
   Uses the File System Access API (showDirectoryPicker) to write
   files to a user-chosen temporary directory. Files are named:
     selection-1.png, selection-2.png, ... (each selected object)
     leftover.png (everything NOT selected)
   Each file follows the EXACT alpha shape — transparent background
   where the object was not selected.
   Files are auto-deleted when the browser closes.
*/

let tempDirHandle = null;  // FileSystemDirectoryHandle for the temp folder
let savedFileHandles = []; // FileSystemFileHandle[] for cleanup

/**
 * requestTempDir()
 * Asks the user to pick a directory via the File System Access API.
 * Returns the directory handle, or null if the API is unsupported
 * or the user cancelled.
 */
async function requestTempDir() {
    if (!('showDirectoryPicker' in window)) {
        // Fallback: multiple downloads (no folder control)
        return null;
    }
    try {
        return await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (e) {
        // User cancelled or permission denied
        return null;
    }
}

/**
 * canvasToBlob(canvas)
 * Converts a canvas to a PNG Blob.
 */
function canvasToBlob(canvas) {
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

/**
 * cleanupTempFiles()
 * Best-effort: delete all files we previously wrote to the temp directory.
 * Called on beforeunload. Async in beforeunload is unreliable,
 * so this is best-effort only.
 */
function cleanupTempFiles() {
    if (!tempDirHandle || savedFileHandles.length === 0) return;
    for (const fh of savedFileHandles) {
        try { fh.remove(); } catch (_) {}
    }
    savedFileHandles = [];
}

/**
 * renderLayerCanvas(alpha)
 * Creates an INDEPENDENT FULL-IMAGE resource for one split component:
 *   - Same width/height as the source image
 *   - Original pixels are preserved only where alpha selects the component
 *   - Everything else is transparent
 * This full coordinate system is intentional: each split resource can move
 * independently while the actual object is still defined by its alpha shape.
 */
function renderLayerCanvas(alpha) {
    const c = document.createElement('canvas');
    c.width = imageWidth;
    c.height = imageHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
    const pixels = ctx.getImageData(0, 0, imageWidth, imageHeight);
    for (let i = 0; i < alpha.length; i++) {
        if (!alpha[i]) pixels.data[i * 4 + 3] = 0;
    }
    ctx.putImageData(pixels, 0, 0);
    return { canvas: c, ctx };
}

/**
 * renderLeftoverCanvas(combinedAlpha)
 * Creates the leftover layer: original image with ALL selected regions
 * punched out (transparent).
 */
function renderLeftoverCanvas(combinedAlpha) {
    const c = document.createElement('canvas');
    c.width = imageWidth;
    c.height = imageHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
    const pixels = ctx.getImageData(0, 0, imageWidth, imageHeight);
    for (let i = 0; i < combinedAlpha.length; i++) {
        if (combinedAlpha[i]) pixels.data[i * 4 + 3] = 0;
    }
    ctx.putImageData(pixels, 0, 0);
    return { canvas: c, ctx };
}

/**
 * writeLayerToDisk(dirHandle, name, canvas)
 * Writes a canvas as a PNG file to the given directory.
 * Returns the FileSystemFileHandle for cleanup.
 */
async function writeLayerToDisk(dirHandle, name, canvas) {
    const blob = await canvasToBlob(canvas);
    const fileHandle = await dirHandle.getFileHandle(name + '.png', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return fileHandle;
}

/**
 * splitToFiles()
 * The main function: splits the current selections into N+1 PNG files
 * and writes them to the temp directory. Each file follows the exact
 * alpha shape of its selection (not a bounding box).
 *
 * Flow:
 *   1. Collect all selection alphas + current mask
 *   2. For each selection: render to canvas → write PNG file
 *   3. Render leftover (union of all alphas punched out) → write PNG
 *   4. Show results and keep canvas layers for drag preview
 */
function getLayerImageOffset(layer) {
    if (!layer || layer.isBackground) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return {
        x: rect.width ? (layer.offsetX || 0) * (imageWidth / rect.width) : 0,
        y: rect.height ? (layer.offsetY || 0) * (imageHeight / rect.height) : 0
    };
}

function renderCurrentLayerExport(layer) {
    // Every exported split is a complete source-sized image. A foreground
    // layer contains only its own component pixels; the unused area is alpha.
    // The leftover is also complete source-sized canvas.
    const out = document.createElement("canvas");
    out.width = imageWidth;
    out.height = imageHeight;
    const ctx = out.getContext("2d");

    if (layer.isBackground) {
        ctx.drawImage(layer.canvas, 0, 0, imageWidth, imageHeight);
        return out;
    }

    const exportCanvas = layer.exportCanvas || layer.canvas;
    const move = getLayerImageOffset(layer);

    if (exportCanvas.width === imageWidth && exportCanvas.height === imageHeight) {
        // Full source resource: movement is applied to the whole resource.
        ctx.drawImage(exportCanvas, move.x, move.y);
    } else {
        const ox = Number(layer.originX || 0);
        const oy = Number(layer.originY || 0);
        ctx.drawImage(exportCanvas, ox + move.x, oy + move.y);
    }
    return out;
}

async function splitToFiles() {
    const entries = collectSplitAlphaEntries();
    if (entries.length === 0) return { filesWritten: 0, supportsFileAPI: false };

    const timestamp = Date.now();
    const splitCount = entries.length;
    let filesWritten = 0;

    const layersForExport = layerCanvasElements.length
        ? layerCanvasElements
        : (() => {
            const combined = new Uint8ClampedArray(imageWidth * imageHeight);
            const list = [];
            for (const entry of entries) {
                const full = renderLayerCanvas(entry.alpha);
                list.push({
                    canvas: full.canvas, ctx: full.ctx, offsetX: 0, offsetY: 0,
                    originX: 0, originY: 0, bounds: getAlphaBounds(entry.alpha),
                    alpha: entry.alpha, resourceId: entry.id, resourceType: entry.kind,
                    isBackground: false, sourceAlpha: entry.alpha, exportCanvas: full.canvas
                });
                for (let i = 0; i < combined.length; i++) if (entry.alpha[i]) combined[i] = 255;
            }
            const bg = renderLeftoverCanvas(combined);
            list.unshift({
                canvas: bg.canvas, ctx: bg.ctx, offsetX: 0, offsetY: 0, originX: 0, originY: 0,
                bounds: { x: 0, y: 0, width: imageWidth, height: imageHeight },
                alpha: getCanvasAlpha(bg.canvas), resourceId: `split-leftover-${timestamp}`,
                resourceType: 'leftover', isBackground: true
            });
            return list;
        })();

    // Force exactly N foreground files + 1 leftover whenever Multi Select
    // supplied N completed areas. Never let a combined currentMask decide the
    // count.
    let ordered = layersForExport.filter(l => l && l.resourceId);
    const bg = ordered.find(l => l.isBackground);
    const fgs = ordered.filter(l => !l.isBackground);
    if (!bg) {
        const combined = new Uint8ClampedArray(imageWidth * imageHeight);
        for (const entry of entries) for (let i = 0; i < combined.length; i++) if (entry.alpha[i]) combined[i] = 255;
        const left = renderLeftoverCanvas(combined);
        ordered = [{ canvas: left.canvas, ctx: left.ctx, offsetX: 0, offsetY: 0, originX: 0, originY: 0,
            bounds: {x:0,y:0,width:imageWidth,height:imageHeight}, alpha:getCanvasAlpha(left.canvas),
            resourceId:`split-leftover-${timestamp}`, resourceType:'leftover', isBackground:true }, ...fgs];
    } else {
        ordered = [bg, ...fgs];
    }

    if (selectedAreaRegistry.length > 0) {
        const expectedForeground = selectedAreaRegistry.length;
        if (fgs.length !== expectedForeground) {
            throw new Error(`Split Layers expected ${expectedForeground} foreground layers but found ${fgs.length}.`);
        }
    }

    const locallyDownload = (canvas, filename) => {
        canvas.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        }, 'image/png');
    };

    const manifestResources = [];
    for (let idx = 0; idx < ordered.length; idx++) {
        const layer = ordered[idx];
        const filename = layer.isBackground
            ? `leftover_${timestamp}.png`
            : `selection-${idx}_${timestamp}.png`;
        const output = renderCurrentLayerExport(layer);

        // The local download is mandatory. Server persistence is optional and
        // must never prevent the leftover or another split layer from being
        // exported.
        locallyDownload(output, filename);
        filesWritten++;

        try {
            const blob = await canvasToBlob(output);
            if (blob) {
                const resp = await fetch(`/api/save-layer?name=${encodeURIComponent(filename)}`, {
                    method: 'POST', body: blob, headers: { 'Content-Type': 'image/png' }
                });
                if (!resp.ok) console.warn(`Server save skipped for ${filename}: HTTP ${resp.status}`);
            }
        } catch (e) {
            console.warn(`Server save unavailable for ${filename}; local export already completed.`, e);
        }

        manifestResources.push({
            id: layer.resourceId,
            type: layer.resourceType || (layer.isBackground ? 'leftover' : 'selection'),
            file: filename,
            canvas: { width: imageWidth, height: imageHeight },
            bounds: layer.bounds || { x:0,y:0,width:imageWidth,height:imageHeight },
            position: { x: layer.originX || 0, y: layer.originY || 0, offsetX: layer.offsetX || 0, offsetY: layer.offsetY || 0 },
            coordinateSystem: 'source-image'
        });
        setProgress(Math.round((filesWritten / ordered.length) * 100), `Saved ${filename} (${filesWritten}/${ordered.length})`);
        await new Promise(r => setTimeout(r, 40));
    }

    try {
        const manifest = { version: 3, sourceWidth: imageWidth, sourceHeight: imageHeight, resources: manifestResources };
        const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
        const resp = await fetch(`/api/save-layer?name=${encodeURIComponent(`split-manifest_${timestamp}.json`)}`, {
            method: 'POST', body: manifestBlob, headers: { 'Content-Type': 'application/json' }
        });
        if (!resp.ok) console.warn('Server manifest save unavailable');
    } catch (e) {
        console.warn('Server manifest save unavailable; PNG exports remain valid.', e);
    }

    return { filesWritten, supportsFileAPI: false, manifestResources };
}

/**
 * downloadCanvas(canvas, filename)
 * Triggers a browser download for a canvas as PNG.
 */
function downloadCanvas(canvas, filename) {
    canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
}

/*
   Temp storage lifecycle:
   - selections[] is purely in-memory
   - savedFileHandles are cleaned up on browser close (best-effort)
*/
window.addEventListener('beforeunload', () => {
    cleanupTempFiles();
    selections = [];
    destroyLayerCanvases();
});
