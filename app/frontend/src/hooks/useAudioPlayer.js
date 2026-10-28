import { useRef, useCallback, useEffect, useState } from "react";

export function useAudioPlayer() {
  const audioRef = useRef(null);
  const speechRef = useRef(null);
  const urlRef = useRef(null);
  const lastB64 = useRef("");
  const lastText = useRef("");
  const pausedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [audioError, setAudioError] = useState("");

  const stopSpeech = useCallback(() => {
    if (speechRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
      speechRef.current.onend = null;
      speechRef.current.onerror = null;
      window.speechSynthesis.cancel();
    }
    speechRef.current = null;
  }, []);

  const releaseCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }

    audioRef.current = null;
    stopSpeech();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    pausedRef.current = false;
    setPlaying(false);
    setPaused(false);
  }, [stopSpeech]);

  const speakFallback = useCallback((text) => {
    const phrase = String(text || "").trim();
    if (
      !phrase ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setAudioError("Audio could not play. Browser speech is not available.");
      return false;
    }

    try {
      window.speechSynthesis.cancel();
      setAudioError("");
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = "en-US";
      speechRef.current = utterance;
      pausedRef.current = false;
      setPlaying(true);
      setPaused(false);

      const finish = () => {
        if (speechRef.current !== utterance) return;
        speechRef.current = null;
        pausedRef.current = false;
        setPlaying(false);
        setPaused(false);
      };
      utterance.onend = finish;
      utterance.onerror = (event) => {
        console.error("Browser speech fallback failed:", event.error || event);
        setAudioError("Browser speech failed. Check your device audio settings.");
        finish();
      };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      console.error("Unable to start browser speech fallback:", error);
      speechRef.current = null;
      setPlaying(false);
      setPaused(false);
      setAudioError("Speech playback is unavailable in this browser.");
      return false;
    }
  }, []);

  const play = useCallback((base64Mp3, fallbackText = lastText.current) => {
    lastText.current = fallbackText || lastText.current;
    lastB64.current = base64Mp3 || "";
    setAudioError("");

    // Stop prior HTML audio/browser speech before starting a new reading.
    const previousAudio = audioRef.current;
    if (previousAudio) {
      previousAudio.onplay = null;
      previousAudio.onended = null;
      previousAudio.onerror = null;
      previousAudio.pause();
    }
    audioRef.current = null;
    stopSpeech();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    pausedRef.current = false;
    setPlaying(false);
    setPaused(false);

    if (!base64Mp3) {
      speakFallback(lastText.current);
      return;
    }

    let createdUrl = null;
    try {
      const blob = base64ToBlob(base64Mp3, "audio/mpeg");
      const url = URL.createObjectURL(blob);
      createdUrl = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      urlRef.current = url;

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (audioRef.current !== audio) {
          URL.revokeObjectURL(url);
          return;
        }

        audioRef.current = null;
        if (urlRef.current === url) {
          URL.revokeObjectURL(url);
          urlRef.current = null;
        }
        pausedRef.current = false;
        setPlaying(false);
        setPaused(false);
      };
      const failToSpeech = () => {
        if (cleaned || audioRef.current !== audio) return;
        cleanup();
        speakFallback(lastText.current);
      };

      audio.onplay = () => {
        if (audioRef.current === audio && !pausedRef.current) {
          setPlaying(true);
          setPaused(false);
        }
      };
      audio.onended = cleanup;
      audio.onerror = failToSpeech;
      audio.play().catch(failToSpeech);
    } catch (error) {
      console.error("Unable to decode or play speech audio:", error);
      if (createdUrl && urlRef.current !== createdUrl) URL.revokeObjectURL(createdUrl);
      releaseCurrent();
      speakFallback(lastText.current);
    }
  }, [releaseCurrent, speakFallback, stopSpeech]);

  const pause = useCallback(() => {
    if (speechRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
      if (!pausedRef.current) {
        window.speechSynthesis.pause();
        pausedRef.current = true;
        setPlaying(false);
        setPaused(true);
      } else {
        window.speechSynthesis.resume();
        pausedRef.current = false;
        setPlaying(true);
        setPaused(false);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    if (!pausedRef.current) {
      audio.pause();
      pausedRef.current = true;
      setPlaying(false);
      setPaused(true);
      return;
    }

    pausedRef.current = false;
    setPaused(false);
    audio.play()
      .then(() => {
        if (audioRef.current === audio) setPlaying(true);
      })
      .catch(() => {
        releaseCurrent();
        speakFallback(lastText.current);
      });
  }, [releaseCurrent, speakFallback]);

  const stop = useCallback(() => releaseCurrent(), [releaseCurrent]);

  const replay = useCallback((fallbackText = lastText.current) => {
    play(lastB64.current, fallbackText);
  }, [play]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    if (speechRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
      speechRef.current.onend = null;
      speechRef.current.onerror = null;
      window.speechSynthesis.cancel();
    }
    audioRef.current = null;
    speechRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    pausedRef.current = false;
  }, []);

  return { play, pause, stop, replay, playing, paused, audioError };
}

function base64ToBlob(base64, mime) {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}
