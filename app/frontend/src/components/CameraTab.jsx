import { useState, useEffect, useRef, useCallback } from "react";
import { useCamera }      from "../hooks/useCamera";
import { useWebSocket }   from "../hooks/useWebSocket";
import { useAudioQueue }  from "../hooks/useAudioQueue";
import DetectionPanel     from "./DetectionPanel";

const FRAME_INTERVAL_MS = 300;

export default function CameraTab({ t, onDetection }) {
  const [active, setActive]               = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef                  = useRef(false);
  const [detectedText, setDetectedText]   = useState("");
  const [feedback, setFeedback]           = useState("");
  const [log, setLog]                     = useState([]);
  const intervalRef    = useRef(null);

  const { enqueue, stop: stopAudio, pause: pauseAudio, playing, isBusy } = useAudioQueue();
  const lastAudioRef = useRef(null);

  // Track whether we're waiting for audio to come back from the server
  // (text was detected, TTS is running on backend, audio not yet received)
  const awaitingAudioRef = useRef(false);

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

  const handleReplay = useCallback(() => {
    if (lastAudioRef.current) enqueue(lastAudioRef.current);
  }, [enqueue]);

  const handleMessage = useCallback((data) => {
    onDetection(data);

    if (data.type === "text" && data.text) {
      setDetectedText(data.text);
      setFeedback("");
      addLog(t.detection.success, "success");
      // Text arrived — backend is now synthesizing TTS.
      // Pause frame sending until we get the audio back.
      awaitingAudioRef.current = true;
    }

    if (data.type === "audio" && data.audio) {
      // Audio arrived — TTS is done. Allow frames again once playback finishes.
      awaitingAudioRef.current = false;
      if (audioUnlockedRef.current) {
        lastAudioRef.current = data.audio;
        enqueue(data.audio);
      }
    }

    if (data.type === "feedback" && data.feedback) {
      setFeedback(data.feedback);
      const logType = data.feedback.includes("clear") ? "warning" : "info";
      addLog(data.feedback, logType);
    }
  }, [onDetection, enqueue, addLog, t]);

  const { connected, sendFrame } = useWebSocket({
    onMessage: handleMessage,
    active,
  });

  const testAudio = useCallback(async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width  = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = "black";
      ctx.font = "20px Arial";
      ctx.fillText("TEST", 20, 60);
      canvas.toBlob(async (blob) => {
        const form = new FormData();
        form.append("file", blob, "test.jpg");
        const res  = await fetch("http://localhost:8000/ocr/image", { method: "POST", body: form });
        const data = await res.json();
        alert(`text: "${data.text}" | audio: ${data.audio?.length || 0} bytes | feedback: "${data.feedback}"`);
        if (data.audio) enqueue(data.audio);
      }, "image/jpeg", 0.9);
    } catch (e) {
      alert("Test failed: " + e.message);
    }
  }, [enqueue]);

  // Send frames — but gate on audio state so we don't trigger new detections
  // while the current one is still being spoken / synthesized.
  useEffect(() => {
    if (!ready) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      // Don't send if we're waiting for TTS to come back OR audio is playing
      if (awaitingAudioRef.current || isBusy()) return;
      const frame = captureFrame(0.6);
      if (frame) sendFrame(frame);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [ready, captureFrame, sendFrame, isBusy]);

  return (
    <div className="split-layout">
      <div className="camera-panel">
        <div className="camera-status-bar">
          <div className="scan-status">
            <span className={`status-dot ${connected ? "green" : "red"}`} />
            <span>{active ? t.camera.scanning : t.camera.pointCamera}</span>
          </div>
          <div className="camera-badges">
            {connected     && <span className="badge blue">WS</span>}
            {ready         && <span className="badge green">CAM</span>}
            {audioUnlocked && <span className="badge green">AUDIO</span>}
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
        onReplay={handleReplay}
        onPause={pauseAudio}
        onStop={stopAudio}
        onClear={() => { setLog([]); setDetectedText(""); setFeedback(""); stopAudio(); awaitingAudioRef.current = false; }}
        log={log}
      />
    </div>
  );
}
