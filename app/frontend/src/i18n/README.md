# app/frontend/src/i18n/

String bundles for English and French localisation. The active language is selected in `App.jsx` based on a `localStorage` key (`"lang"`) so the choice persists across page reloads.

```
i18n/
├── en.js    English strings (default)
└── fr.js    French strings
```

Both files export a single default object with identical keys. `App.jsx` passes the active bundle as the `t` prop to every component — no localisation library is used.

### Adding a new language

1. Copy `en.js` to `<lang>.js` and translate all values.
2. Import the new bundle in `App.jsx` and add it to the language selector logic.
3. Add the language code to the toggle in `Header.jsx`.

### Key namespaces

| Namespace | Contents |
|---|---|
| `appName` / `tagline` | Header branding |
| `tabs` | Tab bar labels |
| `camera` | Live camera panel text (status, overlays, tips) |
| `detection` | Detection panel labels (text area, audio controls, log) |
| `stats` | Stats bar labels |
| `upload` | Upload panel labels |
| `about` | About tab copy |
