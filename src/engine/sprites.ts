/**
 * Image loading and a cache of pre-scaled offscreen canvases.
 *
 * Drawing a scaled image every frame makes the browser resample it every
 * frame. Rendering it once into an offscreen canvas at the needed scale and
 * blitting that is far cheaper on an integrated GPU.
 */

export interface SpriteStore {
  /** Fetch and decode an image. Resolves to the same promise on repeat calls. */
  load(name: string, url: string): Promise<HTMLImageElement>;
  /** Load many at once: { name: url }. Resolves when every load has settled; missing files warn and are skipped. */
  loadAll(map: Record<string, string>): Promise<void>;
  /** Decoded image, or undefined if not loaded. */
  get(name: string): HTMLImageElement | undefined;
  /**
   * Offscreen canvas holding the image drawn at `scale` times `pixelRatio`.
   * Created on first request. Draw it at `canvas.width / pixelRatio` logical px.
   */
  scaled(name: string, scale: number): HTMLCanvasElement | undefined;
  /** Device pixel ratio the scaled cache renders at. Default 1. Changing it clears the cache. */
  readonly pixelRatio: number;
  setPixelRatio(ratio: number): void;
  /** Drop cached scaled versions (for example after a resize changes the scale in use). */
  clearScaled(name?: string): void;
}

/** Round so tiny float differences do not create near-duplicate caches. */
function scaleKey(scale: number): number {
  return Math.round(scale * 1000);
}

export function createSpriteStore(): SpriteStore {
  const images = new Map<string, HTMLImageElement>();
  const pending = new Map<string, Promise<HTMLImageElement>>();
  const scaledCache = new Map<string, Map<number, HTMLCanvasElement>>();
  let pixelRatio = 1;

  function load(name: string, url: string): Promise<HTMLImageElement> {
    const existing = pending.get(name);
    if (existing) return existing;
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        images.set(name, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load sprite "${name}" from ${url}`));
      img.src = url;
    });
    pending.set(name, p);
    return p;
  }

  return {
    load,
    async loadAll(map) {
      const results = await Promise.allSettled(Object.entries(map).map(([name, url]) => load(name, url)));
      for (const r of results) if (r.status === 'rejected') console.warn(String(r.reason));
    },
    get: (name) => images.get(name),
    get pixelRatio() {
      return pixelRatio;
    },
    setPixelRatio(ratio) {
      if (ratio === pixelRatio) return;
      pixelRatio = ratio;
      scaledCache.clear();
    },
    scaled(name, scale) {
      const key = scaleKey(scale);
      let perName = scaledCache.get(name);
      const cached = perName?.get(key);
      if (cached) return cached;
      const img = images.get(name);
      if (!img) return undefined;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale * pixelRatio));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale * pixelRatio));
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (!perName) {
        perName = new Map();
        scaledCache.set(name, perName);
      }
      perName.set(key, canvas);
      return canvas;
    },
    clearScaled(name) {
      if (name === undefined) {
        scaledCache.clear();
        return;
      }
      scaledCache.delete(name);
    },
  };
}
