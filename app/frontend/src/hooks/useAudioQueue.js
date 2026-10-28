import { useRef, useCallback, useState } from "react";

export function useAudioQueue() {
  const queueRef = useRef([]);
  const currentRef = useRef(null);
  const currentUrlRef = useRef(null);
  const isPlayingRef = useRef(false);
  const playNextRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;

    if (queueRef.current.length === 0) {
      setPlaying(false);
      return;
    }

    // If the current clip was paused, discard it before starting the next clip.
    // Replay always starts from the beginning using the retained base64 payload.
    if (currentRef.current) {
      const pausedAudio = currentRef.current;
      pausedAudio.onended = null;
      pausedAudio.onerror = null;
      pausedAudio.pause();
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      currentRef.current = null;
      currentUrlRef.current = null;
    }

    const base64Mp3 = queueRef.current.shift();
    let audio;

    try {
      const bytes = atob(base64Mp3);
      const buffer = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);

      const blob = new Blob([buffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      audio = new Audio(url);
      currentRef.current = audio;
      currentUrlRef.current = url;
      isPlayingRef.current = true;
      setPlaying(true);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        URL.revokeObjectURL(url);

        // Ignore late events from audio that has already been stopped/replaced.
        if (currentRef.current !== audio) return;

        currentRef.current = null;
        currentUrlRef.current = null;
        isPlayingRef.current = false;
        setPlaying(false);
        setTimeout(() => playNextRef.current?.(), 0);
      };

      audio.onended = cleanup;
      audio.onerror = cleanup;
      audio.play().catch(cleanup);
    } catch (error) {
      console.error("Unable to decode or play speech audio:", error);
      if (audio && currentRef.current === audio) {
        currentRef.current = null;
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
      isPlayingRef.current = false;
      setPlaying(false);
      setTimeout(() => playNextRef.current?.(), 0);
    }
  }, []);

  playNextRef.current = playNext;

  const enqueue = useCallback((base64Mp3) => {
    if (!base64Mp3) return;
    queueRef.current.push(base64Mp3);
    playNextRef.current?.();
  }, []);

  const stop = useCallback(() => {
    queueRef.current = [];

    const audio = currentRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }

    if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    currentRef.current = null;
    currentUrlRef.current = null;
    isPlayingRef.current = false;
    setPlaying(false);
  }, []);

  const pause = useCallback(() => {
    currentRef.current?.pause();
    isPlayingRef.current = false;
    setPlaying(false);
  }, []);

  // A paused clip remains busy until replayed, replaced, or stopped.
  const isBusy = useCallback(
    () => isPlayingRef.current || currentRef.current !== null || queueRef.current.length > 0,
    [],
  );

  return { enqueue, stop, pause, playing, isBusy };
}
