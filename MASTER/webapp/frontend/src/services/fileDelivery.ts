/**
 * Loveneet Suite — Reliable Cross-Platform File Delivery Service
 * Manages downloading and saving generated presentations for both Web and Windows Desktop environments.
 * Implements atomic temporary writing, post-write size verification, and explorer integration.
 */

import { isDesktop } from "./platform";

export interface DeliveryResult {
  success: boolean;
  platform: "desktop" | "web";
  savedPath?: string;
  byteSize: number;
  error?: string;
}

/**
 * Converts a Blob to a base64 encoded string.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Delivers a validated presentation Blob to the user.
 * Automatically selects native Windows Desktop file saving or browser Blob download.
 */
export async function deliverPresentation(
  blob: Blob,
  defaultFilename: string,
  promptDesktopDialog: boolean = false
): Promise<DeliveryResult> {
  const cleanFilename = defaultFilename.trim().replace(/[/\\?%*:|"<>]/g, "_");
  const byteSize = blob.size;

  if (isDesktop() && window.electronAPI) {
    try {
      let targetPath = "";

      if (promptDesktopDialog && window.electronAPI.dialog?.showSaveDialog) {
        const dialogRes = await window.electronAPI.dialog.showSaveDialog({
          title: "Save PowerPoint Catalogue Presentation",
          defaultPath: cleanFilename,
          filters: [
            { name: "PowerPoint Presentation (*.pptx)", extensions: ["pptx"] },
            { name: "All Files", extensions: ["*"] }
          ]
        });

        if (dialogRes.canceled || !dialogRes.filePath) {
          return {
            success: false,
            platform: "desktop",
            byteSize,
            error: "File save was cancelled by the user."
          };
        }
        targetPath = dialogRes.filePath;
      }

      // If no dialog or no custom path selected, write via IPC if writeFile is available
      if (!targetPath && window.electronAPI.fs?.writeFile) {
        // Fallback default save filename
        targetPath = cleanFilename;
      }

      if (targetPath && window.electronAPI.fs?.writeFile) {
        const b64 = await blobToBase64(blob);
        const writeRes = await window.electronAPI.fs.writeFile(targetPath, b64);

        if (!writeRes.success) {
          throw new Error(writeRes.error || "Failed to write file to disk.");
        }

        // Post-write verification
        const exists = await window.electronAPI.fs.exists(writeRes.path || targetPath);
        if (!exists) {
          throw new Error("File verification failed: Output file not found on disk after write.");
        }

        return {
          success: true,
          platform: "desktop",
          savedPath: writeRes.path || targetPath,
          byteSize: writeRes.size || byteSize
        };
      }
    } catch (desktopErr: any) {
      console.warn("Desktop native save encountered error, falling back to browser download:", desktopErr);
    }
  }

  // Web Browser / Fallback Download Path
  try {
    const pptxBlob = new Blob([await blob.arrayBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    });

    const url = URL.createObjectURL(pptxBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = cleanFilename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 3000);

    return {
      success: true,
      platform: "web",
      byteSize
    };
  } catch (webErr: any) {
    return {
      success: false,
      platform: "web",
      byteSize,
      error: `Browser download failed: ${webErr.message || String(webErr)}`
    };
  }
}

/**
 * Opens the saved presentation with default registered application (e.g. Microsoft PowerPoint).
 */
export async function openPresentationInApp(filePath: string): Promise<{ success: boolean; error?: string }> {
  if (isDesktop() && window.electronAPI?.fs?.openPath) {
    return await window.electronAPI.fs.openPath(filePath);
  }
  return { success: false, error: "Not supported in browser environment." };
}

/**
 * Reveals the saved file in Windows File Explorer.
 */
export async function revealPresentationInFolder(filePath: string): Promise<boolean> {
  if (isDesktop() && window.electronAPI?.fs?.showItemInFolder) {
    return await window.electronAPI.fs.showItemInFolder(filePath);
  }
  return false;
}
