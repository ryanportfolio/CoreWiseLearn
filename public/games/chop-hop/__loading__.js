/* study: Chop Hop loading screen (mods/loading.mjs) */
pc.script.createLoadingScreen(function (app) {
  var U = {"bg":"files/study/loading/bg.webp","logo":"files/study/loading/logo.webp"}, LINES = ["Hopping in...","Sharpening the foam sword...","Almost ready to chop!"];
  var root = document.createElement('div');
  root.id = 'preloaderContainer';
  root.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#7cc8ff;z-index:10';
  function img(src, css, id) { var i = new Image(); i.decoding = 'async'; i.src = src; i.style.cssText = css; if (id) i.id = id; root.appendChild(i); return i; }
  var cover = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
  /* the grey copy underneath, the colored copy wiping in from the left as the game loads */
  img(U.bg, cover + 'filter:grayscale(.9) brightness(1.08) contrast(.9)');
  var color = img(U.bg, cover + 'clip-path:inset(0 100% 0 0)', 'img_loadingbaroverlay');
  if (U.logo) img(U.logo, 'position:absolute;left:50%;top:38%;height:34vh;max-width:86vw;object-fit:contain;transform:translate(-50%,-50%);filter:drop-shadow(0 .6vh 1.2vh rgba(0,0,0,.25))');
  /* heavy white text with a soft dark edge, readable over any part of the picture */
  var lines = LINES.map(function (t, i) {
    var d = document.createElement('div');
    d.textContent = t;
    d.style.cssText = 'position:absolute;left:0;right:0;top:82%;transform:translateY(-50%);text-align:center;padding:0 4vw;' +
      'font:900 clamp(18px,3.6vh,40px)/1.1 "Arial Rounded MT Bold","Arial Black","Trebuchet MS",system-ui,sans-serif;letter-spacing:.02em;' +
      'color:#fff;text-shadow:0 .25vh 0 rgba(0,0,0,.28),0 0 1.2vh rgba(40,20,60,.55);transition:opacity 1s;opacity:' + (i ? 0 : 1);
    root.appendChild(d);
    return d;
  });
  document.body.appendChild(root);
  var k = 0, timer = setInterval(function () { lines[k].style.opacity = 0; k = (k + 1) % lines.length; lines[k].style.opacity = 1; }, 3500);
  var target = 0, shown = 0, raf = 0;
  function step() { shown += (target - shown) * 0.08; color.style.clipPath = 'inset(0 ' + (100 - shown).toFixed(2) + '% 0 0)'; raf = requestAnimationFrame(step); }
  raf = requestAnimationFrame(step);
  app.on('preload:progress', function (v) { target = Math.min(1, Math.max(0, v)) * 100; });
  app.on('preload:end', function () { app.off('preload:progress'); });
  /* fade out once the game starts, then remove everything */
  app.on('start', function () { root.style.transition = 'opacity .4s'; root.style.opacity = 0; setTimeout(function () { cancelAnimationFrame(raf); clearInterval(timer); root.remove(); }, 450); });
});
