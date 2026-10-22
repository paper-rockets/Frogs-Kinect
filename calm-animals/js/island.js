// Island version: the savannah ground is cut to a soft wobbly island floating on pure black,
// so a projector lights only the island. Trees and animals stand on it and stick up into the black.
// Used by island.html: Scenery cuts its cached ground with Island.cut, scene.js clips the front plants with Island.clip, fades animals with Island.fade
// and calls Island.finish last; Scenery squeezes plants inward with Island.SQUEEZE.
(function () {
  const SQUEEZE = 0.86;                       // plants move this much towards the middle so they stand on the island

  // island outline: rounded sides that bulge out, rounded bottom corners, top just above the hills
  function outline(W, H) {
    const cx = W * 0.5, cy = H * 0.72, rx = W * 0.475, up = H * 0.31, down = H * 0.265, pts = [];
    for (let k = 0; k < 160; k++) {
      const a = k / 160 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // slow wobble so no edge is straight
      const wob = 1 + 0.018 * Math.sin(a * 3 + 0.7) + 0.012 * Math.sin(a * 7 + 2.1) + 0.006 * Math.sin(a * 13 + 4.0);
      const x = cx + rx * wob * Math.sign(c) * Math.abs(c) ** 0.7;
      const y = cy + (s < 0 ? up : down) * wob * Math.sign(s) * Math.abs(s) ** 0.6;
      pts.push([x, y]);
    }
    return pts;
  }

  function path(cx, pts, dy = 0) {
    cx.beginPath();
    // smooth curve through the midpoints, so the wobble has no corners
    const n = pts.length, mid = i => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2 + dy];
    cx.moveTo(...mid(n - 1));
    for (let i = 0; i < n; i++) { const m = mid(i); cx.quadraticCurveTo(pts[i][0], pts[i][1] + dy, m[0], m[1]); }
    cx.closePath();
  }

  // outline points and each screen row's left/right edge, made once per screen size
  let cache = null;
  function shape(W, H) {
    const key = W + 'x' + H;
    if (cache && cache.key === key) return cache;
    const pts = outline(W, H), rows = [];
    for (let y = 0; y < H; y += 4) {
      let l = W, r = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y) === (y1 <= y)) continue;
        const x = x0 + (x1 - x0) * (y - y0) / (y1 - y0); l = Math.min(l, x); r = Math.max(r, x);
      }
      rows.push([l, r]);
    }
    return (cache = { key, pts, rows, u: null });
  }

  // underside: the shape a little lower minus the shape itself, only the bottom strip (from TOP down)
  const TOP = 0.7;
  function underside(W, H, dpr, n) {
    const m = shape(W, H), key = dpr + ':' + n;
    if (m.u && m.u.key === key) return m.u.c;
    const c = m.u ? m.u.c : document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * (1 - TOP) * dpr);
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, -H * TOP * dpr);
    g.fillStyle = 'rgb(' + mix([110, 82, 46], [30, 38, 86], n) + ')';
    path(g, m.pts, H * 0.02); g.fill();
    g.globalCompositeOperation = 'destination-out'; path(g, m.pts); g.fill();
    m.u = { key, c };
    return c;
  }

  // draw the ground (fn) clipped to the island
  function clip(cx, W, H, fn) {
    const m = shape(W, H);
    cx.save(); path(cx, m.pts); cx.clip(); fn(); cx.restore();
  }

  // cut a cached ground picture (drawn in screen units) to the island
  function cut(g, W, H) {
    const m = shape(W, H);
    g.save(); g.globalCompositeOperation = 'destination-in'; path(g, m.pts); g.fill(); g.restore();
  }

  // 0..1: how much of a thing at screen x on ground row y is on the island (fades out over the edge)
  function fade(x, y, W, H) {
    const m = shape(W, H), row = m.rows[Math.max(0, Math.min(m.rows.length - 1, Math.round(y / 4)))];
    if (!row || row[1] <= row[0]) return 0;
    const inside = Math.min(x - row[0], row[1] - x), soft = W * 0.05;
    return Math.max(0, Math.min(1, (inside + soft * 0.3) / soft));
  }

  function mix(a, b, k) { return a.map((v, i) => Math.round(v + (b[i] - v) * k)); }

  // last: earth underside below the island, small sun or moon, black everywhere else
  function finish(cx, W, H, t, n, Scenery) {
    const nq = Math.round(n * 40) / 40;                 // the underside is redrawn only when night changes
    cx.globalCompositeOperation = 'destination-over';
    cx.drawImage(underside(W, H, cx.getTransform().a, nq), 0, H * TOP, W, H * (1 - TOP));
    cx.globalCompositeOperation = 'source-over';
    Scenery.smallSky(cx, W, H, t, n);
    cx.globalCompositeOperation = 'destination-over';
    cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = 'source-over';
  }

  window.Island = { SQUEEZE, clip, cut, fade, finish };
})();
