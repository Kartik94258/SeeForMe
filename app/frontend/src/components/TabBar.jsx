const tabs = [
  { id: "live", icon: LiveIcon },
  { id: "upload", icon: UploadIcon },
  { id: "about", icon: AboutIcon },
];

export default function TabBar({ t, tab, setTab }) {
  const labels = {
    live: t.tabs.live,
    upload: t.tabs.upload,
    about: t.tabs.about,
  };

  return (
    <nav className="tabbar">
      <div className="tabbar-inner">
        {tabs.map(({ id, icon: Icon }) => (
          <button
            key={id}
            className={`tab-btn ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            <span className="tab-icon" aria-hidden="true">
              <Icon />
            </span>
            {labels[id]}
          </button>
        ))}
      </div>
    </nav>
  );
}

function LiveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ui-icon ui-icon-inline">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M4.5 9.5a9.5 9.5 0 0 1 15 0" />
      <path d="M4.5 14.5a9.5 9.5 0 0 0 15 0" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ui-icon ui-icon-inline">
      <path d="M12 16V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ui-icon ui-icon-inline">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 10.25v5.25" />
      <path d="M12 7.75h.01" />
    </svg>
  );
}
