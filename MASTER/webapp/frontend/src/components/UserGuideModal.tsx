import React, { useState, useMemo, useEffect } from "react";
import { 
  X, 
  HelpCircle, 
  Search, 
  FolderSync, 
  Images, 
  FolderTree, 
  Presentation, 
  FileSpreadsheet, 
  LayoutDashboard, 
  CheckCircle2, 
  AlertTriangle, 
  WifiOff, 
  Wifi, 
  BookOpen
} from "lucide-react";
import { USER_GUIDES, ToolUserGuide } from "../data/userGuides";
import "../user-guide.css";

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialToolId?: string;
}

const TOOL_ICONS: Record<string, React.FC<any>> = {
  dashboard: LayoutDashboard,
  collector: FolderSync,
  convert: Images,
  organize: FolderTree,
  ppt: Presentation,
  "pdf-excel": FileSpreadsheet,
  "excel-ppt": Presentation,
  "ppt-excel": Presentation,
};

export const UserGuideModal: React.FC<UserGuideModalProps> = ({
  isOpen,
  onClose,
  initialToolId = "dashboard",
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>(initialToolId);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (isOpen && initialToolId && USER_GUIDES[initialToolId]) {
      setSelectedToolId(initialToolId);
    }
  }, [isOpen, initialToolId]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const activeGuide: ToolUserGuide = USER_GUIDES[selectedToolId] || USER_GUIDES["dashboard"];
  const ToolIcon = TOOL_ICONS[selectedToolId] || HelpCircle;

  // Search filter across steps, controls, and troubleshooting
  const query = searchQuery.trim().toLowerCase();

  const filteredSteps = useMemo(() => {
    if (!activeGuide?.stepByStep) return [];
    if (!query) return activeGuide.stepByStep;
    return activeGuide.stepByStep.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.instruction.toLowerCase().includes(query) ||
        (s.tip && s.tip.toLowerCase().includes(query))
    );
  }, [activeGuide, query]);

  const filteredControls = useMemo(() => {
    if (!activeGuide?.controlsReference) return [];
    if (!query) return activeGuide.controlsReference;
    return activeGuide.controlsReference.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.type.toLowerCase().includes(query) ||
        c.purpose.toLowerCase().includes(query) ||
        c.whenToUse.toLowerCase().includes(query)
    );
  }, [activeGuide, query]);

  const filteredTroubleshooting = useMemo(() => {
    if (!activeGuide?.troubleshooting) return [];
    if (!query) return activeGuide.troubleshooting;
    return activeGuide.troubleshooting.filter(
      (t) =>
        t.issue.toLowerCase().includes(query) ||
        t.cause.toLowerCase().includes(query) ||
        t.solution.toLowerCase().includes(query)
    );
  }, [activeGuide, query]);

  if (!isOpen) return null;

  return (
    <div 
      className="guide-modal-backdrop" 
      onClick={onClose} 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="guide-title"
      style={{ zIndex: 99999 }}
    >
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="guide-header">
          <div className="guide-header-title">
            <BookOpen size={20} color="#38bdf8" />
            <h2 id="guide-title">Loveneet Suite User Guide</h2>
            <span className="guide-badge">{activeGuide.badge || "Documentation"}</span>
          </div>

          <div className="guide-search-wrap">
            <Search size={15} className="guide-search-icon" />
            <input
              type="text"
              className="guide-search-input"
              placeholder={`Search ${activeGuide.title} guide...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="guide-close-btn"
            onClick={onClose}
            aria-label="Close user guide"
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="guide-body">
          {/* Sidebar Nav */}
          <aside className="guide-sidebar">
            <div className="guide-sidebar-label">Select Mini-App</div>
            {Object.values(USER_GUIDES).map((guide) => {
              const Icon = TOOL_ICONS[guide.id] || HelpCircle;
              const isSelected = guide.id === selectedToolId;
              return (
                <div key={guide.id}>
                  <button
                    type="button"
                    className={`guide-nav-item ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      setSelectedToolId(guide.id);
                      setSearchQuery("");
                    }}
                  >
                    <Icon size={16} className="guide-nav-icon" />
                    <span>{guide.title}</span>
                  </button>
                  {isSelected && (
                    <div className="guide-subnav">
                      <a href="#overview" className="guide-subnav-link">A. Overview</a>
                      <a href="#before-you-start" className="guide-subnav-link">B. Before You Start</a>
                      <a href="#steps" className="guide-subnav-link">C. Step-by-Step</a>
                      <a href="#controls" className="guide-subnav-link">D. Controls Reference</a>
                      <a href="#examples" className="guide-subnav-link">E. Examples</a>
                      <a href="#troubleshooting" className="guide-subnav-link">F. Troubleshooting</a>
                      <a href="#offline" className="guide-subnav-link">G. Offline Details</a>
                    </div>
                  )}
                </div>
              );
            })}
          </aside>

          {/* Main Content */}
          <main className="guide-content">
            {/* Tool Hero */}
            <div className="guide-tool-hero">
              <div className="guide-tool-hero-top">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ToolIcon size={26} color="#38bdf8" />
                  <h1>{activeGuide.title}</h1>
                </div>
                <div className={`guide-offline-pill ${activeGuide.offlineAndRequirements?.worksOffline ? "fully-offline" : "local-hybrid"}`}>
                  {activeGuide.offlineAndRequirements?.worksOffline ? (
                    <>
                      <WifiOff size={13} />
                      <span>100% Offline Compatible</span>
                    </>
                  ) : (
                    <>
                      <Wifi size={13} />
                      <span>Local Backend / Hybrid</span>
                    </>
                  )}
                </div>
              </div>
              <p>{activeGuide.tagline || activeGuide.overview?.description}</p>
            </div>

            {/* Section A: Overview */}
            <section id="overview" className="guide-section">
              <div className="guide-section-head">
                <span className="guide-section-number">A</span>
                <h3>Overview & Key Benefits</h3>
              </div>
              
              <div style={{ color: "#cbd5e1", marginBottom: 14, lineHeight: 1.6 }}>
                {activeGuide.overview?.description}
              </div>

              <div className="guide-card-grid">
                {activeGuide.overview?.benefits && (
                  <div className="guide-mini-card">
                    <strong>Key Benefits</strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#94a3b8", fontSize: 12.5 }}>
                      {activeGuide.overview.benefits.map((b, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {activeGuide.overview?.useCases && (
                  <div className="guide-mini-card">
                    <strong>Typical Use Cases</strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#94a3b8", fontSize: 12.5 }}>
                      {activeGuide.overview.useCases.map((u, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{u}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            {/* Section B: Before You Start */}
            <section id="before-you-start" className="guide-section">
              <div className="guide-section-head">
                <span className="guide-section-number">B</span>
                <h3>Before You Start</h3>
              </div>

              <div className="guide-card-grid">
                {activeGuide.beforeYouStart?.requiredInputs && (
                  <div className="guide-mini-card">
                    <strong>Required Input Files</strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#94a3b8", fontSize: 12.5 }}>
                      {activeGuide.beforeYouStart.requiredInputs.map((req, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeGuide.beforeYouStart?.supportedFormats && (
                  <div className="guide-mini-card">
                    <strong>Supported Formats & Extensions</strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {activeGuide.beforeYouStart.supportedFormats.map((ext, i) => (
                        <span key={i} className="guide-control-badge">{ext}</span>
                      ))}
                    </div>
                  </div>
                )}

                {activeGuide.beforeYouStart?.requiredStructure && activeGuide.beforeYouStart.requiredStructure.length > 0 && (
                  <div className="guide-mini-card" style={{ gridColumn: "1 / -1" }}>
                    <strong>Required Columns / Structure</strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#94a3b8", fontSize: 12.5 }}>
                      {activeGuide.beforeYouStart.requiredStructure.map((col, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{col}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeGuide.beforeYouStart?.limitations && activeGuide.beforeYouStart.limitations.length > 0 && (
                  <div className="guide-mini-card" style={{ gridColumn: "1 / -1", borderColor: "#334155" }}>
                    <strong style={{ color: "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>
                      <AlertTriangle size={15} /> Limitations & Rules
                    </strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#94a3b8", fontSize: 12.5 }}>
                      {activeGuide.beforeYouStart.limitations.map((lim, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            {/* Section C: Step-by-Step Instructions */}
            <section id="steps" className="guide-section">
              <div className="guide-section-head">
                <span className="guide-section-number">C</span>
                <h3>Step-by-Step Instructions</h3>
              </div>

              {filteredSteps.length === 0 ? (
                <div style={{ color: "#94a3b8", padding: 12 }}>No instructions match your search query.</div>
              ) : (
                <div className="guide-steps">
                  {filteredSteps.map((step) => (
                    <div key={step.stepNumber} className="guide-step-item">
                      <div className="guide-step-badge">{step.stepNumber}</div>
                      <div className="guide-step-body">
                        <h4>{step.title}</h4>
                        <p>{step.instruction}</p>
                        {step.tip && <div className="guide-step-tip">💡 Tip: {step.tip}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Section D: Button & Option Reference */}
            <section id="controls" className="guide-section">
              <div className="guide-section-head">
                <span className="guide-section-number">D</span>
                <h3>Button and Option Reference</h3>
              </div>

              {filteredControls.length === 0 ? (
                <div style={{ color: "#94a3b8", padding: 12 }}>No controls match your search query.</div>
              ) : (
                <div className="guide-table-wrap">
                  <table className="guide-table">
                    <thead>
                      <tr>
                        <th style={{ width: "24%" }}>Button / Control Name</th>
                        <th style={{ width: "14%" }}>Type</th>
                        <th style={{ width: "36%" }}>What It Does</th>
                        <th style={{ width: "26%" }}>When to Use</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredControls.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <span className="guide-control-badge">{c.name}</span>
                          </td>
                          <td>
                            <span className="guide-control-type">{c.type}</span>
                          </td>
                          <td>{c.purpose}</td>
                          <td style={{ color: "#94a3b8" }}>{c.whenToUse}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Section E: Input and Output Examples */}
            <section id="examples" className="guide-section">
              <div className="guide-section-head">
                <span className="guide-section-number">E</span>
                <h3>Input and Output Examples</h3>
              </div>

              <div className="guide-example-box">
                {activeGuide.examples?.inputExample && (
                  <>
                    <div className="guide-example-title">Input Example</div>
                    <div className="guide-code-block">
                      {activeGuide.examples.inputExample}
                    </div>
                  </>
                )}

                {activeGuide.examples?.outputExample && (
                  <>
                    <div className="guide-example-title" style={{ marginTop: 14 }}>Output Example</div>
                    <div className="guide-code-block" style={{ color: "#86efac" }}>
                      {activeGuide.examples.outputExample}
                    </div>
                  </>
                )}

                {activeGuide.examples?.explanation && (
                  <div style={{ marginTop: 12, fontSize: 12.5, color: "#94a3b8", lineHeight: 1.5 }}>
                    <strong>Note: </strong> {activeGuide.examples.explanation}
                  </div>
                )}
              </div>
            </section>

            {/* Section F: Troubleshooting */}
            <section id="troubleshooting" className="guide-section">
              <div className="guide-section-head">
                <span className="guide-section-number">F</span>
                <h3>Troubleshooting & Error Fixes</h3>
              </div>

              {filteredTroubleshooting.length === 0 ? (
                <div style={{ color: "#94a3b8", padding: 12 }}>No troubleshooting items match your search query.</div>
              ) : (
                <div className="guide-trouble-grid">
                  {filteredTroubleshooting.map((t, i) => (
                    <div key={i} className="guide-trouble-card">
                      <div className="guide-trouble-issue">
                        <AlertTriangle size={15} color="#ef4444" />
                        <span>{t.issue}</span>
                      </div>
                      <div className="guide-trouble-cause">
                        <strong>Probable Cause:</strong> {t.cause}
                      </div>
                      <div className="guide-trouble-solution">
                        <strong>Fix:</strong> {t.solution}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Section G: Offline & Internet Requirements */}
            <section id="offline" className="guide-section">
              <div className="guide-section-head">
                <span className="guide-section-number">G</span>
                <h3>Offline and Network Requirements</h3>
              </div>

              <div className="guide-mini-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  {activeGuide.offlineAndRequirements?.worksOffline ? (
                    <CheckCircle2 size={18} color="#10b981" />
                  ) : (
                    <AlertTriangle size={18} color="#f59e0b" />
                  )}
                  <strong style={{ fontSize: 14, color: activeGuide.offlineAndRequirements?.worksOffline ? "#34d399" : "#fbbf24", margin: 0 }}>
                    {activeGuide.offlineAndRequirements?.worksOffline
                      ? "Fully Offline Capable"
                      : "Hybrid / Requires Local Backend Server"}
                  </strong>
                </div>

                <p style={{ color: "#cbd5e1", marginBottom: 10 }}>
                  {activeGuide.offlineAndRequirements?.internetDetails || "Processes locally on your device."}
                </p>

                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  <strong>Local Engine: </strong>
                  <span style={{ color: "#38bdf8" }}>
                    {activeGuide.offlineAndRequirements?.localProcessing ? "Browser Wasm / Native Engine (Local)" : "Local Server API"}
                  </span>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
};

export default UserGuideModal;
