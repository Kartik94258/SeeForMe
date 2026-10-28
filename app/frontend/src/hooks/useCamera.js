import { useEffect, useRef, useCallback, useState } from "react";

export function useCamera({ active }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [error, setError]   = useState(null);
  const [ready, setReady]   = useState(false);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width:      { ideal: 1280 },
          height:     { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setReady(true);
        };
      }
      setError(null);
    } catch (err) {
      setError(err.name === "NotAllowedError" ? "permission_denied" : "unavailable");
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Capture a JPEG frame from the video element
  const captureFrame = useCallback((quality = 0.6) => {
    const video = videoRef.current;
    if (!video || !ready) return null;

    const canvas = document.createElement("canvas");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    // Strip the data URI prefix to get raw base64
    return dataUrl.split(",")[1];
  }, [ready]);

  useEffect(() => {
    if (active) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [active, start, stop]);

  return { videoRef, ready, error, captureFrame };
}
