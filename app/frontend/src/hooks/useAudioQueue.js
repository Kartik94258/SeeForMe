import { useRef, useCallback, useEffect, useState } from "react";

export function useAudioQueue() {
  const queueRef = useRef([]);
  const currentRef = useRef(null);
  const currentUrlRef = useRef(null);
  const cleanupCurrentRef = useRef(null);
  const isPlayingRef = useRef(false);
  const pausedRef = useRef(false);
  const mountedRef = useRef(true);
  const playNextRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  const playNext = useCallback(() => {
    if (isPlayingRef.current || pausedRef.current) return;

    if (queueRef.current.length === 0) {
      if (mountedRef.current) {
        setPlaying(false);
        setPaused(false);
      }
      return;
    }

    const base64Mp3 = queueRef.current.shift();
    let audio = null;

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
      pausedRef.current = false;
      if (mountedRef.current) {
        setPlaying(true);
        setPaused(false);
      }

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        URL.revokeObjectURL(url);

        // Ignore late events from audio that has already been replaced or stopped.
        if (currentRef.current !== audio) return;

        currentRef.current = null;
        currentUrlRef.current = null;
        cleanupCurrentRef.current = null;
        isPlayingRef.current = false;
        pausedRef.current = false;
        if (mountedRef.current) {
          setPlaying(false);
          setPaused(false);
          setTimeout(() => {
            if (mountedRef.current) playNextRef.current?.();
          }, 0);
        }
      };

      cleanupCurrentRef.current = cleanup;
      audio.onplay = () => {
        if (currentRef.current === audio && !pausedRef.current && mountedRef.current) {
          isPlayingRef.current = true;
          setPlaying(true);
        }
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
        cleanupCurrentRef.current = null;
      }
      isPlayingRef.current = false;
      pausedRef.current = false;
      if (mountedRef.current) {
        setPlaying(false);
        setPaused(false);
        setTimeout(() => {
          if (mountedRef.current) playNextRef.current?.();
        }, 0);
      }
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
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }

    if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    currentRef.current = null;
    currentUrlRef.current = null;
    cleanupCurrentRef.current = null;
    isPlayingRef.current = false;
    pausedRef.current = false;
    if (mountedRef.current) {
      setPlaying(false);
      setPaused(false);
    }
  }, []);

  // This button toggles pause/resume so playback cannot get stuck in a paused state.
  const pause = useCallback(() => {
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
    () => isPlayingRef.current || currentRef.current !== null || queueRef.current.length > 0,
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
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      currentRef.current = null;
      currentUrlRef.current = null;
      cleanupCurrentRef.current = null;
      isPlayingRef.current = false;
      pausedRef.current = false;
    };
  }, []);

  return { enqueue, stop, pause, playing, paused, isBusy };
}
