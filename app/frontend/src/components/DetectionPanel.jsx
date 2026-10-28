import { useEffect, useRef } from "react";

export default function DetectionPanel({ t, detectedText, feedback, playing, onReplay, onPause, onStop, onClear, log }) {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  return (
    <div className="detection-panel">
      <div className="detection-header">
        <div>
          <div className="panel-eyebrow">Live Result</div>
          <div className="detection-title">
            <span className="wave-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="ui-icon ui-icon-inline">
                <path d="M4 14a2 2 0 1 0 0-4" />
                <path d="M9 17a5 5 0 0 0 0-10" />
                <path d="M14 20a8 8 0 0 0 0-16" />
              </svg>
            </span>
            {t.detection.title}
          </div>
        </div>
        <div className={`speaking-badge ${playing ? "active" : ""}`}>
          <span className="status-dot" />
          {playing ? t.detection.speaking : t.detection.idle}
        </div>
      </div>

      <div className="detected-text-box">
        <div className="result-label">Recognized Text</div>
        {detectedText ? (
          <p className="detected-text">{detectedText}</p>
        ) : (
          <p className="detected-text placeholder">{t.detection.waiting}</p>
        )}
        {feedback && !detectedText && (
          <p className="feedback-text">{feedback}</p>
        )}
      </div>

      <div className="audio-controls">
        <button className="btn-primary" onClick={onReplay} disabled={!detectedText}>
          <span className="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="ui-icon ui-icon-inline">
              <path d="m8 6 10 6-10 6z" />
            </svg>
          </span>
          {t.detection.replay}
        </button>
        <button className="btn-secondary" onClick={onPause} disabled={!playing}>
          <span className="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="ui-icon ui-icon-inline">
              <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
            </svg>
          </span>
          {t.detection.pause}
        </button>
        <button className="btn-secondary" onClick={onStop} disabled={!playing}>
          <span className="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="ui-icon ui-icon-inline">
              <path d="M7 7h10v10H7z" />
            </svg>
          </span>
          {t.detection.stop}
        </button>
      </div>

      <div className="status-log-header">
        <span>Activity</span>
        <button className="btn-clear" onClick={onClear}>
          {t.detection.clear}
        </button>
      </div>

      <div className="status-log" ref={logRef}>
        {log.length === 0 && (
          <div className="log-empty">{t.detection.waiting}</div>
        )}
        {[...log].reverse().map((entry, i) => (
          <div key={i} className={`log-entry ${entry.type}`}>
            <span className="log-icon">
              {entry.type === "success" ? "●" : entry.type === "warning" ? "▲" : "○"}
            </span>
            <span className="log-msg">{entry.message}</span>
            <span className="log-time">{entry.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
