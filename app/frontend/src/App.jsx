import { useState, useEffect } from "react";
import Header     from "./components/Header";
import TabBar     from "./components/TabBar";
import CameraTab  from "./components/CameraTab";
import UploadTab  from "./components/UploadTab";
import AboutTab   from "./components/AboutTab";
import StatsBar   from "./components/StatsBar";
import en from "./i18n/en";
import fr from "./i18n/fr";
import { API } from "./constants/api";
import "./App.css";

export default function App() {
  const [lang, setLang]       = useState(() => localStorage.getItem("lang") || "en");
  const [tab, setTab]         = useState("live");
  const [apiOk, setApiOk]     = useState(false);
  const [latency, setLatency] = useState(null);
  const [stats, setStats]     = useState({ spoken: 0, silenced: 0, latencies: [] });

  const t = lang === "fr" ? fr : en;

  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

  // Poll API health
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(API.health);
        setApiOk(res.ok);
      } catch {
        setApiOk(false);
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  const onDetection = (result) => {
    if (result.meta) {
      const ms = Math.round((result.meta.latency?.total_s || 0) * 1000);
      setLatency(ms);
      setStats((prev) => {
        const latencies = [...prev.latencies.slice(-19), ms];
        return {
          spoken:    prev.spoken    + (result.meta.n_spoken   || 0),
          silenced:  prev.silenced  + (result.meta.n_silenced || 0),
          latencies,
        };
      });
    }
  };

  const avgLatency = stats.latencies.length
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : null;

  return (
    <div className="app">
      <Header
        t={t}
        lang={lang}
        setLang={setLang}
        apiOk={apiOk}
        latency={latency}
      />
      <TabBar t={t} tab={tab} setTab={setTab} />

      <main className="main">
        {tab === "live"   && <CameraTab  t={t} onDetection={onDetection} />}
        {tab === "upload" && <UploadTab  t={t} onDetection={onDetection} />}
        {tab === "about"  && <AboutTab   t={t} />}
      </main>

      {(tab === "live" || tab === "upload") && (
        <StatsBar t={t} stats={stats} avgLatency={avgLatency} />
      )}

      <footer className="footer">
        <span>{t.about.tech}</span>
      </footer>
    </div>
  );
}
