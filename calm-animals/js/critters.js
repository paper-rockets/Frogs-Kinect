// Painted animals from the owner's sheets that stay in one place or drift: a resting lion and cub,
// flamingos wading in the waterhole, birds crossing the sky and butterflies over the grass (day only).
// All calm: breathing, bobbing, slow flaps. Butterflies drift away from a person; the lion looks up a little.
(function () {
  const P = 'parts/', N1 = P + 'new1/piece_', N3 = P + 'new3/piece_', N5 = P + 'new5/piece_';
  const LION = N1 + 8, CUB = N5 + 6, RIPPLE = N1 + 40;
  const FLAMINGOS = [{ f: N1 + 5, dx: -0.30, h: 0.115, ph: 0 }, { f: N1 + 6, dx: 0.02, h: 0.105, ph: 2.1 }, { f: N1 + 7, dx: 0.26, h: 0.085, ph: 4.0 }];
  const BIRDS = [N3 + 8, N3 + 9], FLIES = [N3 + 10, N3 + 11, N3 + 12];
  const img = {};
  let birds = [], flies = [];

  function load(src) { return new Promise(r => { const i = new Image(); i.onload = () => { img[src] = i; r(); }; i.src = src + '.png'; }); }

  async function setup() {
    await Promise.all([LION, CUB, RIPPLE].concat(FLAMINGOS.map(f => f.f), BIRDS, FLIES).map(load));
    birds = BIRDS.map((f, k) => ({ f, x: 0.2 + k * 0.5, y: 0.18 + k * 0.1, v: 0.012 + k * 0.004, ph: k * 2 }));
    flies = Array.from({ length: 5 }, (_, k) => ({ f: FLIES[k % 3], x: 0.15 + k * 0.18, y: 0.72 + (k % 2) * 0.1, vx: 0, vy: 0, ph: k * 1.7 }));
  }

  // picture standing on its bottom edge at (x, y), height h, squashed by sx/sy around its feet
  function stand(cx, src, x, y, h, sx = 1, sy = 1, rot = 0, alpha = 1) {
    const i = img[src], w = h * i.width / i.height;
    cx.save(); cx.globalAlpha = alpha; cx.translate(x, y); cx.rotate(rot); cx.scale(sx, sy);
    cx.drawImage(i, -w / 2, -h, w, h); cx.restore();
  }

  function nearOf(people, x, W, reach) {
    let n = 0; for (const px of people) n = Math.max(n, 1 - Math.abs(px - x) / (W * reach)); return Math.max(0, n);
  }

  // resting lion + cub under the big acacia, and flamingos in the water: drawn behind the walking herds
  function resting(cx, W, H, t, people) {
    const S = Math.min(H, W * 0.62);
    const ly = Scenery.edge(1, W * 0.14, W, H) + H * 0.035;
    const near = nearOf(people, W * 0.16, W, 0.15);
    const br = Math.sin(t * (1.1 - 0.3 * near)) * 0.012;                 // slow breathing, slower when someone is close
    stand(cx, LION, W * 0.14, ly, S * 0.12, 1 - br * 0.4, 1 + br, -near * 0.03);
    const cy = Scenery.edge(1, W * 0.235, W, H) + H * 0.04;
    const cb = Math.sin(t * 1.6 + 1) * 0.015;
    stand(cx, CUB, W * 0.235, cy, S * 0.07, 1 - cb * 0.4, 1 + cb);

    const pond = Scenery.pond(W, H);
    for (const f of FLAMINGOS) {
      const x = pond.x + f.dx * pond.w, y = pond.y + pond.h * 0.18, h = S * f.h;
      // ripple ring round the legs, slowly spreading and fading
      const k = (t * 0.25 + f.ph / 6) % 1, rw = h * (0.45 + k * 0.5);
      cx.save(); cx.globalAlpha = 0.6 * (1 - k); const ri = img[RIPPLE];
      cx.drawImage(ri, x - rw / 2, y - rw * ri.height / ri.width / 2, rw, rw * ri.height / ri.width); cx.restore();
      const sway = Math.sin(t * 0.7 + f.ph) * 0.025, bob = 1 + Math.sin(t * 1.3 + f.ph) * 0.01;
      stand(cx, f.f, x, y, h, 1, bob, sway);
    }
  }

  // butterflies over the grass and birds in the sky; only in the day (n = night 0..1)
  function flying(cx, W, H, t, dt, n, people) {
    const a = 1 - n; if (a < 0.02) return;
    const S = Math.min(H, W * 0.62);
    for (const b of birds) {
      b.x += b.v * dt; if (b.x > 1.1) { b.x = -0.1; b.y = 0.12 + Math.random() * 0.22; }
      const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 3 + b.ph));      // wings squash shut and open
      const x = W * b.x, y = H * (b.y + Math.sin(t * 0.6 + b.ph) * 0.02), h = S * 0.05;
      stand(cx, b.f, x, y + h / 2, h, 1, flap, Math.sin(t * 0.6 + b.ph) * 0.06, a);
    }
    for (const f of flies) {
      // wander, and drift away from a person standing close
      const px = W * f.x;
      let push = 0; for (const p of people) { const d = (px - p) / W; if (Math.abs(d) < 0.1) push += Math.sign(d || 1) * (0.1 - Math.abs(d)); }
      f.vx += (Math.sin(t * 0.3 + f.ph * 3) * 0.004 + push * 0.4 - f.vx) * Math.min(1, dt * 1.5);
      f.x += f.vx * dt; if (f.x < -0.05) f.x = 1.05; if (f.x > 1.05) f.x = -0.05;
      const flap = 0.3 + 0.7 * Math.abs(Math.sin(t * 6 + f.ph));
      const y = H * (f.y + Math.sin(t * 0.8 + f.ph) * 0.03), h = S * 0.035;
      stand(cx, f.f, px, y + h / 2, h, flap, 1, Math.sin(t * 1.1 + f.ph) * 0.15, a);
    }
  }

  window.Critters = { setup, resting, flying };
})();
