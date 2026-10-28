import { useEffect, useRef, useCallback, useState } from "react";

export function useCamera({ active }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.onloadedmetadata = null;
      videoRef.current.srcObject = null;
    }

    setReady(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let localStream = null;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("CAMERA_UNAVAILABLE");
        }

        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = localStream;

        const video = videoRef.current;
        if (!video) {
          localStream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          return;
        }

        video.srcObject = localStream;
        await video.play();

        if (!cancelled) {
          setError(null);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Camera startup failed:", err);
          setReady(false);
          setError(
            err.name === "NotAllowedError" || err.name === "SecurityError"
              ? "permission_denied"
              : "unavailable"
          );
        }
      }
    }

    if (active) start();
    else stop();

    return () => {
      cancelled = true;
      localStream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === localStream) streamRef.current = null;
      if (videoRef.current?.srcObject === localStream) {
        videoRef.current.srcObject = null;
      }
    };
  }, [active, stop]);

  const captureFrame = useCallback((quality = 0.6) => {
    const video = videoRef.current;

    if (!video || !ready || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", quality).split(",")[1];
  }, [ready]);

  return { videoRef, ready, error, captureFrame };
}
