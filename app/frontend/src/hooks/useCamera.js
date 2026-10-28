import { useEffect, useRef, useCallback, useState } from "react";

const MAX_CAPTURE_WIDTH = 960;
const MAX_CAPTURE_HEIGHT = 640;

function isPermissionError(error) {
  return error?.name === "NotAllowedError" || error?.name === "SecurityError";
}

async function openCamera() {
  // Prefer the back camera on phones, but keep desktop/laptop webcams working.
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 20, max: 30 },
      },
      audio: false,
    });
  } catch (error) {
    if (isPermissionError(error)) throw error;
    // Some desktop webcams cannot satisfy a facingMode or resolution constraint.
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

export function useCamera({ active }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
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
        setError(null);
        setReady(false);
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("CAMERA_UNAVAILABLE");
        }

        localStream = await openCamera();
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

        video.muted = true;
        video.playsInline = true;
        video.srcObject = localStream;
        await video.play();

        if (!cancelled) {
          setError(null);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Camera startup failed:", err);
          localStream?.getTracks().forEach((track) => track.stop());
          if (streamRef.current === localStream) streamRef.current = null;
          setReady(false);
          setError(isPermissionError(err) ? "permission_denied" : "unavailable");
        }
      }
    }

    if (active) start();
    else stop();

    return () => {
      cancelled = true;
      localStream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === localStream) streamRef.current = null;
      if (videoRef.current?.srcObject === localStream) videoRef.current.srcObject = null;
    };
  }, [active, stop]);

  const captureFrame = useCallback((quality = 0.58) => {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth || !video.videoHeight) return null;

    // Smaller JPEGs spend less time in Base64 encoding and across the network.
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / video.videoWidth, MAX_CAPTURE_HEIGHT / video.videoHeight);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = canvasRef.current || document.createElement("canvas");
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    canvasRef.current = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    try {
      return canvas.toDataURL("image/jpeg", quality).split(",")[1];
    } catch (err) {
      console.error("Unable to capture camera frame:", err);
      return null;
    }
  }, [ready]);

  return { videoRef, ready, error, captureFrame };
}
