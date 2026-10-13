/* Keep each original money counter below CoreWise's fixed 96px Home control. */
(function () {
  'use strict';
  var installed = new WeakSet();
  var screenNames = ['uiMainMenu', 'uiInterface', 'uiFailed', 'uiShop', 'uiCompleted'];
  var moneyTop = 128;
  window.__corewiseChopHopHud = function (app) {
    if (!app || installed.has(app)) return;
    installed.add(app);
    var counters = screenNames.map(function (name) {
      var screen = app.root.findByName(name);
      return screen && screen.findByName('Money');
    }).filter(function (entity) { return entity && entity.element; });
    var lastWidth = -1, lastHeight = -1, lastDeviceWidth = -1, lastDeviceHeight = -1, lastMask = -1;

    function active(entity) {
      for (var ancestor = entity; ancestor; ancestor = ancestor.parent) if (!ancestor.enabled) return false;
      return true;
    }

    function highestCorner(entity) {
      var highest = -Infinity;
      if (entity.element) {
        var corners = entity.element.screenCorners;
        for (var i = 0; i < corners.length; i++) highest = Math.max(highest, corners[i].y);
      }
      // The banknote extends above the pill. Move their shared parent to keep both intact.
      for (var j = 0; j < entity.children.length; j++) highest = Math.max(highest, highestCorner(entity.children[j]));
      return highest;
    }
    function layout() {
      var canvas = app.graphicsDevice.canvas;
      var mask = 0;
      for (var n = 0; n < counters.length; n++) if (active(counters[n])) mask |= 1 << n;
      if (lastWidth === window.innerWidth && lastHeight === window.innerHeight &&
          lastDeviceWidth === app.graphicsDevice.width && lastDeviceHeight === app.graphicsDevice.height && lastMask === mask) return;
      lastWidth = window.innerWidth; lastHeight = window.innerHeight;
      lastDeviceWidth = app.graphicsDevice.width; lastDeviceHeight = app.graphicsDevice.height; lastMask = mask;
      var rect = canvas.getBoundingClientRect();
      if (!rect.height || !app.graphicsDevice.height) return;
      var cssPerPixel = rect.height / app.graphicsDevice.height;
      for (var index = 0; index < counters.length; index++) {
        var entity = counters[index];
        // Disabled screens retain old corner caches until enabled. Leave them untouched meanwhile.
        if (!active(entity)) continue;
        var element = entity.element;
        var corners = element.screenCorners;
        var localScale = entity.getLocalScale().y;
        var cssPerUnit = Math.abs(corners[2].y - corners[0].y) * cssPerPixel / (element.height * localScale);
        if (!Number.isFinite(cssPerUnit) || cssPerUnit <= 0) continue;
        var top = rect.top + rect.height - highestCorner(entity) * cssPerPixel;
        var difference = moneyTop - top;
        if (Math.abs(difference) < 0.1) continue;
        var position = entity.getLocalPosition();
        entity.setLocalPosition(position.x, position.y - difference / cssPerUnit, position.z);
      }
    }
    // Screen scripts change their reference size on enable as well as browser resize.
    app.on('prerender', layout);
    layout();
  };
})();
