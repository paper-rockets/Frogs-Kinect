// Savannah scenery from the Codex cut-outs: sky, hills, wavy paper ground bands, plants. Day and night.
// x is a share of W; plant heights are a share of S = min(H, 0.62 W) so an upright tablet is not crowded.
(function () {
  const P = 'parts/';
  const SET1 = P + 'plants_day_set_1/piece_', SET2 = P + 'plants_day_set_2/piece_', SKY = P + 'sky_pieces_large/piece_';

  // ground bands, back to front: top edge (share of H), wave size, day and night paper colour
  const BANDS = [
    { top: 0.668, amp: 0.010, ph: 0.3, day: '#a7ad69', night: '#33478f' },
    { top: 0.758, amp: 0.014, ph: 1.9, day: '#cfbe6a', night: '#4459a6' },
    { top: 0.905, amp: 0.012, ph: 4.1, day: '#e8c56c', night: '#5468b4' }
  ];
  // painted pieces from the owner's sheets (from_codex/new/sheetN.png, cut into parts/newN)
  const N2 = P + 'new2/piece_', N4 = P + 'new4/piece_', N6 = P + 'new6/piece_';
  // plants standing on a band (off = how far below the band edge, share of H), or at a fixed base
  const PLANTS = [
    { f: N4 + 24, nf: N6 + 14, x: 0.52, band: 0, off: 0.006, h: 0.06, sway: 0, layer: 'far' },       // far tree clump on the horizon
    { f: N4 + 0, nf: N6 + 0, x: 0.10, band: 0, off: 0.016, h: 0.36, sway: 0.005, layer: 'far' },    // big acacia
    { f: N4 + 3, nf: N6 + 5, x: 0.35, band: 0, off: 0.010, h: 0.17, sway: 0.006, layer: 'far' },    // acacia
    { f: N2 + 9, nf: N6 + 11, x: 0.66, band: 0, off: 0.008, h: 0.11, sway: 0.006, layer: 'far' },    // small acacia
    { f: N4 + 2, dim: true, x: 0.87, band: 0, off: 0.016, h: 0.30, sway: 0.004, layer: 'far' },    // baobab
    { f: N2 + 34, x: 0.80, band: 1, off: 0.060, h: 0.095, sway: 0, layer: 'mid', pond: true },   // waterhole
    { f: N2 + 29, dim: true, x: 0.665, band: 1, off: 0.040, h: 0.13, sway: 0.03, layer: 'mid' },   // reeds by the water
    { f: N2 + 33, dim: true, x: 0.955, band: 1, off: 0.055, h: 0.11, sway: 0.03, layer: 'mid' },
    { f: N4 + 9, nf: N6 + 21, x: 0.20, band: 1, off: 0.024, h: 0.08, sway: 0.010, layer: 'mid' },    // bushes
    { f: N4 + 23, nf: N6 + 17, x: 0.29, band: 1, off: 0.030, h: 0.06, sway: 0.012, layer: 'mid' },
    { f: N4 + 11, nf: N6 + 16, x: 0.56, band: 1, off: 0.022, h: 0.07, sway: 0.010, layer: 'mid' },
    { f: N4 + 18, nf: N6 + 25, x: 0.45, band: 1, off: 0.024, h: 0.05, sway: 0, layer: 'mid' },       // rock
    { f: N2 + 44, nf: N6 + 22, x: 0.03, base: 1.02, h: 0.15, sway: 0.03, layer: 'front' },           // front plants and rocks
    { f: N4 + 17, nf: N6 + 24, x: 0.15, base: 0.995, h: 0.06, sway: 0, layer: 'front' },
    { f: N4 + 14, nf: N6 + 18, x: 0.34, base: 1.02, h: 0.12, sway: 0.04, layer: 'front' },
    { f: N4 + 21, nf: N6 + 26, x: 0.57, base: 0.995, h: 0.05, sway: 0, layer: 'front' },
    { f: N2 + 40, nf: N6 + 15, x: 0.74, base: 1.02, h: 0.15, sway: 0.03, layer: 'front' },
    { f: N4 + 12, dim: true, x: 0.965, base: 1.02, h: 0.13, sway: 0.04, layer: 'front' }
  ];
  const DAY_CLOUDS = [N4 + 26, N4 + 27, N4 + 28, N4 + 26, N4 + 28];
  const SUN = N4 + 25, MOON = N6 + 9;
  const STARS = [1, 2, 3, 4, 6, 27, 28, 29, 30, 31].map(i => N6 + i), DOTS = [14, 15, 16, 17, 19, 20].map(i => SKY + i);
  const GRASS = [4, 5, 6, 7, 8, 10, 12, 14, 15, 16].map(i => N4 + i).concat([16, 17, 18, 20, 21, 22].map(i => N2 + i));
  const img = {};
  let clouds = [], stars = [], flies = [], tufts = [], paper = null, mottle = null;

  function load(src) {
    return new Promise(r => { if (img[src]) return r(img[src]); const i = new Image(); i.onload = () => { img[src] = i; r(i); }; i.src = src + '.png'; });
  }

  async function setup(cx) {
    const all = PLANTS.flatMap(p => p.nf ? [p.f, p.nf] : [p.f])
      .concat(GRASS, DAY_CLOUDS, STARS, DOTS, [SUN, MOON])
      .concat([P + 'hills_day/piece_0', P + 'hills_night/piece_0', P + 'swatches/cream', P + 'swatches/antelope']);
    await Promise.all(all.map(load));
    // no night picture on the sheets (dim): make a darker moonlit copy once, used as its night picture
    for (const p of PLANTS) {
      if (!p.dim) continue;
      const i = img[p.f], c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      // multiply by moonlight blue: darker and bluer but keeps the painted contrast (a grey wash looked flat)
      const g = c.getContext('2d'); g.drawImage(i, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(95,120,205)'; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(i, 0, 0);
      img[p.nf = p.f + '#night'] = c;
    }
    paper = cx.createPattern(img[P + 'swatches/cream'], 'repeat');
    paper.setTransform(new DOMMatrix().scale(0.6));
    // blotchy painted paper for the ground, made grey so it adds light and shade but no colour
    const mi = img[P + 'swatches/antelope'], mc = document.createElement('canvas'); mc.width = mi.width; mc.height = mi.height;
    const mg = mc.getContext('2d'); mg.filter = 'grayscale(1) contrast(1.6)'; mg.drawImage(mi, 0, 0);
    mottle = cx.createPattern(mc, 'repeat');
    mottle.setTransform(new DOMMatrix().scale(0.45));
    // fixed random layout for clouds, stars, fireflies and grass rows (same every load)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    clouds = DAY_CLOUDS.map(c => ({ c, x: rnd(), y: 0.07 + rnd() * 0.25, h: 0.035 + rnd() * 0.025, v: 0.004 + rnd() * 0.004 }));
    stars = Array.from({ length: 34 }, (_, k) => ({ s: STARS[k % STARS.length], x: rnd(), y: rnd() * 0.5, h: 0.012 + rnd() * 0.02, ph: rnd() * 6 }));
    flies = Array.from({ length: 34 }, (_, k) => ({ d: DOTS[k % DOTS.length], x: rnd(), y: 0.45 + rnd() * 0.5, ph: rnd() * 6, sp: 0.3 + rnd() * 0.4, s: 0.7 + rnd() * 0.8 }));
    // grass rows along each band edge, smaller further back
    BANDS.forEach((b, k) => {
      const n = [34, 30, 26][k], hh = [0.035, 0.05, 0.065][k];
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.25) continue;                              // leave gaps so it is not a fence
        tufts.push({ band: k, x: (i + rnd() * 0.8) / n, g: GRASS[Math.floor(rnd() * GRASS.length)], h: hh * (0.6 + rnd() * 0.7), flip: rnd() < 0.5, ph: rnd() * 6 });
      }
    });
  }

  // images shrunk once to the size they are drawn at (drawing a big picture small every frame is slow)
  const small = new Map();
  function sized(src, w, h, cx) {
    const m = cx.getTransform(), dpr = Math.hypot(m.a, m.b), pw =Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    const key = src + '|' + pw + 'x' + ph;
    // lightweight shrunk copies (many helper canvases make Chrome drop some); the full picture is used until ready
    let c = small.get(key);
    if (c === undefined) {
      small.set(key, null);
      createImageBitmap(img[src], { resizeWidth: pw, resizeHeight: ph, resizeQuality: 'medium' })
        .then(b => small.set(key, b), () => small.set(key, img[src]));
    }
    return c || img[src];
  }

  // y of a band's wavy top edge at screen x
  function edge(k, x, W, H) {
    const b = BANDS[k], u = x / W * Math.PI * 2;
    return H * (b.top + b.amp * (Math.sin(u * 1.7 + b.ph) + 0.5 * Math.sin(u * 4.3 + b.ph * 2)));
  }

  function put(cx, src, x, y, h, alpha = 1) {
    const i = img[src], w = h * i.width / i.height;
    cx.globalAlpha = alpha; cx.drawImage(sized(src, w, h, cx), x - w / 2, y - h / 2, w, h); cx.globalAlpha = 1;
  }

  function hills(cx, W, H, n, baked) {
    if (window.Island && !baked) return;               // island page: hills are baked into band 0, cut to the island
    const h = H * 0.20, y = BANDS[0].top * H - h + H * 0.012;
    for (const [src, a] of [[P + 'hills_day/piece_0', 1 - n], [P + 'hills_night/piece_0', n]]) {
      if (a <= 0.01) continue;
      const i = img[src], w = h * i.width / i.height;
      cx.globalAlpha = a;
      const c = sized(src, w, h, cx);
      for (let x = -((W * 0.1) % w); x < W; x += w - 1) cx.drawImage(c, x, y, w, h);
      cx.globalAlpha = 1;
    }
  }

  // one paper ground band with a soft shadow along its wavy top, then its row of grass
  const bandCache = [];
  function band(cx, W, H, t, k, n, people) {
    const dpr = cx.getTransform().a, nq = Math.round(n * 40) / 40, key = W + 'x' + H + '@' + dpr + ':' + nq;
    let bc = bandCache[k];
    if (!bc || bc.key !== key) {
      const c = bc ? bc.c : document.createElement('canvas');
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (window.Island && k === 0) hills(g, W, H, nq, true);
      bandShape(g, W, H, k, nq);
      if (window.Island) Island.cut(g, W, H);            // island page: cut once here, not every frame
      bc = bandCache[k] = { c, key };
    }
    cx.drawImage(bc.c, 0, 0, W, H);
    grass(cx, W, H, t, k, people);
  }

  function bandShape(cx, W, H, k, n) {
    const b = BANDS[k];
    cx.beginPath(); cx.moveTo(0, H + 2);
    for (let x = 0; x <= W + 8; x += 8) cx.lineTo(x, edge(k, x, W, H));
    cx.lineTo(W, H + 2); cx.closePath();
    cx.save();
    cx.shadowColor = `rgba(40,30,10,${0.28 * (1 - n) + 0.4 * n})`; cx.shadowBlur = 10; cx.shadowOffsetY = -3;
    cx.fillStyle = mix(b.day, b.night, n); cx.fill();
    cx.restore();
    cx.save(); cx.clip();
    cx.globalCompositeOperation = 'multiply'; cx.globalAlpha = 0.5; cx.fillStyle = paper; cx.fillRect(0, 0, W, H);
    // painted blotches so the ground reads as paper, not flat colour (shows in day and night)
    cx.globalCompositeOperation = 'soft-light'; cx.globalAlpha = 0.9; cx.fillStyle = mottle; cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
    // small still grass tufts scattered over the whole band, smaller and fainter the further back
    const S = Math.min(H, W * 0.62), bottom = k < BANDS.length - 1 ? BANDS[k + 1].top + 0.01 : 1.02;
    let seed = 101 + k * 977; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const count = Math.round(W / [26, 22, 18][k]), base = [0.02, 0.028, 0.038][k];
    const marks = [];
    for (let i = 0; i < count; i++) {
      const x = rnd() * W, top = edge(k, x, W, H) + H * 0.02, y = top + rnd() * (H * bottom - top);
      marks.push([x, y, GRASS[Math.floor(rnd() * GRASS.length)], base * (0.5 + rnd() * 0.7) * (0.7 + 0.5 * (y / H - b.top) / (bottom - b.top)), rnd() < 0.5]);
    }
    marks.sort((a, c) => a[1] - c[1]);                 // back to front
    for (const [x, y, g, hh, flip] of marks) {
      const i = img[g], h = S * hh, w = h * i.width / i.height;
      cx.save(); cx.globalAlpha = 0.85; cx.translate(x, y); if (flip) cx.scale(-1, 1);
      cx.drawImage(sized(g, w, h, cx), -w / 2, -h, w, h); cx.restore();
    }
    cx.restore();
    if (n > 0.01) {                                    // moonlit rim along the wavy edge
      cx.beginPath();
      for (let x = 0; x <= W + 8; x += 8) cx.lineTo(x, edge(k, x, W, H) + 2);
      cx.strokeStyle = `rgba(150,170,230,${0.55 * n})`; cx.lineWidth = 3; cx.stroke();
    }
  }

  function grass(cx, W, H, t, k, people) {
    const S = Math.min(H, W * 0.62);
    for (const g of tufts) {
      if (g.band !== k) continue;
      const x = g.x * W, y = edge(k, x, W, H) + 3, i = img[g.g], h = S * g.h, w = h * i.width / i.height;
      if (window.Island && Island.fade(x, y, W, H) < 0.7) continue;   // island page: no grass out on the black
      cx.save(); cx.translate(x, y); cx.rotate(lean(t, x, W, people, 0.05, g.ph)); if (g.flip) cx.scale(-1, 1);
      cx.drawImage(sized(g.g, w, h, cx), -w / 2, -h, w, h); cx.restore();
    }
  }

  // gentle sway, more when a person is near
  function lean(t, x, W, people, amp, ph) {
    let near = 0;
    for (const px of people) near = Math.max(near, 1 - Math.abs(px - x) / (W * 0.12));
    const a = amp * (1 + 2.5 * Math.max(0, near));
    return Math.sin(t * 0.9 + ph + x * 0.01) * a + Math.sin(t * 2.1 + ph) * a * 0.3;
  }

  // plant x as a share of W; on the island page plants move inward so they stand on the island
  const plantX = p => window.Island ? 0.5 + (p.x - 0.5) * Island.SQUEEZE : p.x;

  // n = night amount: plants with a night picture (nf, sheet6) fade from the day picture to it
  function plants(cx, W, H, t, layer, people, n = 0) {
    const S = Math.min(H, W * 0.62);
    for (const p of PLANTS) {
      if (p.layer !== layer) continue;
      const h = S * p.h, x = W * plantX(p);
      const y = p.band !== undefined ? edge(p.band, x, W, H) + H * p.off : H * p.base;
      cx.save(); cx.translate(x, y); cx.rotate(p.sway ? lean(t, x, W, people, p.sway, p.x * 17) : 0);
      for (const [f, a] of p.nf ? [[p.f, 1 - n], [p.nf, n]] : [[p.f, 1]]) {
        if (a <= 0.01) continue;
        const i = img[f], w = h * i.width / i.height;
        cx.globalAlpha = a; cx.drawImage(sized(f, w, h, cx), -w / 2, -h, w, h);
      }
      cx.restore();
    }
  }

  // drawn BEHIND what is already on the canvas (destination-over), back-most last
  function skyBehind(cx, W, H, t, n) {
    const S = Math.min(H, W * 0.62);
    cx.globalCompositeOperation = 'destination-over';
    for (const c of clouds) {
      const x = ((c.x + t * c.v * 0.1) % 1.3 - 0.15) * W;
      if (1 - n > 0.01) put(cx, c.c, x, H * c.y, S * c.h, 1 - n);
    }
    if (n > 0.01) {
      put(cx, MOON, W * 0.2, H * 0.17, S * 0.2, n);
      for (const s of stars) put(cx, s.s, W * s.x, H * s.y, S * s.h * 1.2, n * (0.75 + 0.25 * Math.sin(t * 0.8 + s.ph)));
    }
    if (1 - n > 0.01) put(cx, SUN, W * 0.8, H * 0.15, S * 0.15, 1 - n);
    const day = ['#8fc0db', '#d3e7ee', '#f4e2b8'], night = ['#000000', '#000000', '#04050a'];   // black: a projector shows nothing there
    const g = cx.createLinearGradient(0, 0, 0, H * BANDS[0].top + 4);
    day.forEach((d, k) => g.addColorStop(k / 2, mix(d, night[k], n)));
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = 'source-over';
  }

  // island page: only a small sun or moon and stars over black, drawn behind the island (no sky colour, no clouds)
  function smallSky(cx, W, H, t, n) {
    const S = Math.min(H, W * 0.62);
    cx.globalCompositeOperation = 'destination-over';
    if (n > 0.01) {
      put(cx, MOON, W * 0.2, H * 0.13, S * 0.12, n);
      for (const s of stars) put(cx, s.s, W * s.x, H * s.y * 0.8, S * s.h, n * (0.75 + 0.25 * Math.sin(t * 0.8 + s.ph)));
    }
    if (1 - n > 0.01) put(cx, SUN, W * 0.8, H * 0.12, S * 0.1, 1 - n);
    cx.globalCompositeOperation = 'source-over';
  }

  // night: tint everything already drawn (land, plants, animals) towards moonlit blue
  function nightTint(cx, W, H, n) {
    if (n <= 0.01) return;
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = `rgba(40,60,140,${0.22 * n})`; cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = 'source-over';
  }

  function fireflies(cx, W, H, t, n) {
    if (n <= 0.05) return;
    for (const f of flies) {
      // slow lazy drift; each one glows up and fades on its own rhythm
      const x = W * (f.x + Math.sin(t * 0.05 * f.sp + f.ph) * 0.08 + Math.sin(t * 0.17 * f.sp + f.ph * 3) * 0.015);
      const y = H * (f.y + Math.sin(t * 0.11 * f.sp + f.ph * 2) * 0.04);
      const a = n * Math.max(0, Math.sin(t * 0.6 * f.sp + f.ph)) ** 2, r = H * 0.022 * f.s;
      if (a < 0.02) continue;
      const g = cx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,240,150,${0.55 * a})`); g.addColorStop(1, 'rgba(255,240,150,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
      put(cx, f.d, x, y, H * 0.009 * f.s, a);
    }
  }

  function mix(a, b, k) {
    const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
    const A = p(a), B = p(b);
    return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',') + ')';
  }

  // where the waterhole is on screen: centre of the water and its drawn size
  function pond(W, H) {
    const p = PLANTS.find(q => q.pond), i = img[p.f], S = Math.min(H, W * 0.62), h = S * p.h, w = h * i.width / i.height;
    const x = W * plantX(p), y = edge(p.band, x, W, H) + H * p.off;
    return { x, y: y - h / 2, w, h };
  }

  window.Scenery = { setup, hills, band, plants, skyBehind, smallSky, nightTint, fireflies, edge, pond };
})();
