import { useRef, useCallback, useState } from "react";

export function useAudioQueue() {
  const queueRef      = useRef([]);
  const currentRef    = useRef(null);
  const isPlayingRef  = useRef(false);
  const playNextRef   = useRef(null);
  const [playing, setPlaying] = useState(false);

  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    if (queueRef.current.length === 0) {
      setPlaying(false);
      return;
    }

    isPlayingRef.current = true;
    const base64Mp3 = queueRef.current.shift();

    const bytes  = atob(base64Mp3);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
    const blob  = new Blob([buffer], { type: "audio/mpeg" });
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentRef.current = audio;
    setPlaying(true);

    const cleanup = () => {
      URL.revokeObjectURL(url);
      currentRef.current   = null;
      isPlayingRef.current = false;
      setTimeout(() => playNextRef.current?.(), 0);
    };

    audio.onended = cleanup;
    audio.onerror = cleanup;
    audio.play().catch(cleanup);
  }, []);

  playNextRef.current = playNext;

  const enqueue = useCallback((base64Mp3) => {
    if (!base64Mp3) return;
    queueRef.current.push(base64Mp3);
    playNextRef.current?.();
  }, []);

  const stop = useCallback(() => {
    queueRef.current = [];
    if (currentRef.current) {
      currentRef.current.pause();
      currentRef.current = null;
    }
    isPlayingRef.current = false;
    setPlaying(false);
  }, []);

  const pause = useCallback(() => {
    currentRef.current?.pause();
    isPlayingRef.current = false;
    setPlaying(false);
  }, []);

  // True when audio is playing OR queued items are waiting
  const isBusy = useCallback(
    () => isPlayingRef.current || queueRef.current.length > 0,
    []
  );

  return { enqueue, stop, pause, playing, isBusy };
}
