/* CoreWise owns the profile save. Chop Hop keeps its game save in this frame's memory. */
(function () {
  'use strict';
  var embedded = window.parent !== window;
  var origin = window.location.origin;
  var initialized = false, ready = false, paused = false, muted = true, save = null, app = null;
  var nativeTimeout = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
  var timers = new Map(), nextTimer = 1, runningScale = 0.8;
  function post(type, extra) {
    if (embedded) window.parent.postMessage(Object.assign({ type: type }, extra || {}), origin);
  }
  function clone(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }
  function arm(timer) {
    timer.started = performance.now();
    timer.native = nativeTimeout(function () {
      timers.delete(timer.id);
      timer.callback.apply(window, timer.args);
    }, timer.remaining);
  }
  // Scene transitions use browser timers, so freezing the engine alone does not pause them.
  window.setTimeout = function (callback, delay) {
    if (typeof callback !== 'function') return nativeTimeout(callback, delay);
    var timer = { id: 'chop-hop-' + nextTimer++, callback: callback, args: Array.prototype.slice.call(arguments, 2), remaining: Math.max(0, Number(delay) || 0), native: null, started: 0 };
    timers.set(timer.id, timer);
    if (!paused) arm(timer);
    return timer.id;
  };
  window.clearTimeout = function (id) {
    var timer = timers.get(id);
    if (timer) { nativeClear(timer.native); timers.delete(id); }
    else nativeClear(id);
  };
  function settings(next) {
    muted = !!next.muted;
    var shouldPause = !!next.paused;
    if (shouldPause !== paused) {
      paused = shouldPause;
      timers.forEach(function (timer) {
        if (paused) {
          nativeClear(timer.native);
          timer.remaining = Math.max(0, timer.remaining - (performance.now() - timer.started));
        } else arm(timer);
      });
      if (app) {
        if (paused) { runningScale = app.timeScale; app.timeScale = 0; }
        else app.timeScale = runningScale;
      }
    }
    if (app && app.soundManager) app.soundManager.volume = muted || paused ? 0 : 1;
    if (app && paused) app.timeScale = 0;
    if (window.GameAudio && GameAudio.instance) {
      GameAudio.switch(muted || paused);
      GameAudio.switchMusic(muted || paused);
    }
  }
  function flush() {
    if (ready && window.Game && Game.instance) Game.instance.saveGame();
    return clone(save);
  }
  function installRuntime() {
    // store.js has now loaded, but no game script has initialized yet.
    var get = store.get.bind(store), set = store.set.bind(store);
    store.get = function (key) {
      if (key === 'ChopHop_Save') return clone(save);
      if (key === 'SliceMasterCG_Save') return null;
      return get(key);
    };
    store.set = function (key, value) {
      if (key !== 'ChopHop_Save') return set(key, value);
      save = clone(value);
      post('chop-hop:save', { data: clone(save) });
      return value;
    };
    ['onLevelCompleted', 'onGameOver'].forEach(function (method) {
      var original = Game.prototype[method];
      Game.prototype[method] = function () {
        var before = Game.state;
        var result = original.apply(this, arguments);
        if (Game.state !== before) {
          this.saveGame();
          post('chop-hop:round-end');
        }
        return result;
      };
    });
    var initialize = Game.prototype.initialize;
    Game.prototype.initialize = function () {
      var result = initialize.apply(this, arguments);
      app = this.app;
      settings({ muted: muted, paused: paused });
      // Audio and the other entities finish their initialization during this app start.
      nativeTimeout(function () {
        settings({ muted: muted, paused: paused });
        ready = true;
        post('chop-hop:ready');
      }, 0);
      return result;
    };
  }
  function script(name) {
    return new Promise(function (resolve, reject) {
      var element = document.createElement('script');
      element.src = name;
      element.onload = resolve;
      element.onerror = reject;
      document.body.appendChild(element);
    });
  }
  async function boot(data) {
    if (initialized) return;
    initialized = true;
    save = clone(data.save);
    settings({ muted: data.muted, paused: false });
    try {
      await script('playcanvas-stable.min.js');
      await script('__settings__.js');
      await script('__modules__.js');
      await script('__start__.js');
      await script('__loading__.js');
    } catch (error) {
      post('chop-hop:error', { message: 'Chop Hop could not load.' });
      console.error('Chop Hop could not load.', error);
    }
  }
  window.__corewiseChopHop = { flush: flush, installRuntime: installRuntime };
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || event.origin !== origin || !event.data) return;
    if (event.data.type === 'corewise:init') boot(event.data);
    if (event.data.type === 'corewise:settings' && initialized) settings(event.data);
  });
  window.addEventListener('keydown', function (event) {
    if (embedded && (event.key === 'Escape' || event.key === 'Tab')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      post(event.key === 'Escape' ? 'chop-hop:home' : 'chop-hop:controls');
    } else if (paused) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  ['pointerdown', 'mousedown', 'touchstart', 'keyup'].forEach(function (name) {
    window.addEventListener(name, function (event) {
      if (paused) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, { capture: true, passive: false });
  });
  window.addEventListener('pagehide', flush);
  if (embedded) {
    post('chop-hop:init-request');
    function requestInit() { if (!initialized) { post('chop-hop:init-request'); nativeTimeout(requestInit, 500); } }
    nativeTimeout(requestInit, 500);
  } else boot({ save: null, muted: false });
})();
