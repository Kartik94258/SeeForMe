# app/frontend/

React 18 + Vite web application. Mobile-style interface with three tabs: live camera (WebSocket), image upload (HTTP), and an about page.

---

## Features

- **Live Camera tab** — streams webcam frames over WebSocket, plays detected text as audio in real time
- **Upload tab** — drag-and-drop or browse an image file, runs OCR via HTTP POST
- **Stats bar** — running counts of spoken/silenced regions and rolling average latency
- **i18n** — English and French, persisted in `localStorage`
- **API health polling** — header indicator updates every 10 seconds

---

## Running locally

```bash
npm install
npm run dev          # development server at http://localhost:5173
npm run build        # production build → dist/
npm run preview      # preview production build locally
```

---

## Environment variables

Create `.env` in this directory:

```env
VITE_API_URL=http://localhost:8000
```

If `VITE_API_URL` is not set, the app defaults to the production HuggingFace Spaces URL. The WebSocket URL is derived automatically by replacing `http` with `ws`.

---

## Structure

```
src/
├── App.jsx                 Root component — layout, language state, stats aggregation
├── App.css                 Global styles
├── main.jsx                Vite entry point
├── components/
│   ├── Header.jsx          Title, language toggle, API health indicator
│   ├── TabBar.jsx          Live / Upload / About tab switcher
│   ├── CameraTab.jsx       WebSocket camera feed and audio playback
│   ├── UploadTab.jsx       File upload and HTTP OCR
│   ├── DetectionPanel.jsx  Displays detected text and confidence boxes
│   ├── StatsBar.jsx        Spoken/silenced counts and rolling latency
│   └── AboutTab.jsx        Project description and tech stack
├── hooks/
│   ├── useCamera.js        Camera stream lifecycle and frame capture
│   ├── useWebSocket.js     WebSocket connection and message dispatch
│   ├── useAudioPlayer.js   Single-instance audio player with queue draining
│   └── useAudioQueue.js    Audio buffer queue management
├── i18n/
│   ├── en.js               English strings
│   └── fr.js               French strings
└── constants/
    └── api.js              API endpoint URLs (derived from VITE_API_URL)
```
