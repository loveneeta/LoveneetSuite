import React, { useState, useEffect } from "react";
import {
  Building2,
  Database,
  ExternalLink,
  RefreshCw,
  HardDrive,
  ShieldCheck,
  Truck,
  Layers,
  ArrowUpRight,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  ArrowLeft
} from "lucide-react";

export default function BusinessSystemTool({ onNavigate }: { onNavigate?: (pageId: string) => void }) {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"embedded" | "cards">("embedded");
  const [selectedCompany, setSelectedCompany] = useState<"PAN_HOMES" | "ESR">("PAN_HOMES");
  const [loading, setLoading] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const DEFAULT_LOCAL = "http://localhost:8080";
  const DEFAULT_LAN = "http://192.168.1.63:8080";

  const [activeUrl, setActiveUrl] = useState<string>(() => {
    return localStorage.getItem("loveneet_erp_url") || DEFAULT_LOCAL;
  });
  const [showConfig, setShowConfig] = useState(false);
  const [customHost, setCustomHost] = useState(activeUrl);

  const ERP_LOCAL_URL = activeUrl;
  const ERP_LAN_URL = DEFAULT_LAN;

  // Listen for navigation messages from the embedded ERP iframe
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === "LOVENEET_NAV" && e.data.page) {
        if (onNavigate) {
          onNavigate(e.data.page);
        }
      }
    };
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, [onNavigate]);

  // Check health of ERP server with automatic fallback between localhost and LAN IP
  const checkHealth = async (overrideUrl?: string) => {
    setLoading(true);
    const target = overrideUrl || activeUrl;

    const testUrl = async (url: string) => {
      try {
        const res = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          return { ok: true, data };
        }
      } catch (e) {
        try {
          await fetch(`${url}/api/v1/health`, { mode: "no-cors" });
          return { ok: true, data: null };
        } catch {}
      }
      return { ok: false, data: null };
    };

    // 1. Try currently active URL
    let check = await testUrl(target);
    if (check.ok) {
      if (target !== activeUrl) {
        setActiveUrl(target);
        localStorage.setItem("loveneet_erp_url", target);
      }
      setServerOnline(true);
      if (check.data) setMetrics(check.data);
      setLoading(false);
      return;
    }

    // 2. If localhost failed, try LAN URL (ideal for other PCs on network)
    if (target.includes("localhost") || target.includes("127.0.0.1")) {
      check = await testUrl(DEFAULT_LAN);
      if (check.ok) {
        setActiveUrl(DEFAULT_LAN);
        localStorage.setItem("loveneet_erp_url", DEFAULT_LAN);
        setServerOnline(true);
        if (check.data) setMetrics(check.data);
        setLoading(false);
        return;
      }
    } else if (target === DEFAULT_LAN) {
      // If LAN failed, check if running locally
      check = await testUrl(DEFAULT_LOCAL);
      if (check.ok) {
        setActiveUrl(DEFAULT_LOCAL);
        localStorage.setItem("loveneet_erp_url", DEFAULT_LOCAL);
        setServerOnline(true);
        if (check.data) setMetrics(check.data);
        setLoading(false);
        return;
      }
    }

    setServerOnline(false);
    setLoading(false);
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleExportForCatalog = async (companyId: number, companyCode: string) => {
    try {
      setExportNotice(`Exporting ${companyCode} Product Master for Suite Catalogue Tool...`);
      const res = await fetch(`${ERP_LOCAL_URL}/api/v1/companies/${companyId}/products/export/suite`);
      if (!res.ok) throw new Error("Could not export product data");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${companyCode}_PRODUCTS_CATALOG_EXPORT.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportNotice(`Exported ${companyCode} products successfully! Ready for Excel to Catalogue PPT.`);
    } catch (err: any) {
      setExportNotice(`Notice: Open ERP at ${ERP_LOCAL_URL} to download product CSV.`);
    }
  };

  return (
    <div className="workspace-wrap" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Top Banner & Quick Controls */}
      <div
        style={{
          background: "linear-gradient(135deg, #131c31 0%, #0d1527 100%)",
          border: "1px solid #263554",
          borderRadius: "14px",
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              display: "grid",
              placeItems: "center",
              color: "#ffffff"
            }}
          >
            <Building2 size={26} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "19px", fontFamily: "Manrope, sans-serif", fontWeight: 800 }}>
                Loveneet Business System (ERP)
              </h2>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontWeight: 600,
                  background: serverOnline ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: serverOnline ? "#34d399" : "#f87171",
                  border: `1px solid ${serverOnline ? "#059669" : "#dc2626"}`
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: serverOnline ? "#10b981" : "#ef4444"
                  }}
                />
                {serverOnline ? `ERP Active · ${activeUrl.replace("http://", "")}` : "Server Standby"}
              </span>
              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                style={{
                  background: "transparent",
                  border: "1px solid #334155",
                  color: "#94a3b8",
                  borderRadius: "6px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  cursor: "pointer"
                }}
                title="Change Server Host / Port"
              >
                ⚙ Server IP
              </button>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#94a3b8" }}>
              Multi-company enterprise system for PAN HOMES, ESR & future companies · Dynamic Matrix Dashboard · Dispatches · 6-Hourly Automated Backups
            </p>
          </div>
        </div>

        {/* View Switcher & Action Links */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {onNavigate && (
            <button
              type="button"
              className="primary-btn"
              style={{
                background: "#1e293b",
                border: "1px solid #475569",
                color: "#f1f5f9",
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer"
              }}
              onClick={() => onNavigate("dashboard")}
              title="Return to Loveneet Suite Overview / All Tools"
            >
              <ArrowLeft size={14} />
              ← Back to Suite Overview
            </button>
          )}

          <button
            type="button"
            className="primary-btn"
            style={{
              background: viewMode === "embedded" ? "linear-gradient(120deg, #38bdf8, #2563eb)" : "#1e293b",
              border: "1px solid #334155",
              color: "#ffffff",
              padding: "8px 14px",
              fontSize: "12px"
            }}
            onClick={() => setViewMode(viewMode === "embedded" ? "cards" : "embedded")}
          >
            <Maximize2 size={14} />
            {viewMode === "embedded" ? "Dashboard Cards View" : "Embedded ERP Workstation"}
          </button>

          <a
            href={activeUrl}
            target="_blank"
            rel="noreferrer"
            className="primary-btn"
            style={{
              padding: "8px 14px",
              fontSize: "12px",
              background: "linear-gradient(120deg, #10b981, #059669)",
              border: "1px solid #059669",
              color: "#ffffff",
              textDecoration: "none"
            }}
          >
            Open Standalone Window <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Server IP Configuration Bar */}
      {showConfig && (
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "10px",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            fontSize: "12px",
            color: "#e2e8f0"
          }}
        >
          <span style={{ fontWeight: 600 }}>ERP Server Address:</span>
          <input
            type="text"
            value={customHost}
            onChange={(e) => setCustomHost(e.target.value)}
            placeholder="http://192.168.1.63:8080"
            style={{
              background: "#1e293b",
              border: "1px solid #475569",
              borderRadius: "6px",
              padding: "6px 12px",
              color: "#ffffff",
              fontSize: "12px",
              width: "240px"
            }}
          />
          <button
            type="button"
            onClick={() => {
              checkHealth(customHost);
              setShowConfig(false);
            }}
            style={{
              background: "#2563eb",
              border: "none",
              color: "#ffffff",
              borderRadius: "6px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Connect
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomHost(DEFAULT_LOCAL);
              checkHealth(DEFAULT_LOCAL);
              setShowConfig(false);
            }}
            style={{
              background: "#334155",
              border: "none",
              color: "#cbd5e1",
              borderRadius: "6px",
              padding: "6px 10px",
              fontSize: "11px",
              cursor: "pointer"
            }}
          >
            Use Localhost (8080)
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomHost(DEFAULT_LAN);
              checkHealth(DEFAULT_LAN);
              setShowConfig(false);
            }}
            style={{
              background: "#334155",
              border: "none",
              color: "#cbd5e1",
              borderRadius: "6px",
              padding: "6px 10px",
              fontSize: "11px",
              cursor: "pointer"
            }}
          >
            Use Office LAN (192.168.1.63)
          </button>
        </div>
      )}

      {/* Standby Banner if server not running */}
      {!serverOnline && (
        <div
          style={{
            background: "rgba(220, 38, 38, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "10px",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            color: "#fca5a5",
            fontSize: "13px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
            <div>
              <strong>ERP Server Standby:</strong> The ERP backend at{" "}
              <code style={{ background: "#1e1b2e", padding: "2px 6px", borderRadius: "4px", color: "#f87171" }}>
                {activeUrl}
              </code>{" "}
              is currently offline or unreachable.
              <div style={{ fontSize: "11px", color: "#e2e8f0", marginTop: "3px" }}>
                👉 On the host PC (Machine28 / Server), double-click <strong>Start Loveneet Business System.bat</strong> on the Desktop to launch localhost and office LAN access.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => checkHealth()}
              style={{
                background: "#2563eb",
                border: "none",
                color: "#ffffff",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer"
              }}
            >
              <RefreshCw size={12} className={loading ? "spin" : ""} /> Retry Check
            </button>
          </div>
        </div>
      )}

      {exportNotice && (
        <div className="notice info" style={{ background: "#172554", borderColor: "#1d4ed8", color: "#93c5fd" }}>
          <CheckCircle2 size={16} color="#60a5fa" />
          <p style={{ margin: 0, fontSize: "12px" }}>{exportNotice}</p>
        </div>
      )}

      {/* Embedded Workstation View */}
      {viewMode === "embedded" && (
        <div
          style={{
            background: "#0c1220",
            border: "1px solid #222f49",
            borderRadius: "14px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 270px)",
            minHeight: "680px"
          }}
        >
          {/* Workstation Header */}
          <div
            style={{
              background: "#11192b",
              borderBottom: "1px solid #202c44",
              padding: "10px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", letterSpacing: "1px" }}>
                WORKSPACE LIVE STREAM:
              </span>
              <div style={{ display: "flex", background: "#0a0f1d", padding: "3px", borderRadius: "8px", border: "1px solid #1e293b" }}>
                <button
                  type="button"
                  onClick={() => setSelectedCompany("PAN_HOMES")}
                  style={{
                    padding: "4px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: "none",
                    background: selectedCompany === "PAN_HOMES" ? "#2563eb" : "transparent",
                    color: selectedCompany === "PAN_HOMES" ? "#ffffff" : "#94a3b8"
                  }}
                >
                  PAN HOMES Matrix
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCompany("ESR")}
                  style={{
                    padding: "4px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: "none",
                    background: selectedCompany === "ESR" ? "#2563eb" : "transparent",
                    color: selectedCompany === "ESR" ? "#ffffff" : "#94a3b8"
                  }}
                >
                  ESR Matrix
                </button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  const ifr = document.getElementById("erp-iframe") as HTMLIFrameElement;
                  if (ifr) ifr.src = ifr.src;
                }}
                style={{
                  background: "transparent",
                  border: "1px solid #283756",
                  color: "#94a3b8",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <RefreshCw size={12} /> Reload ERP
              </button>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                LAN: <code style={{ color: "#38bdf8" }}>{ERP_LAN_URL}</code>
              </span>
            </div>
          </div>

          {/* Iframe View */}
          <iframe
            id="erp-iframe"
            src={ERP_LOCAL_URL}
            title="Loveneet Business System"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
            allow="clipboard-write; fullscreen"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: "#ffffff"
            }}
          />
        </div>
      )}

      {/* Cards & Modules View */}
      {viewMode === "cards" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
          {/* Card 1: PAN HOMES */}
          <div
            style={{
              background: "linear-gradient(145deg, #121a2c, #0d1525)",
              border: "1px solid #23314d",
              borderRadius: "12px",
              padding: "22px",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#38bdf8", letterSpacing: "1px" }}>
                  COMPANY 01
                </span>
                <h3 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                  PAN HOMES Environment
                </h3>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: "#1e293b",
                  color: "#94a3b8"
                }}
              >
                USD Currency
              </span>
            </div>

            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 }}>
              Dedicated product master, dynamic matrix dashboard with hero thumbnails, 37 active Sales Orders, and real-time dispatch tracking.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "auto" }}>
              <a
                href={`${ERP_LOCAL_URL}`}
                target="_blank"
                rel="noreferrer"
                className="primary-btn"
                style={{
                  padding: "8px 10px",
                  fontSize: "11px",
                  justifyContent: "center",
                  textDecoration: "none"
                }}
              >
                Open PAN Matrix <ArrowUpRight size={13} />
              </a>
              <button
                type="button"
                onClick={() => handleExportForCatalog(1, "PAN_HOMES")}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  color: "#e2e8f0",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px"
                }}
              >
                <Download size={13} /> Export for PPT
              </button>
            </div>
          </div>

          {/* Card 2: ESR */}
          <div
            style={{
              background: "linear-gradient(145deg, #121a2c, #0d1525)",
              border: "1px solid #23314d",
              borderRadius: "12px",
              padding: "22px",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#a855f7", letterSpacing: "1px" }}>
                  COMPANY 02
                </span>
                <h3 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                  ESR Environment
                </h3>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: "#1e293b",
                  color: "#94a3b8"
                }}
              >
                INR Currency
              </span>
            </div>

            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 }}>
              Completely isolated product catalog, independent Sales Order sequences, dispatches, 43 embedded master product images, and audit logs.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "auto" }}>
              <a
                href={`${ERP_LOCAL_URL}`}
                target="_blank"
                rel="noreferrer"
                className="primary-btn"
                style={{
                  padding: "8px 10px",
                  fontSize: "11px",
                  justifyContent: "center",
                  textDecoration: "none"
                }}
              >
                Open ESR Matrix <ArrowUpRight size={13} />
              </a>
              <button
                type="button"
                onClick={() => handleExportForCatalog(2, "ESR")}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  color: "#e2e8f0",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px"
                }}
              >
                <Download size={13} /> Export for PPT
              </button>
            </div>
          </div>

          {/* Card 3: Automated 6-Hourly Backup System */}
          <div
            style={{
              background: "linear-gradient(145deg, #121a2c, #0d1525)",
              border: "1px solid #23314d",
              borderRadius: "12px",
              padding: "22px",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#10b981", letterSpacing: "1px" }}>
                  DISASTER RECOVERY
                </span>
                <h3 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                  Automated 6-Hourly Backup
                </h3>
              </div>
              <ShieldCheck size={20} color="#10b981" />
            </div>

            <div style={{ fontSize: "11.5px", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div>• <strong>Schedule:</strong> 12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM</div>
              <div>• <strong>Primary Target:</strong> E:\LOVENEE _D_Drive\LOVENEET_BUSINESS_SYSTEM_BACKUP</div>
              <div>• <strong>Secondary Mirror:</strong> \\server2012\Design Team Location 2\...</div>
              <div>• <strong>Verification:</strong> GZIP Integrity & PostgreSQL manifest verified</div>
            </div>

            <div style={{ marginTop: "auto" }}>
              <a
                href={`${ERP_LOCAL_URL}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "#38bdf8",
                  textDecoration: "none",
                  fontWeight: 600
                }}
              >
                View Backup Logs & Restore Console →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
