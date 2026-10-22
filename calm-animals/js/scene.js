// Calm savannah scene: herds walk across at three depths, slowing down and looking up when a
// person comes near. People = mouse/touch now; Kinect later via setPeople().
// Day and night take turns slowly; ?night=1 or ?night=0 holds one, the N key flips it.
(function () {
  const cv = document.getElementById('c'), cx = cv.getContext('2d');
  const q = new URLSearchParams(location.search);
  const { Giraffe, Zebra } = Hoofed;
  Giraffe.WIDTH = 380; Zebra.WIDTH = 300;
  let W = 0, H = 0, unit = 1;       // unit = screen pixels per animal unit at the elephants' depth

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);   // soft painted paper does not need full sharpness; this keeps it smooth
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';   // exactly the visible window (100vh hides the bottom behind a phone's address bar)
    unit = Math.min(H * 0.30 / 420, W * 0.26 / 450);
  }
  addEventListener('resize', resize); resize();
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);

  // full screen (for casting the tab to a TV/projector): F key or double-click/double-tap
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  }
  addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') fullscreen(); });
  addEventListener('dblclick', fullscreen);
  // hide the mouse pointer when it stops moving, so it does not sit on the cast/projected picture
  let hideTimer = 0;
  addEventListener('mousemove', () => { cv.style.cursor = ''; clearTimeout(hideTimer); hideTimer = setTimeout(() => { cv.style.cursor = 'none'; }, 2000); });

  // people: screen x positions; mouse and every touch count as one person each
  let pointerPeople = [], kinectPeople = null;
  window.setPeople = xs => { kinectPeople = xs; };          // for the Kinect hook-up
  const fromTouches = e => { pointerPeople = [...e.touches].map(t => t.clientX); };
  addEventListener('mousemove', e => { pointerPeople = [e.clientX]; });
  addEventListener('mouseleave', () => { pointerPeople = []; });
  addEventListener('touchstart', fromTouches, { passive: true });
  addEventListener('touchmove', fromTouches, { passive: true });
  addEventListener('touchend', fromTouches, { passive: true });

  const CALM = 0.7;                                 // all walking runs at this share of normal speed

  // day/night: 0 = day, 1 = night
  const CYCLE = 240, DAY = 110, FADE = 20;          // seconds: day, fade, night, fade
  let forced = q.has('night') ? +q.get('night') : null, night = forced ?? 0;
  addEventListener('keydown', e => { if (e.key === 'n' || e.key === 'N') forced = night > 0.5 ? 0 : 1; });
  function nightTarget(t) {
    if (forced !== null) return forced;
    const c = t % CYCLE;
    if (c < DAY) return 0;
    if (c < DAY + FADE) return (c - DAY) / FADE;
    if (c < CYCLE - FADE) return 1;
    return 1 - (c - (CYCLE - FADE)) / FADE;
  }

  // a herd walks together: lane = ground line (share of H), depth = size against the elephants,
  // dir = 1 walks right, -1 walks left; start = where it begins (share of W)
  function herd(Kind, lane, depth, dir, start, members) {
    return { Kind, lane, depth, dir, start, speed: 1, x: null, members: members.map(([size, dx]) => ({ a: new Kind(size), dx })) };
  }
  const herds = [
    herd(Giraffe, 0.80, 0.62, 1, 0.30, [[1, 0], [0.62, 300]]),
    herd(Elephant, 0.875, 1, 1, -0.6, [[1, 0], [0.58, 600]]),
    herd(Zebra, 0.968, 0.95, -1, 0.55, [[1, 0], [0.9, 270], [0.6, 520]])
  ];
  const span = h => Math.max(...h.members.map(m => m.dx + h.Kind.WIDTH * m.a.size)) * unit * h.depth;
  const dxStart = q.has('dx') ? +q.get('dx') : null;      // for checks: every herd starts at this x

  const img = new Image();
  img.onload = async () => {
    Elephant.setup(img, cx);
    await Promise.all([Scenery.setup(cx), Hoofed.setup(cx), Critters.setup()]);
    for (const h of herds) h.x = dxStart ?? h.start * W;
    last = performance.now();
    requestAnimationFrame(frame);
  };
  img.src = 'parts/A_papercut/piece_1.png';

  function step(h, dt, people) {
    const u = unit * h.depth;
    let near = 0;
    for (const m of h.members) {
      const c = h.x + (m.dx + h.Kind.WIDTH * m.a.size / 2) * u;
      for (const px of people) near = Math.max(near, 1 - Math.abs(px - c) / (W * 0.25));
    }
    near = Math.max(0, near);
    h.speed += ((1 - 0.85 * near) - h.speed) * Math.min(1, dt * 2.5);
    h.x += dt * h.Kind.speed() * u * h.speed * h.dir;
    const sp = span(h);
    if (h.dir > 0 && h.x > W + 40) h.x = -sp - 200;
    if (h.dir < 0 && h.x + sp < -40) h.x = W + 200;
    for (const m of h.members) m.a.update(dt, h.speed, near);
  }

  function drawHerd(h) {
    const u = unit * h.depth, gy = H * h.lane;
    cx.save();
    if (h.dir < 0) { const mid = h.x + span(h) / 2; cx.translate(mid, 0); cx.scale(-1, 1); cx.translate(-mid, 0); }
    for (const m of h.members) m.a.draw(cx, h.x + m.dx * u, gy, u);
    cx.restore();
  }

  // ?perf=1: time each drawing step into window.PERF (read by tools/perf.mjs)
  const perf = q.has('perf');
  window.PERF = {}; window.PERF_RESET = () => { window.PERF = {}; };
  function T(name, fn) {
    if (!perf) return fn();
    const t0 = performance.now(); fn(); cx.getImageData(0, 0, 1, 1);   // read-back forces the GPU to finish
    const s = window.PERF[name] || (window.PERF[name] = { t: 0, n: 0 }); s.t += performance.now() - t0; s.n++;
  }

  let last = 0, clock = +(q.get('t') || 0);
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    const people = kinectPeople || pointerPeople;
    const tgt = nightTarget(clock);
    night += (tgt - night) * Math.min(1, forced !== null ? dt * 1.5 : 1);
    for (const h of herds) step(h, dt * CALM, people);
    if (window.Sound) Sound.setNight(night);

    // land first (on a cleared canvas), back to front; then the sky is slid in behind it
    cx.clearRect(0, 0, W, H);
    T('hills', () => Scenery.hills(cx, W, H, night));
    T('band0', () => Scenery.band(cx, W, H, clock, 0, night, people));
    T('plantsFar', () => Scenery.plants(cx, W, H, clock, 'far', people, night));
    T('band1', () => Scenery.band(cx, W, H, clock, 1, night, people));
    T('plantsMid', () => Scenery.plants(cx, W, H, clock, 'mid', people, night));
    T('resting', () => Critters.resting(cx, W, H, clock, people));
    T('giraffes', () => drawHerd(herds[0]));
    T('elephants', () => drawHerd(herds[1]));
    T('band2', () => Scenery.band(cx, W, H, clock, 2, night, people));
    T('zebras', () => drawHerd(herds[2]));
    T('plantsFront', () => Scenery.plants(cx, W, H, clock, 'front', people, night));
    T('nightTint', () => Scenery.nightTint(cx, W, H, night));
    T('sky', () => Scenery.skyBehind(cx, W, H, clock, night));
    T('flying', () => Critters.flying(cx, W, H, clock, dt, night, people));
    T('fireflies', () => Scenery.fireflies(cx, W, H, clock, night));
    requestAnimationFrame(frame);
  }
})();
