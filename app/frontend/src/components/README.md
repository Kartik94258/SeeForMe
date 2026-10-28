# app/frontend/src/components/

UI components used by the VisionLens frontend.

---

## Component overview

### `Header.jsx`
Top navigation bar. Displays the app name, language toggle (EN / FR), API connection status indicator, and current detection latency.

### `TabBar.jsx`
Tab navigation row with three tabs: **Live Camera**, **Upload Image**, **About**. Highlights the active tab and calls `setTab` on click.

### `CameraTab.jsx`
The main live-scanning interface. Responsibilities:
- Requests camera access via `useCamera`
- Opens and maintains a WebSocket connection via `useWebSocket`
- Captures JPEG frames every 300 ms (gated — pauses while audio is playing or TTS is in progress on the backend)
- Enqueues incoming audio via `useAudioQueue` for sequential playback
- Renders the video feed and an overlay "Tap to Start" screen until the user unlocks audio
- Passes all detection events up via `onDetection`

### `UploadTab.jsx`
Image upload interface. Supports drag-and-drop and file browse. Sends the image to `POST /ocr/image`, then displays the detected text and plays the returned audio via `useAudioPlayer`.

### `DetectionPanel.jsx`
Shared right-hand panel rendered by both `CameraTab` and `UploadTab`. Shows:
- Detected text (or feedback message if nothing was readable)
- Audio playback controls (Replay, Pause, Stop, Clear)
- Scrolling activity log with timestamped entries

### `StatsBar.jsx`
Session-level statistics bar at the bottom of the screen. Shows cumulative spoken/silenced region counts and the rolling average pipeline latency over the last 20 detections.

### `AboutTab.jsx`
Static information card describing the app's purpose, workflow, and technical stack (model names, TTS voice, HuggingFace repo).
