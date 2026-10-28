import { useState, useRef, useCallback, useEffect } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import DetectionPanel     from "./DetectionPanel";
import { API }            from "../constants/api";

export default function UploadTab({ t, onDetection }) {
  const [analyzing, setAnalyzing]   = useState(false);
  const [preview, setPreview]       = useState(null);
  const [detectedText, setDetectedText] = useState("");
  const [feedback, setFeedback]     = useState("");
  const [log, setLog]               = useState([]);
  const [dragging, setDragging]     = useState(false);
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);
  const requestRef = useRef(null);

  const { play, pause, stop, replay, playing, paused } = useAudioPlayer();

  useEffect(() => () => {
    requestRef.current?.abort();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const addLog = useCallback((message, type) => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [...prev.slice(-49), { message, type, time }]);
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setPreview(previewUrlRef.current);
    setAnalyzing(true);
    setDetectedText("");
    setFeedback("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(API.ocrImage, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`OCR request failed (${res.status})`);

      const data = await res.json();
      onDetection(data);

      if (data.text) {
        setDetectedText(data.text);
        addLog(t.detection.success, "success");
        play(data.audio || "", data.text);
        if (!data.audio && data.feedback) {
          setFeedback(data.feedback);
          addLog(data.feedback, "warning");
        }
      } else if (data.feedback) {
        setFeedback(data.feedback);
        const type = data.feedback.includes("clear") ? "warning" : "info";
        addLog(data.feedback, type);
      }
    } catch (error) {
      if (error.name !== "AbortError") addLog("Request failed", "info");
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setAnalyzing(false);
      }
    }
  }, [onDetection, play, addLog, t]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleClear = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setAnalyzing(false);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
    setDetectedText("");
    setFeedback("");
    setLog([]);
    stop();
    if (fileRef.current) fileRef.current.value = "";
  }, [stop]);

  return (
    <div className="split-layout">
      <div className="camera-panel">
        <div
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="preview" className="upload-preview" />
          ) : (
            <div className="drop-placeholder">
              <span className="drop-icon">↑</span>
              <p>{t.upload.drag}</p>
              <p className="drop-or">{t.upload.or}</p>
              <button className="btn-primary" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                {t.upload.browse}
              </button>
              <p className="drop-supported">{t.upload.supported}</p>
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            handleFile(file);
          }}
        />

        {preview && (
          <button
            className="btn-primary analyze-btn"
            disabled={analyzing}
            onClick={() => fileRef.current?.click()}
          >
            {analyzing ? t.upload.analyzing : t.upload.browse}
          </button>
        )}
      </div>

      <DetectionPanel
        t={t}
        detectedText={detectedText}
        feedback={feedback}
        playing={playing}
        paused={paused}
        onReplay={() => replay(detectedText)}
        onPause={pause}
        onStop={stop}
        onClear={handleClear}
        log={log}
      />
    </div>
  );
}
