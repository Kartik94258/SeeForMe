import { useState, useEffect, useRef, useCallback } from "react";
import { useCamera }      from "../hooks/useCamera";
import { useWebSocket }   from "../hooks/useWebSocket";
import { useAudioQueue }  from "../hooks/useAudioQueue";
import DetectionPanel     from "./DetectionPanel";

const FRAME_INTERVAL_MS = 150;
const FRAME_ACK_TIMEOUT_MS = 20000;

export default function CameraTab({ t, onDetection }) {
  const [active, setActive]               = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef                  = useRef(false);
  const [detectedText, setDetectedText]   = useState("");
  const [feedback, setFeedback]           = useState("");
  const [log, setLog]                     = useState([]);
  const [processing, setProcessing]       = useState(false);
  const [regions, setRegions]             = useState([]);
  const intervalRef    = useRef(null);
  const overlayRef     = useRef(null);

  const { enqueue, stop: stopAudio, pause: pauseAudio, speakText, playing, paused } = useAudioQueue();

  // Backpressure + watchdog: never queue stale frames, but recover if an ACK is lost.
  const frameInFlightRef = useRef(false);
  const frameSentAtRef = useRef(0);

  const { videoRef, ready, error, captureFrame } = useCamera({ active });

  const addLog = useCallback((message, type) => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [...prev.slice(-49), { message, type, time }]);
  }, []);

  const handleActivate = useCallback(() => {
    audioUnlockedRef.current = true;
    setAudioUnlocked(true);
    setActive(true);
  }, []);

  const handlePlaybackError = useCallback((message) => {
    setFeedback(message);
    addLog(message, "warning");
  }, [addLog]);

  const handleReplay = useCallback(() => {
    if (!detectedText) return;
    // Use speechSynthesis directly within this click; replay must not depend on
    // a cached/expired MP3 or on an earlier async audio.play() gesture.
    speakText(detectedText, handlePlaybackError);
  }, [detectedText, handlePlaybackError, speakText]);

  const handleMessage = useCallback((data) => {
    if (data.type === "processed") {
      frameInFlightRef.current = false;
      frameSentAtRef.current = 0;
      setProcessing(false);
      return;
    }

    if (Array.isArray(data.regions)) setRegions(data.regions);

    // Count once, after speech synthesis, so latency includes the TTS stage.
    if (data.type === "audio" || data.type === "feedback") onDetection(data);

    if (data.type === "text" && data.text) {
      setDetectedText(data.text);
      setFeedback("");
      addLog(t.detection.success, "success");
    }

    if (data.type === "audio") {
      if (audioUnlockedRef.current && data.text) {
        enqueue(data.audio || "", data.text, handlePlaybackError);
      }

      if (!data.audio && data.feedback) {
        setFeedback(data.feedback);
        addLog(data.feedback, "warning");
      }
    }

    if (data.type === "feedback" && data.feedback) {
      setFeedback(data.feedback);
      const logType = data.feedback.includes("clear") ? "warning" : "info";
      addLog(data.feedback, logType);
    }
  }, [onDetection, enqueue, addLog, handlePlaybackError, t]);

  const { connected, sendFrame, reconnect } = useWebSocket({
    onMessage: handleMessage,
    active,
  });

  // Draw accepted and low-confidence text regions over the live camera preview.
  // The incoming boxes are in the downscaled frame's pixel coordinates.
  useEffect(() => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    const wrapper = canvas?.parentElement;
    if (!canvas || !video || !wrapper) return undefined;

    const draw = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const viewWidth = Math.max(1, rect.width);
      const viewHeight = Math.max(1, rect.height);
      const pixelWidth = Math.max(1, Math.round(viewWidth * dpr));
      const pixelHeight = Math.max(1, Math.round(viewHeight * dpr));

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewWidth, viewHeight);

      if (!ready || !video.videoWidth || !video.videoHeight) return;

      const captureScale = Math.min(
        1,
        960 / video.videoWidth,
        640 / video.videoHeight,
      );
      const sourceWidth = Math.max(1, Math.round(video.videoWidth * captureScale));
      const sourceHeight = Math.max(1, Math.round(video.videoHeight * captureScale));
      const displayScale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
      const offsetX = (sourceWidth * displayScale - viewWidth) / 2;
      const offsetY = (sourceHeight * displayScale - viewHeight) / 2;

      ctx.lineWidth = 2;
      ctx.font = "12px system-ui, sans-serif";
      ctx.textBaseline = "middle";

      for (const region of regions) {
        const box = region?.box;
        if (!Array.isArray(box) || box.length < 4) continue;
        const [rawX, rawY, rawW, rawH] = box.map(Number);
        if (![rawX, rawY, rawW, rawH].every(Number.isFinite) || rawW <= 0 || rawH <= 0) continue;

        const x = rawX * displayScale - offsetX;
        const y = rawY * displayScale - offsetY;
        const width = rawW * displayScale;
        const height = rawH * displayScale;
        if (x + width < 0 || y + height < 0 || x > viewWidth || y > viewHeight) continue;

        const gated = Boolean(region.gated);
        const color = gated ? "#ef4444" : "#22c55e";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        const confidence = Math.round(Math.max(0, Math.min(1, Number(region.confidence) || 0)) * 100);
        const label = gated
          ? `Low confidence ${confidence}%`
          : `${String(region.text || "Text").slice(0, 32)} ${confidence}%`;
        const labelWidth = ctx.measureText(label).width + 10;
        const labelHeight = 20;
        const labelX = Math.max(0, Math.min(viewWidth - labelWidth, x));
        const labelY = y - labelHeight >= 0 ? y - labelHeight : Math.min(viewHeight - labelHeight, y + height);
        ctx.fillStyle = color;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, labelX + 5, labelY + labelHeight / 2, Math.max(0, labelWidth - 8));
      }
    };

    draw();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(draw) : null;
    observer?.observe(wrapper);
    video.addEventListener("loadedmetadata", draw);
    window.addEventListener("resize", draw);

    return () => {
      observer?.disconnect();
      video.removeEventListener("loadedmetadata", draw);
      window.removeEventListener("resize", draw);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [regions, ready, videoRef]);

  // OCR frames continue while TTS is synthesized or played in the background.
  // A watchdog reconnects if a server frame acknowledgement is ever lost.
  useEffect(() => {
    if (!ready || !connected) {
      clearInterval(intervalRef.current);
      frameInFlightRef.current = false;
      frameSentAtRef.current = 0;
      setProcessing(false);
      return;
    }

    intervalRef.current = setInterval(() => {
      if (frameInFlightRef.current) {
        if (Date.now() - frameSentAtRef.current > FRAME_ACK_TIMEOUT_MS) {
          frameInFlightRef.current = false;
          frameSentAtRef.current = 0;
          setProcessing(false);
          setFeedback(t.camera.scanTimedOut);
          addLog(t.camera.scanTimedOut, "warning");
          reconnect();
        }
        return;
      }

      const frame = captureFrame(0.58);
      if (!frame) return;

      if (sendFrame(frame)) {
        frameInFlightRef.current = true;
        frameSentAtRef.current = Date.now();
        setProcessing(true);
      } else {
        setFeedback(t.camera.connectionLost);
        addLog(t.camera.connectionLost, "warning");
        reconnect();
      }
    }, FRAME_INTERVAL_MS);

    return () => clearInterval(intervalRef.current);
  }, [ready, connected, captureFrame, sendFrame, reconnect, addLog, t]);

  return (
    <div className="split-layout">
      <div className="camera-panel">
        <div className="camera-status-bar">
          <div className="scan-status">
            <span className={`status-dot ${connected ? "green" : "red"}`} />
            <span aria-live="polite">
              {!active
                ? t.camera.pointCamera
                : error
                  ? (error === "permission_denied" ? t.camera.permissionDenied : t.camera.noCamera)
                  : !ready
                    ? t.camera.startingCamera
                    : !connected
                      ? t.camera.connecting
                      : processing
                        ? t.camera.processing
                        : t.camera.scanning}
            </span>
          </div>
          <div className="camera-badges">
            {connected     && <span className="badge blue">WS</span>}
            {ready         && <span className="badge green">CAM</span>}
            {audioUnlocked && <span className="badge green">AUDIO</span>}
            {regions.some((region) => !region.gated) && <span className="badge green">TEXT FOUND</span>}
            {regions.some((region) => region.gated) && <span className="badge-btn amber">LOW CONFIDENCE</span>}
          </div>
        </div>

        <div className="video-wrapper">
          {error && (
            <div className="camera-error">
              {error === "permission_denied"
                ? t.camera.permissionDenied
                : t.camera.noCamera}
            </div>
          )}
          <video ref={videoRef} className="video-feed" autoPlay playsInline muted />
          <canvas ref={overlayRef} className="box-canvas" aria-hidden="true" />

          {!audioUnlocked && (
            <div className="activate-overlay" onClick={handleActivate}>
              <div className="activate-content">
                <div className="activate-icon" aria-hidden="true">
                  <svg viewBox="0 0 64 64" className="activate-icon-svg">
                    <circle cx="32" cy="32" r="26" className="activate-icon-ring" />
                    <path
                      d="M22 24.5C22 22.567 23.567 21 25.5 21h13C40.433 21 42 22.567 42 24.5v15C42 41.433 40.433 43 38.5 43h-13C23.567 43 22 41.433 22 39.5z"
                      className="activate-icon-body"
                    />
                    <path d="M26 18.5a6 6 0 0 1 12 0" className="activate-icon-head" />
                    <path d="M18 32h7m14 0h7" className="activate-icon-wave" />
                  </svg>
                </div>
                <div className="activate-title">
                  {t.camera.activateTitle || "Tap to Start"}
                </div>
                <div className="activate-sub">
                  {t.camera.activateSub || "Activates camera and voice output"}
                </div>
                <button className="activate-btn">
                  {t.camera.activateBtn || "Start Scanning"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="camera-tip">
          <span className="tip-icon">💡</span>
          <span>{t.camera.tip}</span>
        </div>
      </div>

      <DetectionPanel
        t={t}
        detectedText={detectedText}
        feedback={feedback}
        playing={playing}
        paused={paused}
        onReplay={handleReplay}
        onPause={pauseAudio}
        onStop={stopAudio}
        onClear={() => { setLog([]); setDetectedText(""); setFeedback(""); stopAudio(); }}
        log={log}
      />
    </div>
  );
}
