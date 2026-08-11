import type jsPDFCtor from "jspdf";

type JsPdfInstance = InstanceType<typeof jsPDFCtor>;

// A4 at 96dpi.
const A4_W = 794;
const A4_H = 1123;

/** Renders a full HTML document into an offscreen iframe and waits for its images. */
async function renderToIframe(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${A4_W}px`;
  iframe.style.height = `${A4_H}px`;
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for layout + fonts + images.
  await new Promise<void>((resolve) => {
    const imgs = Array.from(doc.images);
    let pending = imgs.filter((i) => !i.complete).length;
    if (pending === 0) return resolve();
    const done = () => { if (--pending <= 0) resolve(); };
    imgs.forEach((i) => {
      if (i.complete) return;
      i.addEventListener("load", done);
      i.addEventListener("error", done);
    });
    // Safety timeout.
    setTimeout(() => resolve(), 3000);
  });

  return iframe;
}

/**
 * Rasterizes an HTML document to a multi-page A4 jsPDF instance — no print
 * dialog, no server round-trip. The caller decides what to do with it:
 * `.save(filename)` to download, or `.output("bloburl")` to preview it
 * (e.g. in an iframe) without ever writing it to disk.
 */
export async function htmlToPdf(html: string): Promise<JsPdfInstance> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const iframe = await renderToIframe(html);
  try {
    const body = iframe.contentDocument!.body;
    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: A4_W,
      width: A4_W,
      height: Math.max(A4_H, body.scrollHeight),
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;

    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    if (imgH <= pageH + 1) {
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, imgH);
    } else {
      // Taller than one page — slice across pages.
      let remaining = imgH;
      let position = 0;
      while (remaining > 0) {
        pdf.addImage(imgData, "JPEG", 0, position, pageW, imgH);
        remaining -= pageH;
        if (remaining > 0) {
          pdf.addPage();
          position -= pageH;
        }
      }
    }

    return pdf;
  } finally {
    document.body.removeChild(iframe);
  }
}

/** Rasterizes the document HTML to a multi-page A4 PDF and triggers a download — no print dialog. */
export async function downloadHtmlAsPdf(html: string, filename: string) {
  const pdf = await htmlToPdf(html);
  pdf.save(filename);
}
