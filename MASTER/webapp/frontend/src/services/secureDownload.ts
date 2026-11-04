export async function secureDownload(blob: Blob, filename: string): Promise<void> {
  const form = new FormData();
  form.append("file", blob, filename);
  const configuredBackendUrl = localStorage.getItem("loveneet_erp_url");
  const backendBaseUrl = (configuredBackendUrl || (window.location.protocol === "file:" ? "http://localhost:8080" : window.location.origin)).replace(/\/+$/, "");
  const response = await fetch(`${backendBaseUrl}/api/output/watermark`, {
    method: "POST",
    body: form,
    credentials: "include"
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "The server could not apply the required output watermark.");
  }
  const watermarked = await response.blob();
  const url = URL.createObjectURL(watermarked);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
