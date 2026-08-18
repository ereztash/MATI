/**
 * Hands a JSON file to the browser as a download.
 *
 * The anchor is attached to the document before the click and the object URL
 * is revoked on a later task: Firefox cancels downloads started from a
 * detached anchor, and revoking synchronously after click() can abort the
 * transfer before it begins.
 */
export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
