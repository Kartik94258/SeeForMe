import { useRef, useCallback, useState } from "react";

export function useAudioPlayer() {
  const audioRef  = useRef(null);
  const lastB64   = useRef("");
  const [playing, setPlaying] = useState(false);

  const play = useCallback((base64Mp3) => {
    if (!base64Mp3) return;
    lastB64.current = base64Mp3;

    const blob = base64ToBlob(base64Mp3, "audio/mpeg");
    const url  = URL.createObjectURL(blob);

    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
    }

    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onplay  = () => setPlaying(true);
    audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
    audio.onerror = () => { setPlaying(false); URL.revokeObjectURL(url); };

    audio.play().catch(() => setPlaying(false));
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
  }, []);

  const replay = useCallback(() => {
    if (lastB64.current) play(lastB64.current);
  }, [play]);

  return { play, pause, stop, replay, playing };
}

function base64ToBlob(base64, mime) {
  const bytes  = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}
