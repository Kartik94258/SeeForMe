# app/frontend/src/

React source tree for the VisionLens frontend.

```
src/
├── App.jsx           Root component — renders layout, owns language and stats state
├── App.css           Application-wide CSS (layout, variables, component styles)
├── main.jsx          Vite entry point — mounts <App /> into #root
├── components/       All page-level and panel UI components
├── hooks/            Custom React hooks (camera, WebSocket, audio)
├── i18n/             Localisation string bundles (en, fr)
└── constants/
    └── api.js        Centralised API endpoint definitions
```

**Data flow:** `App.jsx` owns top-level state (language, active tab, session stats). Each tab component (`CameraTab`, `UploadTab`) calls `onDetection(result)` whenever the backend returns a detection, which bubbles stats up to `App` and `StatsBar`.
