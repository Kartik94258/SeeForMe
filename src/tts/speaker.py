"""
Text-to-speech with two swappable backends:
  - "local"  → pyttsx3  (offline, for local testing and NAO)
  - "cloud"  → edge-tts handled entirely by main.py — speaker is a no-op
"""

from typing import List, Dict, Optional
import re
import wordninja


class Speaker:
    def __init__(self, backend: str = "local", rate: int = 150,
                 volume: float = 1.0, lang: str = "en"):
        self.backend = backend
        self.lang    = lang
        self._last_results: List[Dict] = []

        if backend == "local":
            import pyttsx3
            self._engine = pyttsx3.init()
            self._engine.setProperty("rate",   rate)
            self._engine.setProperty("volume", volume)
        elif backend == "cloud":
            pass
        else:
            raise ValueError(f"Unknown backend '{backend}'. Use 'local' or 'cloud'.")

    def speak(self, gated_results: List[Dict]) -> Optional[bytes]:
        self._last_results = gated_results

        if self.backend == "cloud":
            return None

        spoken = [r for r in gated_results if not r["gated"]]

        if not spoken:
            print("TTS: nothing to speak (all gated)")
            return None

        spoken = [r for r in spoken if re.search(r'[a-zA-Z0-9]', r["text"])]

        if not spoken:
            print("TTS: nothing to speak (punctuation only)")
            return None

        tokens = [r["text"] for r in spoken]
        text   = assemble_tokens(tokens)
        print(f"TTS speaking (local): {text!r}")

        self._engine.say(text)
        self._engine.runAndWait()
        return None

    def repeat_last(self) -> Optional[bytes]:
        if not self._last_results:
            print("TTS: nothing to repeat")
            return None
        return self.speak(self._last_results)


def fix_token(token: str) -> str:
    token = token.strip()
    if not token or " " in token:
        return token
    # Very short = acronym (WC, NYC, OK) — don't split
    if len(token) <= 3:
        return token
    # Try to split — works on both lowercase and uppercase
    parts = wordninja.split(token.lower())
    if len(parts) > 1:
        # Preserve original casing of the full token on each part
        return " ".join(parts)
    return token


def assemble_tokens(tokens: list[str]) -> str:
    """
    Fix and reassemble tokens into natural speech-ready text.

    - Glued words are split: "tobe" → "to be", "exithere" → "exit here"
    - Single words split across boxes are joined as one phrase
    - Multi-word tokens (full phrases) are separated by '. '
    """
    if not tokens:
        return ""

    # Fix each token first
    fixed_tokens = [fix_token(t) for t in tokens]

    segments    = []
    word_buffer = []

    for token in fixed_tokens:
        token = token.strip()
        if not token:
            continue
        if len(token.split()) == 1:
            word_buffer.append(token)
        else:
            if word_buffer:
                segments.append(" ".join(word_buffer))
                word_buffer = []
            segments.append(token)

    if word_buffer:
        segments.append(" ".join(word_buffer))

    return ". ".join(segments)
