import { useRef, useCallback, useEffect, useState } from "react";

export function useAudioQueue() {
  const queueRef = useRef([]);
  const currentRef = useRef(null);
  const speechRef = useRef(null);
  const currentUrlRef = useRef(null);
  const cleanupCurrentRef = useRef(null);
  const isPlayingRef = useRef(false);
  const pausedRef = useRef(false);
  const mountedRef = useRef(true);
  const playNextRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  const advanceQueue = useCallback(() => {
    if (mountedRef.current) {
      setPlaying(false);
      setPaused(false);
      setTimeout(() => {
        if (mountedRef.current) playNextRef.current?.();
      }, 0);
    }
  }, []);

  const speakFallback = useCallback((text, onError) => {
    const phrase = String(text || "").trim();
    if (
      !phrase ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      onError?.("Audio playback failed and browser speech is unavailable.");
      return false;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = "en-US";
      speechRef.current = utterance;
      isPlayingRef.current = true;
      pausedRef.current = false;
      if (mountedRef.current) {
        setPlaying(true);
        setPaused(false);
      }

      let finished = false;
      const finish = (errorMessage = "") => {
        if (finished) return;
        finished = true;
        if (speechRef.current !== utterance) return;
        speechRef.current = null;
        isPlayingRef.current = false;
        pausedRef.current = false;
        if (errorMessage && mountedRef.current) onError?.(errorMessage);
        advanceQueue();
      };

      utterance.onend = () => finish();
      utterance.onerror = (event) => {
        console.error("Browser speech fallback failed:", event.error || event);
        finish("Browser speech playback failed. Check your device audio settings.");
      };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      console.error("Unable to start browser speech fallback:", error);
      speechRef.current = null;
      isPlayingRef.current = false;
      pausedRef.current = false;
      if (mountedRef.current) {
        setPlaying(false);
        setPaused(false);
        onError?.("Speech playback is unavailable in this browser.");
      }
      return false;
    }
  }, [advanceQueue]);

  // Call this directly from a user click: it starts speech synchronously, so
  // browser autoplay policies cannot reject it merely because OCR was asynchronous.
  const speakText = useCallback((text, onError = null) => {
    queueRef.current = [];

    const audio = currentRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    currentRef.current = null;
    currentUrlRef.current = null;
    cleanupCurrentRef.current = null;

    if (speechRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
      speechRef.current.onend = null;
      speechRef.current.onerror = null;
      window.speechSynthesis.cancel();
    }
    speechRef.current = null;
    isPlayingRef.current = false;
    pausedRef.current = false;
    if (mountedRef.current) {
      setPlaying(false);
      setPaused(false);
    }

    return speakFallback(text, onError);
  }, [speakFallback]);

  const playNext = useCallback(() => {
    if (isPlayingRef.current || pausedRef.current || speechRef.current) return;

    if (queueRef.current.length === 0) {
      if (mountedRef.current) {
        setPlaying(false);
        setPaused(false);
      }
      return;
    }

    const item = queueRef.current.shift();
    const base64Mp3 = item.audio;
    let audio = null;
    let url = null;

    if (!base64Mp3) {
      if (!speakFallback(item.text, item.onError)) advanceQueue();
      return;
    }

    try {
      const bytes = atob(base64Mp3);
      const buffer = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);

      const blob = new Blob([buffer], { type: "audio/mpeg" });
      url = URL.createObjectURL(blob);
      audio = new Audio(url);
      currentRef.current = audio;
      currentUrlRef.current = url;
      isPlayingRef.current = true;
      pausedRef.current = false;
      if (mountedRef.current) {
        setPlaying(true);
        setPaused(false);
      }

      let cleaned = false;
      const releaseAudio = () => {
        if (cleaned) return;
        cleaned = true;
        URL.revokeObjectURL(url);
        if (currentRef.current !== audio) return;

        currentRef.current = null;
        currentUrlRef.current = null;
        cleanupCurrentRef.current = null;
        isPlayingRef.current = false;
        pausedRef.current = false;
      };

      const cleanup = () => {
        releaseAudio();
        if (mountedRef.current && currentRef.current === null && speechRef.current === null) {
          advanceQueue();
        }
      };

      const fallbackOnFailure = () => {
        if (cleaned || currentRef.current !== audio) return;
        releaseAudio();
        if (mountedRef.current) setPlaying(false);
        if (!speakFallback(item.text, item.onError)) advanceQueue();
      };

      cleanupCurrentRef.current = cleanup;
      audio.onplay = () => {
        if (currentRef.current === audio && !pausedRef.current && mountedRef.current) {
          isPlayingRef.current = true;
          setPlaying(true);
        }
      };
      audio.onended = cleanup;
      audio.onerror = fallbackOnFailure;
      audio.play().catch(fallbackOnFailure);
    } catch (error) {
      console.error("Unable to decode or play speech audio:", error);
      if (url && currentUrlRef.current !== url) URL.revokeObjectURL(url);
      if (audio && currentRef.current === audio) {
        currentRef.current = null;
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
        cleanupCurrentRef.current = null;
      }
      isPlayingRef.current = false;
      pausedRef.current = false;
      if (!speakFallback(item.text, item.onError)) advanceQueue();
    }
  }, [advanceQueue, speakFallback]);

  playNextRef.current = playNext;

  const enqueue = useCallback((base64Mp3, fallbackText = "", onError = null) => {
    if (!base64Mp3 && !String(fallbackText || "").trim()) {
      onError?.("No audio or recognized text is available to replay.");
      return;
    }
    queueRef.current.push({
      audio: base64Mp3 || "",
      text: fallbackText || "",
      onError,
    });
    playNextRef.current?.();
  }, []);

  const stop = useCallback(() => {
    queueRef.current = [];
    const audio = currentRef.current;
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

    if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    currentRef.current = null;
    speechRef.current = null;
    currentUrlRef.current = null;
    cleanupCurrentRef.current = null;
    isPlayingRef.current = false;
    pausedRef.current = false;
    if (mountedRef.current) {
      setPlaying(false);
      setPaused(false);
    }
  }, []);

  const pause = useCallback(() => {
    if (speechRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
      if (!pausedRef.current) {
        window.speechSynthesis.pause();
        pausedRef.current = true;
        isPlayingRef.current = false;
        if (mountedRef.current) {
          setPlaying(false);
          setPaused(true);
        }
      } else {
        window.speechSynthesis.resume();
        pausedRef.current = false;
        isPlayingRef.current = true;
        if (mountedRef.current) {
          setPlaying(true);
          setPaused(false);
        }
      }
      return;
    }

    const audio = currentRef.current;
    if (!audio) return;
    if (!pausedRef.current) {
      audio.pause();
      pausedRef.current = true;
      isPlayingRef.current = false;
      if (mountedRef.current) {
        setPlaying(false);
        setPaused(true);
      }
      return;
    }

    pausedRef.current = false;
    isPlayingRef.current = true;
    if (mountedRef.current) {
      setPaused(false);
      setPlaying(true);
    }
    audio.play().catch(() => cleanupCurrentRef.current?.());
  }, []);

  const isBusy = useCallback(
    () => isPlayingRef.current || currentRef.current !== null || speechRef.current !== null || queueRef.current.length > 0,
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueRef.current = [];
      const audio = currentRef.current;
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
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      currentRef.current = null;
      speechRef.current = null;
      currentUrlRef.current = null;
      cleanupCurrentRef.current = null;
      isPlayingRef.current = false;
      pausedRef.current = false;
    };
  }, []);

  return { enqueue, stop, pause, speakText, playing, paused, isBusy };
}
