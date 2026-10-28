export default function AboutTab({ t }) {
  const stack = [
    { label: t.about.detector, value: "DBNet (db_resnet50)" },
    { label: t.about.recognizer, value: "TrOCR (fine-tuned)" },
    { label: t.about.tts, value: "Edge TTS - en-US-AriaNeural" },
    { label: t.about.model, value: "MoCamaraData/trocr-ocr-accessibility" },
  ];

  return (
    <div className="about-tab">
      <div className="about-card">
        <h2>{t.about.title}</h2>
        <p>{t.about.description}</p>

        <div className="about-section">
          <div className="stack-label">{t.about.problemTitle}</div>
          <p>{t.about.problem}</p>
        </div>

        <div className="about-section">
          <div className="stack-label">{t.about.workflowTitle}</div>
          <p>{t.about.workflow}</p>
        </div>

        <div className="about-section">
          <div className="stack-label">{t.about.stackTitle}</div>
          <div className="stack-grid">
            {stack.map((item) => (
              <div key={item.label} className="stack-item">
                <span className="stack-label">{item.label}</span>
                <span className="stack-value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="about-section">
          <div className="stack-label">{t.about.impactTitle}</div>
          <p>{t.about.impact}</p>
        </div>

        <div className="about-footer">{t.about.author}</div>
      </div>
    </div>
  );
}
