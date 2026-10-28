# app/

This directory contains the deployable application layer — the FastAPI backend and the React frontend. The two components communicate over HTTP (image upload) and WebSocket (live camera stream).

```
app/
├── backend/    FastAPI server — OCR pipeline endpoints
└── frontend/   React + Vite UI — camera, upload, audio playback
```

The backend wraps the ML pipeline from [`src/`](../src/) and exposes it as a REST/WebSocket API. The frontend consumes that API and renders the camera feed, detection results, and spoken audio to the user.

See each subfolder's README for setup and usage details.
