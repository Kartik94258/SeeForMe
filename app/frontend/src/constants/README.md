# app/frontend/src/constants/

Centralised constants shared across the frontend.

---

## `api.js`

Defines all API endpoint URLs derived from a single base URL.

```js
const API_BASE = import.meta.env.VITE_API_URL || "https://mocamaradata-visionlens-api.hf.space";
const WS_BASE  = API_BASE.replace(/^http/, "ws");

export const API = {
  health:    `${API_BASE}/health`,
  ocrImage:  `${API_BASE}/ocr/image`,
  ocrStream: `${WS_BASE}/ocr/stream`,
};
```

Set `VITE_API_URL` in `.env` to point at a local backend during development. The WebSocket URL (`ocrStream`) is derived automatically by replacing the `http` scheme with `ws` (or `https` → `wss`).
