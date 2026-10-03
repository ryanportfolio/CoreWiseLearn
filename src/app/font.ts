/** Load the bundled font before any scene bakes text into a canvas. */
let pending: Promise<void> | undefined;
export function ensureDisplayFont(): Promise<void> {
  if (!pending) {
    pending = (async () => {
      if (!('fonts' in document)) return;
      const font = new FontFace('Andika', `url(${import.meta.env.BASE_URL}fonts/Andika-Regular.ttf)`);
      try {
        await font.load();
        document.fonts.add(font);
        await document.fonts.load('56px Andika');
      } catch (error) {
        // Keep offline recovery playable when an interrupted first install lacks a font.
        console.warn('Bundled display font unavailable; using system fallback.', error);
      }
    })();
  }
  return pending;
}
