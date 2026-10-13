import type { AppServices } from '../../app/services';
import type { Scene } from '../../engine/scene';

interface ChopHopWindow extends Window {
  __corewiseChopHop?: { flush(): unknown };
}

/** Keep the game's WebGL canvas and input inside its own document. */
export function createChopHopScene(services: AppServices): Scene {
  let root: HTMLDivElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  let home: HTMLButtonElement | undefined;
  let sound: HTMLButtonElement | undefined;
  let soundImage: HTMLImageElement | undefined;
  let loading: HTMLDivElement | undefined;
  let bag: Record<string, unknown> | undefined;
  let covered = false;
  let lastMuted = services.audio.muted;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function store(data: unknown): void {
    if (!bag || !data || typeof data !== 'object' || Array.isArray(data)) return;
    try {
      const text = JSON.stringify(data);
      if (text.length > 100_000) return;
      bag.save = JSON.parse(text) as Record<string, unknown>;
      services.save.save();
    } catch { /* Keep the last valid save if a child message cannot be copied. */ }
  }

  function flush(): void {
    try { store((frame?.contentWindow as ChopHopWindow | null)?.__corewiseChopHop?.flush()); }
    catch { /* An unfinished load has no game to save yet. */ }
    services.save.flush();
  }

  function settings(): void {
    frame?.contentWindow?.postMessage({
      type: 'corewise:settings',
      muted: services.audio.muted,
      paused: covered || document.hidden,
    }, location.origin);
  }

  function syncSound(): void {
    lastMuted = services.audio.muted;
    if (soundImage) soundImage.src = services.art(`buttons/sound-${lastMuted ? 'off' : 'on'}.webp`);
    sound?.setAttribute('aria-label', lastMuted ? 'Turn sound on' : 'Turn sound off');
    settings();
  }

  function message(event: MessageEvent): void {
    if (!frame || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    switch (data.type) {
      case 'chop-hop:init-request':
        frame.contentWindow?.postMessage({ type: 'corewise:init', save: bag?.save && typeof bag.save === 'object' && !Array.isArray(bag.save) ? bag.save : null, muted: services.audio.muted }, location.origin);
        settings();
        break;
      case 'chop-hop:ready':
        clearTimeout(timer);
        loading?.remove();
        settings();
        if (!covered && !document.hidden) frame.contentWindow?.focus();
        break;
      case 'chop-hop:save': store(data.data); break;
      case 'chop-hop:round-end':
        if (!covered) services.roundBoundary();
        break;
      case 'chop-hop:home':
        if (!covered) { flush(); services.nav.toHub(); }
        break;
      case 'chop-hop:controls':
        if (!covered) home?.focus();
        break;
      case 'chop-hop:error':
        clearTimeout(timer);
        loading?.setAttribute('aria-label', 'Chop Hop could not load. Use Home to try again.');
        if (!covered) home?.focus();
        break;
    }
  }

  function key(event: KeyboardEvent): void {
    if (!root || covered) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      flush(); services.nav.toHub();
    } else if (event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation();
      const buttons = [home, sound];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.shiftKey ? current - 1 : current + 1;
      if (next >= 0 && next < buttons.length) buttons[next]?.focus();
      else frame?.contentWindow?.focus();
    } else if (document.activeElement === home || document.activeElement === sound) {
      // The canvas input listener handles keys globally. Let the DOM button own this press.
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopImmediatePropagation();
        (document.activeElement as HTMLButtonElement).click();
      }
    }
  }

  function button(label: string, path: string, edge: 'left' | 'right', fill: string, press: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.setAttribute('aria-label', label);
    element.style.cssText = `position:absolute;top:12px;${edge}:12px;width:96px;height:96px;border:6px solid #2b2140;border-radius:50%;background:${fill};padding:12px;cursor:pointer;box-shadow:0 5px 0 #2b2140;touch-action:manipulation`;
    const image = document.createElement('img');
    image.src = services.art(path);
    image.alt = '';
    image.draggable = false;
    image.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none';
    element.append(image);
    element.addEventListener('click', () => { void services.audio.unlock(); press(); });
    element.addEventListener('keydown', (event) => event.stopPropagation());
    root?.append(element);
    if (edge === 'right') soundImage = image;
    return element;
  }

  const scene: Scene = {
    enter() {
      bag = services.save.gameData('chop-hop', { save: null });
      covered = false;
      root = document.createElement('div');
      root.dataset.game = 'chop-hop';
      root.style.cssText = 'position:fixed;inset:0;z-index:2;background:#7cc8ff';
      frame = document.createElement('iframe');
      frame.title = 'Chop Hop';
      frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
      // No fullscreen permission: Home and sound must remain available over the game.
      frame.src = `${services.base}games/chop-hop/index.html`;
      root.append(frame);
      loading = document.createElement('div');
      loading.setAttribute('role', 'status');
      loading.setAttribute('aria-label', 'Loading Chop Hop');
      loading.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:#7cc8ff;pointer-events:none';
      const icon = document.createElement('img');
      icon.src = services.art('tiles/chop-hop.webp');
      icon.alt = '';
      icon.style.cssText = 'width:180px;height:180px;object-fit:contain';
      loading.append(icon);
      root.append(loading);
      home = button('Home', 'buttons/home.webp', 'left', '#ff937f', () => { flush(); services.nav.toHub(); });
      sound = button('Turn sound off', 'buttons/sound-on.webp', 'right', '#fff8b2', () => { services.audio.toggleMuted(); syncSound(); });
      window.addEventListener('message', message);
      window.addEventListener('keydown', key, true);
      document.addEventListener('visibilitychange', settings);
      document.body.append(root);
      syncSound();
      timer = setTimeout(() => {
        // Home stays usable if the engine or one of its files fails to load.
        loading?.setAttribute('aria-label', 'Chop Hop could not load. Use Home to try again.');
        home?.focus();
      }, 60_000);
    },
    pause() {
      covered = true;
      settings();
      if (root) root.hidden = true;
      services.canvas.element.focus({ preventScroll: true });
    },
    resume() {
      covered = false;
      if (root) root.hidden = false;
      syncSound();
      frame?.contentWindow?.focus();
    },
    exit() {
      covered = true;
      settings();
      flush();
      clearTimeout(timer);
      window.removeEventListener('message', message);
      window.removeEventListener('keydown', key, true);
      document.removeEventListener('visibilitychange', settings);
      root?.remove();
      root = undefined;
      frame = undefined;
      services.canvas.element.focus({ preventScroll: true });
    },
    update() { if (lastMuted !== services.audio.muted) syncSound(); },
    render({ ctx, width, height }) {
      // The hub's break screen draws over this background while the iframe is paused.
      ctx.fillStyle = '#7cc8ff';
      ctx.fillRect(0, 0, width, height);
    },
  };
  return scene;
}
