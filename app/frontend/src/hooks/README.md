# app/frontend/src/hooks/

Custom React hooks that encapsulate device, network, and audio logic, keeping components focused on rendering.

---

## `useCamera.js`

Manages the browser `getUserMedia` lifecycle.

| Returned value | Type | Description |
|---|---|---|
| `videoRef` | `RefObject` | Attach to `<video>` element |
| `ready` | `boolean` | `true` once the stream is playing |
| `error` | `string \| null` | `"permission_denied"` or `"unavailable"` |
| `captureFrame(quality)` | `function` | Returns a raw base64 JPEG string from the current video frame |

Requests rear-facing camera (`facingMode: "environment"`) at 1280×720 when available. Starts/stops automatically based on the `active` prop.

---

## `useWebSocket.js`

Manages the WebSocket connection to `WS /ocr/stream`.

| Returned value | Type | Description |
|---|---|---|
| `connected` | `boolean` | WebSocket is open |
| `sendFrame(base64)` | `function` | Send a raw base64 frame string to the server |

Auto-reconnects every 2 seconds when the connection drops while `active` is true. Uses a stable ref for the `onMessage` callback so the socket handler always calls the latest version without re-opening the connection on every render.

---

## `useAudioQueue.js`

Sequential audio queue for the live camera tab. Ensures that multiple consecutive detections play in order without overlapping.

| Returned value | Type | Description |
|---|---|---|
| `enqueue(base64)` | `function` | Add a base64 MP3 to the playback queue |
| `stop()` | `function` | Stop playback and clear the queue |
| `pause()` | `function` | Pause the current audio |
| `playing` | `boolean` | `true` while audio is playing |
| `isBusy()` | `function` | Returns `true` if audio is currently playing (used by frame gating) |

---

## `useAudioPlayer.js`

Single-shot audio player for the upload tab. Plays one base64 MP3 at a time with manual controls.

| Returned value | Type | Description |
|---|---|---|
| `play(base64)` | `function` | Decode and play a base64 MP3 |
| `pause()` | `function` | Pause current playback |
| `stop()` | `function` | Stop and reset |
| `replay()` | `function` | Replay the last played audio |
| `playing` | `boolean` | `true` while audio is playing |
