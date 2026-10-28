export default function StatsBar({ t, stats, avgLatency }) {
  return (
    <div className="stats-bar">
      <div className="stat-card green">
        <span className="stat-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="ui-icon">
            <path d="M6 6h5v5H6zM13 6h5v5h-5zM6 13h5v5H6zM13 13h5v5h-5z" />
          </svg>
        </span>
        <div className="stat-content">
          <div className="stat-kicker">Session</div>
          <div className="stat-value">{stats.spoken}</div>
          <div className="stat-label">{t.stats.spoken}</div>
        </div>
      </div>

      <div className="stat-card amber">
        <span className="stat-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="ui-icon">
            <circle cx="12" cy="12" r="7.5" />
            <path d="M9 9l6 6" />
          </svg>
        </span>
        <div className="stat-content">
          <div className="stat-kicker">Session</div>
          <div className="stat-value">{stats.silenced}</div>
          <div className="stat-label">{t.stats.silenced}</div>
        </div>
      </div>

      <div className="stat-card blue">
        <span className="stat-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="ui-icon">
            <path d="M13 2 6 13h5l-1 9 8-12h-5z" />
          </svg>
        </span>
        <div className="stat-content">
          <div className="stat-kicker">Realtime</div>
          <div className="stat-value">
            {avgLatency !== null ? `${avgLatency} ms` : "-"}
          </div>
          <div className="stat-label">{t.stats.avgLatency}</div>
        </div>
      </div>

      <div className="stat-card highlight">
        <span className="stat-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="ui-icon">
            <path d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />
          </svg>
        </span>
        <div className="stat-content">
          <div className="stat-kicker">System</div>
          <div className="stat-status">
            <span className="status-dot green" />
            <span className="stat-value">{t.stats.ready}</span>
          </div>
          <div className="stat-label">{t.stats.readyDesc}</div>
        </div>
      </div>
    </div>
  );
}
