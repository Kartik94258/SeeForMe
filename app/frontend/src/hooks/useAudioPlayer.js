import { useRef, useCallback, useEffect, useState } from "react";

export function useAudioPlayer() {
  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const lastB64 = useRef("");
  const pausedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  const releaseCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }

    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    pausedRef.current = false;
    setPlaying(false);
    setPaused(false);
  }, []);

  const play = useCallback((base64Mp3) => {
    if (!base64Mp3) return;
    lastB64.current = base64Mp3;

    // Dispose of the previous clip before allocating another object URL.
    const previousAudio = audioRef.current;
    if (previousAudio) {
      previousAudio.onplay = null;
      previousAudio.onended = null;
      previousAudio.onerror = null;
      previousAudio.pause();
    }
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    pausedRef.current = false;
    setPlaying(false);
    setPaused(false);

    try {
      const blob = base64ToBlob(base64Mp3, "audio/mpeg");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      urlRef.current = url;

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        // Ignore late events from a clip that has already been replaced.
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

      audio.onplay = () => {
        if (audioRef.current === audio && !pausedRef.current) {
          setPlaying(true);
          setPaused(false);
        }
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      audio.play().catch(cleanup);
    } catch (error) {
      console.error("Unable to decode or play speech audio:", error);
      releaseCurrent();
    }
  }, [releaseCurrent]);

  const pause = useCallback(() => {
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
      .catch(() => releaseCurrent());
  }, [releaseCurrent]);

  const stop = useCallback(() => {
    releaseCurrent();
  }, [releaseCurrent]);

  const replay = useCallback(() => {
    if (lastB64.current) play(lastB64.current);
  }, [play]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    pausedRef.current = false;
  }, []);

  return { play, pause, stop, replay, playing, paused };
}

function base64ToBlob(base64, mime) {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}
