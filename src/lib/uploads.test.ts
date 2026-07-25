import { describe, expect, it } from "vitest";
import { saveTaskAttachment, mimeTypeFor, UploadValidationError, MAX_UPLOAD_BYTES } from "./uploads";

function fileOf(bytes: number[], name: string) {
  return new File([new Uint8Array(bytes)], name);
}

describe("saveTaskAttachment — magic-byte validation", () => {
  it("accepts a file whose bytes match its claimed extension", async () => {
    const pdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]; // "%PDF-1.4"
    const result = await saveTaskAttachment("task1", fileOf(pdfBytes, "report.pdf"));
    expect(result.fileName).toBe("report.pdf");
    expect(Buffer.from(result.data, "base64").equals(Buffer.from(pdfBytes))).toBe(true);
  });

  it("rejects a file renamed to look like a PDF but holding different bytes", async () => {
    const notPdf = [0x4d, 0x5a, 0x90, 0x00]; // MZ header (a Windows executable)
    await expect(saveTaskAttachment("task1", fileOf(notPdf, "totally-a.pdf"))).rejects.toThrow(
      UploadValidationError
    );
  });

  it("rejects a mismatched image extension the same way", async () => {
    const jpegBytes = [0xff, 0xd8, 0xff, 0xe0];
    await expect(saveTaskAttachment("task1", fileOf(jpegBytes, "photo.png"))).rejects.toThrow(
      UploadValidationError
    );
  });

  it("doesn't block extensions with no known signature (e.g. .txt)", async () => {
    const result = await saveTaskAttachment("task1", fileOf([0x68, 0x69], "notes.txt"));
    expect(result.fileName).toBe("notes.txt");
  });

  it("rejects a file over the shared size ceiling", async () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    const file = new File([big], "huge.txt");
    await expect(saveTaskAttachment("task1", file)).rejects.toThrow(UploadValidationError);
  });
});

describe("mimeTypeFor", () => {
  it("maps known extensions to their MIME type", () => {
    expect(mimeTypeFor("a.pdf")).toBe("application/pdf");
    expect(mimeTypeFor("a.PNG")).toBe("image/png");
  });

  it("falls back to octet-stream for anything unrecognized", () => {
    expect(mimeTypeFor("a.exe")).toBe("application/octet-stream");
    expect(mimeTypeFor("noextension")).toBe("application/octet-stream");
  });
});
