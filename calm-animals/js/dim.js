// Brightness and contrast for bright projectors and casting, set from the phone.
// Tap the scene: a "Light" button shows for a few seconds; it opens two sliders.
// The choice is remembered on this device; ?b=0.6&c=1.3 in the link sets it too.
(function () {
  const cv = document.getElementById('c'), q = new URLSearchParams(location.search);
  const KEY = 'calmAnimals.light';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { }
  const set = { b: +(q.get('b') || saved.b || 1), c: +(q.get('c') || saved.c || 1) };

  function apply() {
    cv.style.filter = set.b === 1 && set.c === 1 ? '' : `brightness(${set.b}) contrast(${set.c})`;
    try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) { }
  }

  const css = document.createElement('style');
  css.textContent = `
    #light-btn,#light-panel{position:fixed;right:16px;bottom:16px;z-index:5;font:600 16px system-ui,sans-serif;color:#f2ead8;
      background:#1c1a17;border:2px solid #6b604c;border-radius:14px;transition:opacity .3s}
    #light-btn{padding:12px 18px;cursor:pointer}
    #light-panel{padding:14px 16px;width:min(300px,calc(100vw - 64px))}
    #light-panel label{display:block;margin:4px 0 12px}
    #light-panel input{display:block;width:100%;margin-top:6px;accent-color:#e3b04b;height:28px}
    #light-panel button{font:inherit;color:inherit;background:#2c2924;border:2px solid #6b604c;border-radius:10px;padding:8px 14px;margin-right:8px}
    .light-hidden{opacity:0;pointer-events:none}`;
  document.head.appendChild(css);

  const btn = document.createElement('div');
  btn.id = 'light-btn'; btn.textContent = 'Light'; btn.className = 'light-hidden';
  const panel = document.createElement('div');
  panel.id = 'light-panel'; panel.className = 'light-hidden';
  panel.innerHTML = `
    <label>Brightness <span id="lb"></span><input id="li-b" type="range" min="0.25" max="1.2" step="0.05"></label>
    <label>Contrast <span id="lc"></span><input id="li-c" type="range" min="0.8" max="2" step="0.05"></label>
    <button id="light-reset">Reset</button><button id="light-done">Done</button>`;
  document.body.append(btn, panel);
  const ib = panel.querySelector('#li-b'), ic = panel.querySelector('#li-c');
  const show = () => { panel.querySelector('#lb').textContent = Math.round(set.b * 100) + '%'; panel.querySelector('#lc').textContent = Math.round(set.c * 100) + '%'; ib.value = set.b; ic.value = set.c; };

  // touches on the controls are not a "person" for the animals, and do not toggle full screen
  for (const el of [btn, panel]) for (const ev of ['touchstart', 'touchmove', 'touchend', 'mousemove', 'dblclick', 'keydown'])
    el.addEventListener(ev, e => e.stopPropagation(), { passive: true });

  let timer = 0;
  const hideLater = (el, ms) => { clearTimeout(timer); timer = setTimeout(() => el.classList.add('light-hidden'), ms); };
  cv.addEventListener('pointerdown', () => {
    if (!panel.classList.contains('light-hidden')) return;
    btn.classList.remove('light-hidden'); hideLater(btn, 4000);
  });
  btn.addEventListener('click', () => { btn.classList.add('light-hidden'); show(); panel.classList.remove('light-hidden'); hideLater(panel, 8000); });
  for (const [el, k] of [[ib, 'b'], [ic, 'c']]) el.addEventListener('input', () => { set[k] = +el.value; apply(); show(); hideLater(panel, 8000); });
  panel.querySelector('#light-reset').addEventListener('click', () => { set.b = 1; set.c = 1; apply(); show(); hideLater(panel, 8000); });
  panel.querySelector('#light-done').addEventListener('click', () => { clearTimeout(timer); panel.classList.add('light-hidden'); });
  apply();
})();
