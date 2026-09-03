# MediaPipe AI Coding Reference

This file is the source-of-truth index for AI coding agents working on the MediaPipe-based editor.

## Official MediaPipe repository
- https://github.com/google-ai-edge/mediapipe
- https://github.com/google-ai-edge/mediapipe/archive/refs/heads/master.zip
- https://github.com/google-ai-edge/mediapipe/blob/master/README.md
- https://github.com/google-ai-edge/mediapipe/blob/master/docs/getting_started/install.md
- https://developers.google.com/mediapipe

## Official MediaPipe Web Samples
- https://github.com/google-ai-edge/mediapipe-samples-web
- https://github.com/google-ai-edge/mediapipe-samples-web/archive/refs/heads/main.zip
- https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/README.md
- https://google-ai-edge.github.io/mediapipe-samples-web/

## Official MediaPipe Samples
- https://github.com/google-ai-edge/mediapipe-samples
- https://github.com/google-ai-edge/mediapipe-samples/archive/refs/heads/main.zip
- https://github.com/google-ai-edge/mediapipe-samples/blob/main/README.md

## @mediapipe/tasks-vision
- https://www.npmjs.com/package/@mediapipe/tasks-vision
- https://www.npmjs.com/package/@mediapipe/tasks-vision?activeTab=code
- https://www.npmjs.com/package/@mediapipe/tasks-vision?activeTab=versions
- https://registry.npmjs.org/@mediapipe/tasks-vision
- https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.0.1.tgz

## Interactive Image Segmenter
- https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter
- https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter/web_js
- https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/tasks/web/vision
- https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/index.ts
- https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/tasks/web/vision/interactive_segmenter
- https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md

## Runtime / model reference URLs
- https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm
- https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs
- https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task

## AI CODING INSTRUCTION — MUST FOLLOW

### NETWORK REQUEST FIRST

Before taking ANY coding action involving MediaPipe, the AI MUST first make network requests to the relevant official sources above and inspect the current documentation, source code, and/or TypeScript declarations.

Do NOT rely on model memory for MediaPipe:
- props/properties
- methods
- signatures
- enums
- options
- mask behavior
- ROI/brush inputs
- output types
- WebAssembly behavior
- package exports
- version-specific behavior

### Source-of-truth priority

1. Exact local package/runtime files used by this project.
2. Official source matching the installed/pinned version.
3. Official TypeScript declarations/API definitions.
4. Official Google MediaPipe documentation.
5. Official MediaPipe examples/samples.
6. Other sources only when necessary.

If sources conflict, the exact installed package/source version wins.

If an API or behavior cannot be verified, STOP and say it cannot be verified. NEVER invent a MediaPipe property, method, option, event, enum, or behavior.

Before modifying code, also inspect the existing application architecture and determine whether the requested behavior belongs to MediaPipe inference, canvas/image processing, application state, UI interaction, or export/compositing.

After coding, verify syntax, imports/exports, local asset paths, API names, and the affected interaction path.
