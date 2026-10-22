// Giraffe and zebra drawn in code, filled with the Codex coat papers (from_codex/*_coat.png).
// Same walk as the elephant: feet stay planted, legs are two bones. Front knees bend forward,
// back hocks bend backward. Units: origin = ground under the rump; faces right.
(function () {
  const pats = {};

  // coat tile made at the size it is drawn, so the pattern needs no scaling each frame
  function tile(img, px, tint, turn) {
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d');
    if (turn) { g.translate(px, 0); g.rotate(Math.PI / 2); }
    g.drawImage(img, 0, 0, px, px);
    if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, px, px); }
    return c;
  }

  function load(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; }); }

  async function setup(cx) {
    const [gir, cream] = await Promise.all(['giraffe', 'cream'].map(n => load('parts/swatches/' + n + '.png')));
    const mk = c => cx.createPattern(c, 'repeat');
    pats.giraffe = mk(tile(gir, 164));
    pats.giraffeDark = mk(tile(gir, 164, '#c4b4a4'));
    pats.cream = mk(tile(cream, 256));
    pats.creamDark = mk(tile(cream, 256, '#d4d0cc'));
  }

  // two-bone leg; sign +1 = knee forward (front legs), -1 = hock backward (back legs)
  function joint(hx, hy, fx, fy, a, b, sign) {
    const dx = fx - hx, dy = fy - hy, d = Math.min(Math.hypot(dx, dy), a + b - 0.5);
    const base = Math.atan2(dy, dx), A = Math.acos((a * a + d * d - b * b) / (2 * a * d));
    return [hx + a * Math.cos(base - sign * A), hy + a * Math.sin(base - sign * A)];
  }

  class Hoofed {
    constructor(size, c) { this.size = size; this.c = c; this.T = c.T * size; this.t = Math.random() * 10; this.lift = 0; }

    foot(L, cyc) {
      const c = this.c, u = (cyc + L.off) % 1;
      let fx, up = 0;
      if (u < c.DUTY) fx = c.S / 2 - c.S * (u / c.DUTY);
      else { const w = (u - c.DUTY) / (1 - c.DUTY), e = w * w * (3 - 2 * w); fx = -c.S / 2 + c.S * e; up = Math.sin(Math.PI * w) * c.raise; }
      return [L.hx + fx, -c.ankle - up];
    }

    leg(cx, L, cyc, bob) {
      const c = this.c, [fx, fy] = this.foot(L, cyc), hy = c.hipY + bob;
      const [kx, ky] = joint(L.hx, hy, fx, fy, c.thigh, c.shin, L.front || c.kneesForward ? 1 : -1);
      cx.lineCap = 'round'; cx.lineJoin = 'round';
      cx.strokeStyle = L.far ? c.legDark() : c.legPat();
      cx.lineWidth = c.w1; cx.beginPath(); cx.moveTo(L.hx, hy - 24); cx.lineTo(L.hx, hy); cx.lineTo(kx, ky); cx.stroke();
      cx.lineWidth = c.w2; cx.beginPath(); cx.moveTo(kx, ky); cx.lineTo(fx, fy); cx.stroke();
      cx.fillStyle = c.hoof;
      cx.beginPath(); cx.roundRect(fx - c.w2 * 0.5, fy - 3, c.w2, c.ankle + 3, [3, 3, 2, 2]); cx.fill();
    }

    update(dt, speed, near) { this.t += dt * speed; this.lift += (near - this.lift) * Math.min(1, dt * 1.5); }

    draw(cx, x, groundY, scale) {
      const c = this.c, cyc = (this.t / this.T) % 1, bob = Math.cos(cyc * Math.PI * 4) * 1.5;
      cx.save(); cx.translate(x, groundY); cx.scale(scale * this.size, scale * this.size);
      const sh = cx.createRadialGradient(c.mid, 2, 5, c.mid, 2, c.mid * 1.1);
      sh.addColorStop(0, 'rgba(70,55,30,.26)'); sh.addColorStop(1, 'rgba(70,55,30,0)');
      cx.fillStyle = sh; cx.save(); cx.scale(1, 0.08); cx.beginPath(); cx.arc(c.mid, 25, c.mid * 1.1, 0, Math.PI * 2); cx.fill(); cx.restore();
      // near legs go in front of the body, unless the leg coat runs another way (zebra stripes)
      c.legs.filter(l => l.far || c.legsBehind).forEach(l => this.leg(cx, l, cyc, bob));
      cx.save(); cx.translate(0, bob); this.tail(cx); this.body(cx); this.head(cx, cyc); cx.restore();
      if (!c.legsBehind) c.legs.filter(l => !l.far).forEach(l => this.leg(cx, l, cyc, bob));
      cx.restore();
    }

    tail(cx) {
      const c = this.c, sw = Math.sin(this.t * 1.5) * 8, [x0, y0] = c.tailAt;
      cx.strokeStyle = c.tailCol; cx.lineWidth = 5; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(x0, y0); cx.quadraticCurveTo(x0 - 12, y0 + 40, x0 - 8 + sw, y0 + c.tailLen); cx.stroke();
      cx.fillStyle = c.tuft;
      cx.beginPath(); cx.ellipse(x0 - 8 + sw, y0 + c.tailLen + 10, 6, 13, sw * 0.02, 0, Math.PI * 2); cx.fill();
    }
  }

  // ---------- giraffe ----------
  const GIRAFFE = {
    S: 72, T: 2.8, DUTY: 0.65, raise: 14, thigh: 125, shin: 124, kneesForward: true, ankle: 12, hipY: -258, w1: 30, w2: 17, mid: 150,
    hoof: '#5b3a22', tailCol: '#c98a3a', tuft: '#5b3a22', tailAt: [24, -300], tailLen: 90,
    legPat: () => pats.giraffe, legDark: () => pats.giraffeDark,
    // a giraffe paces: both legs on one side move together
    legs: [{ hx: 52, off: 0.5, far: true }, { hx: 205, off: 0.55, far: true, front: true },
           { hx: 72, off: 0 }, { hx: 226, off: 0.05, front: true }]
  };
  class Giraffe extends Hoofed {
    constructor(size) { super(size, GIRAFFE); }
    static speed() { return GIRAFFE.S / (GIRAFFE.DUTY * GIRAFFE.T); }
    body(cx) {
      cx.fillStyle = pats.giraffe; cx.beginPath();
      cx.ellipse(140, -284, 118, 50, -0.12, 0, Math.PI * 2);
      cx.ellipse(205, -302, 52, 56, 0, 0, Math.PI * 2);
      cx.ellipse(62, -282, 48, 42, 0, 0, Math.PI * 2);
      cx.fill();
    }
    head(cx, cyc) {
      // long neck as a chain of segments; leans forward and down to look at a person
      const N = 10, L = 21, lift = this.lift;
      let ax = 222, ay = -322, ang = -1.08 + lift * 0.45 + Math.sin(this.t * 0.5) * 0.03 + Math.sin(cyc * Math.PI * 2) * 0.02;
      const pts = [[ax, ay]];
      for (let i = 0; i < N; i++) { ang += 0.012 + lift * 0.01; ax += Math.cos(ang) * L; ay += Math.sin(ang) * L; pts.push([ax, ay]); }
      cx.lineCap = 'round';
      // mane along the back of the neck
      cx.strokeStyle = '#8a4e22'; cx.lineWidth = 8; cx.beginPath();
      for (let i = 1; i < N; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], a = Math.atan2(y1 - y0, x1 - x0), w = (48 - 20 * i / N) / 2;
        const mx = x0 + Math.sin(a) * w, my = y0 - Math.cos(a) * w;
        i === 1 ? cx.moveTo(mx, my) : cx.lineTo(mx, my);
      }
      cx.stroke();
      cx.strokeStyle = pats.giraffe;
      for (let i = 0; i < N; i++) {
        cx.lineWidth = 48 - 20 * i / N;
        cx.beginPath(); cx.moveTo(pts[i][0], pts[i][1]); cx.lineTo(pts[i + 1][0], pts[i + 1][1]); cx.stroke();
      }
      // head
      const [ex, ey] = pts[N];
      cx.save(); cx.translate(ex, ey); cx.rotate(ang + 1.4 - lift * 0.15);
      cx.strokeStyle = '#e8b25a'; cx.lineWidth = 6;                       // horns with dark knobs
      for (const [x0, x1] of [[-2, -8], [-10, -17]]) { cx.beginPath(); cx.moveTo(x0, -12); cx.lineTo(x1, -32); cx.stroke(); }
      cx.fillStyle = '#5b3a22';
      for (const x1 of [-8, -17]) { cx.beginPath(); cx.arc(x1, -33, 4.5, 0, Math.PI * 2); cx.fill(); }
      cx.fillStyle = pats.giraffe;
      cx.beginPath(); cx.ellipse(-12, -6, 13, 5, -0.6, 0, Math.PI * 2); cx.fill();   // ear
      cx.beginPath(); cx.ellipse(20, 2, 30, 16, 0, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = pats.giraffeDark; cx.beginPath(); cx.ellipse(44, 5, 12, 11, 0, 0, Math.PI * 2); cx.fill();
      cx.strokeStyle = '#2f2a26'; cx.lineWidth = 2.6;
      cx.beginPath(); cx.arc(16, -4, 5, Math.PI * 1.1, Math.PI * 1.9); cx.stroke();    // closed happy eye
      cx.restore();
    }
  }

  // ---------- zebra ----------
  // Storybook zebra: chunky white paper body, bold stripes painted in code that follow the body
  // (bands down the barrel, rings round the haunch, rings round the legs and neck), striped upright mane.
  const INK = '#25252b', INK_FAR = '#3c3b42';
  const ZEBRA = {
    S: 44, T: 1.7, DUTY: 0.62, raise: 12, thigh: 70, shin: 64, ankle: 10, hipY: -140, mid: 115,
    tailAt: [10, -196], legsBehind: true,
    legs: [{ hx: 50, off: 0.5, far: true }, { hx: 180, off: 0.75, far: true, front: true },
           { hx: 66, off: 0 }, { hx: 196, off: 0.25, front: true }]
  };

  // points along a quadratic curve
  function quad(x0, y0, qx, qy, x1, y1, n = 16) {
    const p = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; p.push([u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1]); }
    return p;
  }
  // a brush stroke along points: full width, tapering to a point over the last part
  function brush(path, pts, w, taperEnd = 0.3) {
    const L = [], R = [], n = pts.length - 1;
    for (let i = 0; i <= n; i++) {
      const [x, y] = pts[i], [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(n, i + 1)];
      const a = Math.atan2(by - ay, bx - ax), t = i / n;
      const k = t > 1 - taperEnd ? Math.pow((1 - t) / taperEnd, 0.7) : 1, h = w / 2 * k;
      L.push([x - Math.sin(a) * h, y + Math.cos(a) * h]); R.push([x + Math.sin(a) * h, y - Math.cos(a) * h]);
    }
    path.moveTo(L[0][0], L[0][1]); for (const q of L.slice(1)) path.lineTo(q[0], q[1]);
    for (const q of R.reverse()) path.lineTo(q[0], q[1]); path.closePath();
  }

  // body outline and its stripes never change shape, so they are made once
  const ZBODY = new Path2D();
  ZBODY.moveTo(34, -214);
  ZBODY.bezierCurveTo(80, -226, 128, -200, 176, -206);     // back with a soft dip
  ZBODY.bezierCurveTo(204, -210, 222, -190, 222, -166);    // shoulder and chest
  ZBODY.bezierCurveTo(222, -142, 206, -128, 186, -126);
  ZBODY.bezierCurveTo(150, -118, 96, -118, 66, -126);      // round belly
  ZBODY.bezierCurveTo(34, -132, 8, -148, 8, -176);         // haunch
  ZBODY.bezierCurveTo(8, -200, 18, -212, 34, -214);
  ZBODY.closePath();
  const ZSTRIPES = new Path2D();
  for (let i = 0; i < 7; i++) {                            // barrel: bands down from the back, sweeping back at the belly
    const x = 96 + i * 16.5;
    brush(ZSTRIPES, quad(x + 8, -232, x - 2, -172, x - 16 + i * 1.5, -116), 11 - i * 0.4, 0.35);
  }
  for (const x of [204, 218]) brush(ZSTRIPES, quad(x - 6, -230, x + 2, -176, x + 10, -124), 8, 0.4);   // shoulder
  for (let j = 0; j < 4; j++) {                            // haunch: rings round the back end
    const r = 50 + j * 17, pts = [];
    for (let a = -2.75; a <= -0.55 - j * 0.12; a += 0.1) pts.push([12 + Math.cos(a) * r, -116 + Math.sin(a) * r]);
    brush(ZSTRIPES, pts, 10.5, 0.3);
  }

  class Zebra extends Hoofed {
    constructor(size) { super(size, ZEBRA); }
    static speed() { return ZEBRA.S / (ZEBRA.DUTY * ZEBRA.T); }

    body(cx) {
      this.neck(cx);
      // the striped body never changes shape: paint it once per on-screen size, then just copy it
      const m = cx.getTransform(), k = Math.hypot(m.a, m.b), key = Math.round(k * 50);
      if (!this.bodyPic || this.bodyKey !== key) {
        const c = this.bodyPic || document.createElement('canvas');
        c.width = Math.ceil(232 * k); c.height = Math.ceil(126 * k);
        const g = c.getContext('2d'); g.scale(k, k); g.translate(0, 236);
        g.fillStyle = pats.cream; g.fill(ZBODY);
        g.clip(ZBODY); g.fillStyle = INK; g.fill(ZSTRIPES);
        this.bodyPic = c; this.bodyKey = key;
      }
      cx.drawImage(this.bodyPic, 0, -236, 232, 126);
    }

    // tapered leg (thick thigh, thin cannon bone), ringed with stripes, black hoof
    leg(cx, L, cyc, bob) {
      const c = this.c, [fx, fy] = this.foot(L, cyc), hy = c.hipY + bob;
      const [kx, ky] = joint(L.hx, hy, fx, fy, c.thigh, c.shin, L.front ? 1 : -1);
      const seg = [[L.hx, hy - 28], [L.hx, hy], [kx, ky], [fx, fy]], wid = [36, 34, 19, 14];
      const Lp = [], Rp = [];
      seg.forEach((p, i) => {
        const q = seg[Math.min(3, i + 1)], o = seg[Math.max(0, i - 1)], a = Math.atan2(q[1] - o[1], q[0] - o[0]);
        Lp.push([p[0] - Math.sin(a) * wid[i] / 2, p[1] + Math.cos(a) * wid[i] / 2]);
        Rp.push([p[0] + Math.sin(a) * wid[i] / 2, p[1] - Math.cos(a) * wid[i] / 2]);
      });
      const shape = new Path2D();
      shape.moveTo(Lp[0][0], Lp[0][1]); for (const q of Lp.slice(1)) shape.lineTo(q[0], q[1]);
      for (const q of Rp.reverse()) shape.lineTo(q[0], q[1]); shape.closePath();
      cx.fillStyle = L.far ? pats.creamDark : pats.cream; cx.fill(shape);
      cx.save(); cx.clip(shape);
      cx.strokeStyle = L.far ? INK_FAR : INK; cx.lineWidth = 5; cx.lineCap = 'butt';
      cx.beginPath();
      for (let s = 1; s < 3; s++) {                                             // rings across each bone
        const [ax, ay] = seg[s], [bx, by] = seg[s + 1], len = Math.hypot(bx - ax, by - ay), a = Math.atan2(by - ay, bx - ax);
        for (let d = s === 1 ? 14 : 4; d < len - 4; d += 10.5) {
          const x = ax + Math.cos(a) * d, y = ay + Math.sin(a) * d;
          cx.moveTo(x - Math.sin(a) * 24, y + Math.cos(a) * 24); cx.lineTo(x + Math.sin(a) * 24, y - Math.cos(a) * 24);
        }
      }
      cx.stroke(); cx.restore();
      cx.fillStyle = INK;                                                       // hoof
      cx.beginPath(); cx.moveTo(fx - 8, fy - 2); cx.lineTo(fx + 8, fy - 2); cx.lineTo(fx + 10, fy + c.ankle); cx.lineTo(fx - 9, fy + c.ankle); cx.closePath(); cx.fill();
    }

    tail(cx) {
      const sw = Math.sin(this.t * 1.5) * 8, [x0, y0] = this.c.tailAt;
      cx.strokeStyle = '#efe8da'; cx.lineWidth = 5; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(x0, y0); cx.quadraticCurveTo(x0 - 14, y0 + 34, x0 - 10 + sw, y0 + 62); cx.stroke();
      cx.fillStyle = INK;
      cx.beginPath(); cx.ellipse(x0 - 10 + sw, y0 + 74, 6, 14, sw * 0.02, 0, Math.PI * 2); cx.fill();
    }

    // slim neck reaching forward and up from the shoulder; drawn before the body so it grows out of it
    neck(cx) {
      const cyc = (this.t / this.T) % 1, lift = this.lift, nod = Math.sin(cyc * Math.PI * 4) * 2;
      const N = 12, nk = this.nk = quad(170, -184, 210, -206, 238 + lift * 4, -258 - lift * 10 + nod, N);
      const up = [], dn = [];
      nk.forEach((p, i) => {
        const q = nk[Math.min(N, i + 1)], o = nk[Math.max(0, i - 1)], a = Math.atan2(q[1] - o[1], q[0] - o[0]), w = (52 - 18 * i / N) / 2;
        up.push([p[0] + Math.sin(a) * w, p[1] - Math.cos(a) * w, a]); dn.push([p[0] - Math.sin(a) * w, p[1] + Math.cos(a) * w]);
      });
      // upright mane along the top of the neck: a cream band with black bars, drawn before the neck covers its root
      const mane = new Path2D(), M = 19;
      mane.moveTo(up[1][0], up[1][1]);
      for (let i = 2; i <= N; i++) mane.lineTo(up[i][0], up[i][1]);
      for (let i = N; i >= 1; i--) { const a = up[i][2]; mane.lineTo(up[i][0] + Math.sin(a) * M, up[i][1] - Math.cos(a) * M); }
      mane.closePath();
      cx.fillStyle = pats.cream; cx.fill(mane);
      cx.save(); cx.clip(mane); cx.strokeStyle = INK; cx.lineWidth = 6; cx.lineCap = 'butt'; cx.beginPath();
      for (let i = 1; i <= N; i += 2) {                                       // same rows as the neck stripes, so each runs up into the mane
        const k = Math.floor(i), a = up[k][2], x = up[k][0], y = up[k][1];
        cx.moveTo(x - Math.sin(a) * 4, y + Math.cos(a) * 4); cx.lineTo(x + Math.sin(a) * (M + 4), y - Math.cos(a) * (M + 4));
      }
      cx.stroke();
      cx.lineWidth = 3; cx.beginPath();                                         // dark top edge of the mane
      for (let i = 1; i <= N; i++) { const a = up[i][2]; cx.lineTo(up[i][0] + Math.sin(a) * M, up[i][1] - Math.cos(a) * M); }
      cx.stroke(); cx.restore();
      const neck = new Path2D();
      neck.moveTo(up[0][0], up[0][1]); for (const q of up.slice(1)) neck.lineTo(q[0], q[1]);
      for (const q of dn.slice().reverse()) neck.lineTo(q[0], q[1]); neck.closePath();
      cx.fillStyle = pats.cream; cx.fill(neck);
      cx.save(); cx.clip(neck);
      const ns = new Path2D();                                                  // bands round the neck, bowed a little
      for (let i = 1; i < N; i += 2) {
        const mx = (up[i][0] + dn[i][0]) / 2, my = (up[i][1] + dn[i][1]) / 2, a = up[i][2];
        brush(ns, quad(up[i][0], up[i][1], mx - Math.cos(a) * 5, my - Math.sin(a) * 5, dn[i][0], dn[i][1], 8), 8.5, 0.4);
      }
      cx.fillStyle = INK; cx.fill(ns); cx.restore();
    }

    // head: tilted gently down, pointed ears, clear eye, grey muzzle
    head(cx) {
      const lift = this.lift, [hx, hy] = this.nk[this.nk.length - 1];
      cx.save(); cx.translate(hx, hy); cx.rotate(0.62 - lift * 0.35 + Math.sin(this.t * 0.7) * 0.03); cx.scale(0.88, 0.88);
      for (const [ex, tilt, far] of [[-16, -0.55, true], [-4, -0.3, false]]) {
        cx.save(); cx.translate(ex, -14); cx.rotate(tilt);
        const ear = new Path2D(); ear.moveTo(-8, 2); ear.quadraticCurveTo(-8, -26, 0, -36); ear.quadraticCurveTo(8, -26, 8, 2); ear.closePath();
        cx.fillStyle = far ? pats.creamDark : pats.cream; cx.fill(ear);
        cx.save(); cx.clip(ear); cx.fillStyle = INK; cx.fillRect(-10, -40, 20, 13); cx.restore();
        if (!far) { cx.strokeStyle = 'rgba(60,58,66,.5)'; cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(0, -2); cx.lineTo(0, -22); cx.stroke(); }
        cx.restore();
      }
      const head = new Path2D();
      head.moveTo(-18, -16);
      head.bezierCurveTo(8, -28, 44, -18, 62, -6);
      head.bezierCurveTo(76, 2, 74, 22, 58, 25);
      head.bezierCurveTo(36, 30, 2, 28, -16, 16);
      head.bezierCurveTo(-24, 6, -24, -10, -18, -16);
      cx.fillStyle = pats.cream; cx.fill(head);
      cx.save(); cx.clip(head);
      const hs = new Path2D();                                                  // thin bands across the face, bowed toward the nose
      for (const x of [-8, 4, 34, 46]) brush(hs, quad(x - 6, -32, x + 6, -2, x - 2, 32), 6, 0.4);
      cx.fillStyle = INK; cx.fill(hs);
      cx.fillStyle = '#4a4952'; cx.beginPath(); cx.ellipse(64, 12, 19, 18, 0, 0, Math.PI * 2); cx.fill();   // grey muzzle
      cx.restore();
      cx.fillStyle = '#1c1c21'; cx.beginPath(); cx.ellipse(68, 6, 3, 2.2, 0.4, 0, Math.PI * 2); cx.fill();  // nostril
      cx.strokeStyle = '#1c1c21'; cx.lineWidth = 3.2; cx.lineCap = 'round';                               // closed happy eye on a clear patch
      cx.beginPath(); cx.arc(20, -4, 6, Math.PI * 1.1, Math.PI * 1.9); cx.stroke();
      cx.lineWidth = 2.4; cx.beginPath(); cx.arc(60, 18, 8, Math.PI * 0.2, Math.PI * 0.75); cx.stroke();   // small smile
      // forelock: a little striped tuft between the ears
      cx.fillStyle = INK; cx.beginPath(); cx.ellipse(-6, -20, 6, 11, -0.9, 0, Math.PI * 2); cx.fill();
      cx.restore();
    }
  }

  window.Hoofed = { setup, Giraffe, Zebra };
})();
