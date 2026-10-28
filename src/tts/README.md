# src/tts/

Text-to-speech layer with two swappable backends.

---

## `speaker.py`

### `Speaker` class

Instantiated once at pipeline startup. The backend is selected by the `backend` parameter.

| Backend | Library | Use case |
|---|---|---|
| `"local"` | `pyttsx3` | Offline use, local testing, NAO robot |
| `"cloud"` | `edge-tts` (handled by `app/backend/main.py`) | Production API — `Speaker.speak()` is a no-op; the backend synthesizes directly |

**`speak(gated_results)`** — filters out gated (low-confidence) tokens, assembles remaining tokens into natural speech text, and either calls pyttsx3 synchronously (local) or returns `None` (cloud, where TTS runs in the API layer).

**`repeat_last()`** — replays the last set of gated results. Used in Phase 6 for spacebar-triggered replay.

---

### Token assembly (`assemble_tokens`)

Glued words without spaces are split using `wordninja` before being assembled into a TTS-ready string:

- `"exithere"` → `"exit here"`
- `["PUSH", "DOOR", "HANDLE"]` → `"PUSH DOOR HANDLE"` (single words joined)
- `["EXIT", "PUSH DOOR"]` → `"EXIT. PUSH DOOR"` (phrases separated by `. `)

Short tokens (≤ 3 characters) are treated as acronyms and not split (e.g. `"WC"`, `"OK"`).

This same logic is duplicated in `app/backend/main.py` for the cloud path, where TTS is called asynchronously with `edge-tts`.
