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

  const ERP_LOCAL_URL = "http://localhost:8080";
  const ERP_LAN_URL = "http://192.168.1.63:8080";

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

  // Check health of ERP server
  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${ERP_LOCAL_URL}/api/v1/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        setServerOnline(true);
        setMetrics(data);
      } else {
        setServerOnline(false);
      }
    } catch (err) {
      // In web browser (cross-origin or offline), try reachability
      try {
        await fetch(`${ERP_LOCAL_URL}/api/v1/health`, { mode: 'no-cors' });
        setServerOnline(true);
      } catch {
        setServerOnline(false);
      }
    } finally {
      setLoading(false);
    }
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
                {serverOnline ? "ERP Active · Port 8080" : "Server Connecting / Standby"}
              </span>
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
            href={ERP_LOCAL_URL}
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
