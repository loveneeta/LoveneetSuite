import { isDesktop } from "./platform";

export async function secureDownload(blob: Blob, filename: string): Promise<void> {
  const form = new FormData();
  form.append("file", blob, filename);
  const backendBaseUrl = import.meta.env.VITE_API_BASE_URL ||
    (isDesktop() ? "http://127.0.0.1:8000" : window.location.origin);
  const watermarkUrl = new URL("/api/output/watermark", backendBaseUrl);
  const response = await fetch(watermarkUrl.toString(), {
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
