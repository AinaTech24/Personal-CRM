/**
 * The Document Picture-in-Picture API: the only way a normal web page can
 * show content in a genuine OS-level window that floats on top of *other
 * applications*, not just other browser tabs — and keeps working even after
 * switching away from the browser entirely. Chromium-only (Chrome, Edge,
 * Brave, Opera); unsupported in Firefox and Safari.
 */

interface DocumentPictureInPicture {
  requestWindow(options: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

export function isDocumentPipSupported(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

/**
 * Opens the floating window and copies over the current page's stylesheets,
 * theme (`data-theme`) and font classes, so content portaled into it still
 * looks right. Returns null if the API isn't available (caller decides how
 * to surface that) or if the browser refuses the request (e.g. not called
 * from a direct user gesture).
 */
export async function openDocumentPip(options: { width: number; height: number }): Promise<Window | null> {
  if (!isDocumentPipSupported()) return null;

  let pip: Window;
  try {
    pip = await window.documentPictureInPicture!.requestWindow(options);
  } catch {
    return null;
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const style = pip.document.createElement("style");
      style.textContent = rules;
      pip.document.head.appendChild(style);
    } catch {
      // A cross-origin stylesheet can't have its rules read — link it
      // instead so the PiP window still picks up its styles.
      if (sheet.href) {
        const link = pip.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        pip.document.head.appendChild(link);
      }
    }
  }

  pip.document.documentElement.className = document.documentElement.className;
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) pip.document.documentElement.setAttribute("data-theme", theme);
  pip.document.body.style.margin = "0";
  pip.document.body.style.height = "100vh";
  pip.document.body.style.overflow = "hidden";

  return pip;
}
