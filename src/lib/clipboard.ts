/**
 * Copies text produced by an async function (typically one that hits the
 * network first, e.g. to rotate a link server-side before copying it) in a
 * way that still counts as triggered by the click that started it.
 *
 * `await producer(); await navigator.clipboard.writeText(...)` loses that
 * connection to the click the moment the first `await` runs — stricter
 * browsers (Safari in particular) then silently refuse the write, since by
 * the time it happens the "this came directly from a user gesture" signal
 * has expired. Passing the still-pending promise to a `ClipboardItem`
 * instead keeps the `.write()` call itself synchronous, which is what
 * those browsers actually check; the content is allowed to resolve later.
 * Falls back to a plain write where `ClipboardItem` isn't available (older
 * Firefox) — that still works in the more lenient browsers, just not in
 * the strict ones this exists for.
 */
export async function copyTextFromAsync(producer: () => Promise<string>): Promise<string> {
  if (typeof window !== "undefined" && "ClipboardItem" in window) {
    const textPromise = producer();
    await navigator.clipboard.write([
      new ClipboardItem({ "text/plain": textPromise.then((text) => new Blob([text], { type: "text/plain" })) }),
    ]);
    return textPromise;
  }
  const text = await producer();
  await navigator.clipboard.writeText(text);
  return text;
}
