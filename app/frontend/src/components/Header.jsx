export default function Header({ t, lang, setLang, apiOk, latency }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="ui-icon ui-icon-logo">
              <path d="M7 3.5 15.5 8v8L7 20.5 2.5 18v-12z" />
              <path d="M7 3.5v17" />
            </svg>
          </span>
          <div>
            <div className="logo-name">{t.appName}</div>
            <div className="logo-tagline">{t.tagline}</div>
          </div>
        </div>
      </div>

      <div className="header-right">
        <div className={`api-status ${apiOk ? "ok" : "err"}`}>
          <span className="status-dot" />
          <span className="status-copy">
            <span className="status-label">API</span>
            <span className="status-value">{apiOk ? t.apiConnected : t.apiDisconnected}</span>
          </span>
        </div>

        {latency !== null && (
          <div className="latency-badge">
            <span className="latency-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="ui-icon ui-icon-inline">
                <path d="M13 2 6 13h5l-1 9 8-12h-5z" />
              </svg>
            </span>
            <span className="status-copy">
              <span className="status-label">Response</span>
              <span className="status-value">{latency} ms</span>
            </span>
          </div>
        )}

        <button
          className="lang-toggle"
          onClick={() => setLang(lang === "en" ? "fr" : "en")}
          aria-label="Switch language"
        >
          {lang === "en" ? "FR" : "EN"}
        </button>
      </div>
    </header>
  );
}
