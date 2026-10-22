// Elephant drawn in code, filled with the painted paper texture cut from sheet A.
// Every part shares one texture in the elephant's own space, so overlapping parts join with no seam.
// Elephant units: about 450 wide and 420 tall; origin = ground under the back end; faces right.
(function () {
  const S = 54, DUTY = 0.7;                     // stride, share of the step cycle a foot is down
  const THIGH = 72, SHIN = 68, ANKLE = 15;      // leg bones (about hip-to-ankle, so legs stand straight); ankle height
  const DROP = 42;                              // body sits this much lower than first drawn: shorter legs
  const HIP_Y = -196 + DROP;
  // hip x, step offset in the cycle, far legs are behind the body and darker
  const LEGS = [
    { hx: 105, off: 0.50, far: true }, { hx: 300, off: 0.75, far: true },
    { hx: 130, off: 0.00, far: false }, { hx: 325, off: 0.25, far: false }
  ];
  let pat, patDark, patEar;

  function tile(img, tint) {
    // one big crop from inside the painted body, stretched over the whole elephant (no repeats)
    const cw = 440, ch = 240, sx = 150, sy = 80;   // even part only (lower rows hold the belly shading)
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
    if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height); }
    return c;
  }

  function setup(bodyImg, cx) {
    // texture covers x -30..762, y -432..0 of the elephant, so it never repeats inside one
    const mk = c => { const p = cx.createPattern(c, 'repeat'); p.setTransform(new DOMMatrix().translate(-30, -432).scale(1.8)); return p; };
    pat = mk(tile(bodyImg)); patDark = mk(tile(bodyImg, '#c3cfe0'));
    // the ear is drawn in its own moved space, so its texture is placed to cover that space
    patEar = cx.createPattern(tile(bodyImg, '#a9bdd8'), 'repeat');
    patEar.setTransform(new DOMMatrix().translate(-150, -120).scale(1.8));
  }

  // two-bone leg: knee found from hip and ankle, knee points forward
  function knee(hx, hy, fx, fy) {
    const dx = fx - hx, dy = fy - hy, d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.5);
    const base = Math.atan2(dy, dx);
    const a = Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
    return [hx + THIGH * Math.cos(base - a), hy + THIGH * Math.sin(base - a)];
  }

  class Elephant {
    // size: 1 = grown-up; T: seconds per step cycle (a smaller elephant steps faster to keep up)
    constructor(size, T = 2.4) {
      this.size = size; this.T = T * size; this.t = Math.random() * 10; this.lift = 0;
    }
    // world speed (screen units per second at scale 1) that keeps planted feet still
    static speed() { return S / (DUTY * 2.4); }

    foot(leg, cyc) {
      let u = (cyc + leg.off) % 1, fx, up = 0;
      if (u < DUTY) fx = S / 2 - S * (u / DUTY);
      else { const w = (u - DUTY) / (1 - DUTY), e = w * w * (3 - 2 * w); fx = -S / 2 + S * e; up = Math.sin(Math.PI * w) * 12; }
      return [leg.hx + 8 + fx, -ANKLE - up];
    }

    leg(cx, leg, cyc, bob) {
      const [fx, fy] = this.foot(leg, cyc), hy = HIP_Y + bob;
      const [kx, ky] = knee(leg.hx, hy, fx, fy);
      cx.strokeStyle = cx.fillStyle = leg.far ? patDark : pat;
      cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.lineWidth = 62;
      cx.beginPath(); cx.moveTo(leg.hx, hy - 30); cx.lineTo(leg.hx, hy); cx.lineTo(kx, ky); cx.lineTo(fx, fy); cx.stroke();
      cx.beginPath(); cx.ellipse(fx + 2, fy + 4, 32, 11, 0, 0, Math.PI * 2); cx.fill();   // soft foot pad
      cx.fillStyle = '#ece6da';
      for (const n of [0, 1, 2]) { cx.beginPath(); cx.ellipse(fx + 5 + n * 11, fy + 13, 5, 6, 0, Math.PI, 0); cx.fill(); }
    }

    body(cx) {
      cx.fillStyle = pat; cx.beginPath();
      cx.ellipse(205, -250, 175, 108, 0, 0, Math.PI * 2);
      cx.ellipse(160, -280, 120, 92, -0.15, 0, Math.PI * 2);
      cx.ellipse(350, -292, 82, 80, 0, 0, Math.PI * 2);   // head
      cx.ellipse(392, -262, 48, 44, 0, 0, Math.PI * 2);   // cheek and trunk root
      cx.fill('nonzero');
    }

    trunk(cx) {
      const N = 13, L = 11.5, lift = this.lift, tt = this.t;
      let ax = 410, ay = -262, ang = 1.0 - lift * 1.5;
      const pts = [[ax, ay]];
      for (let i = 0; i < N; i++) {
        const tipCurl = i > N - 5 ? -0.32 - lift * 0.2 : 0;
        ang += (0.035 - lift * 0.09) + tipCurl + Math.sin(tt * 1.4 - i * 0.45) * 0.035 * (i / N);
        ax += Math.cos(ang) * L; ay += Math.sin(ang) * L; pts.push([ax, ay]);
      }
      cx.strokeStyle = pat; cx.lineCap = 'round';
      for (let i = 0; i < N; i++) {
        cx.lineWidth = 50 - 30 * (i / N);
        cx.beginPath(); cx.moveTo(pts[i][0], pts[i][1]); cx.lineTo(pts[i + 1][0], pts[i + 1][1]); cx.stroke();
      }
      // soft wrinkle lines across the trunk
      cx.strokeStyle = 'rgba(60,85,120,.35)'; cx.lineWidth = 2;
      for (let i = 4; i < N - 3; i += 2) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
        const w = (50 - 30 * (i / N)) * 0.32;
        cx.beginPath(); cx.moveTo(x0 + Math.cos(a) * w, y0 + Math.sin(a) * w); cx.lineTo(x0 + Math.cos(a) * w * 0.2, y0 + Math.sin(a) * w * 0.2); cx.stroke();
      }
    }

    ear(cx) {
      const tt = this.t;
      cx.save(); cx.translate(318, -322); cx.rotate(Math.sin(tt * 0.9) * 0.06 + Math.sin(tt * 2.3) * 0.015);
      cx.fillStyle = patEar; cx.beginPath();
      cx.moveTo(4, -6);
      cx.bezierCurveTo(-55, -40, -118, -10, -112, 58);
      cx.bezierCurveTo(-106, 118, -58, 140, -26, 122);
      cx.bezierCurveTo(4, 104, 18, 50, 4, -6);
      cx.fill(); cx.restore();
    }

    tail(cx) {
      const sw = Math.sin(this.t * 1.6) * 10;
      cx.strokeStyle = patDark; cx.lineWidth = 7; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(45, -268); cx.quadraticCurveTo(18 + sw * 0.3, -230, 22 + sw, -186); cx.stroke();
      cx.fillStyle = '#5d7393';
      cx.beginPath(); cx.ellipse(22 + sw, -178, 7, 13, sw * 0.02, 0, Math.PI * 2); cx.fill();
    }

    face(cx) {
      cx.strokeStyle = '#2f3846'; cx.lineWidth = 3.2; cx.lineCap = 'round';
      cx.beginPath(); cx.arc(378, -312, 8, Math.PI * 1.1, Math.PI * 1.9); cx.stroke();  // closed happy eye
      cx.lineWidth = 2.6; cx.beginPath(); cx.arc(384, -248, 13, Math.PI * 0.15, Math.PI * 0.75); cx.stroke(); // smile
    }

    // speed: 0..1 shared with the herd; near: 0..1 how close a person is
    update(dt, speed, near) {
      this.t += dt * speed;
      this.lift += (near - this.lift) * Math.min(1, dt * 2);
    }

    // x, groundY in screen pixels; scale = screen pixels per elephant unit for a grown-up
    draw(cx, x, groundY, scale) {
      const cyc = (this.t / this.T) % 1, bob = Math.cos(cyc * Math.PI * 4) * 2;
      cx.save(); cx.translate(x, groundY); cx.scale(scale * this.size, scale * this.size);
      const sh = cx.createRadialGradient(215, 2, 10, 215, 2, 200);
      sh.addColorStop(0, 'rgba(70,55,30,.28)'); sh.addColorStop(1, 'rgba(70,55,30,0)');
      cx.fillStyle = sh; cx.save(); cx.scale(1, 0.08); cx.beginPath(); cx.arc(215, 25, 200, 0, Math.PI * 2); cx.fill(); cx.restore();

      LEGS.filter(l => l.far).forEach(l => this.leg(cx, l, cyc, bob));
      cx.save(); cx.translate(0, bob + DROP); this.tail(cx); this.body(cx); cx.restore();
      LEGS.filter(l => !l.far).forEach(l => this.leg(cx, l, cyc, bob));
      cx.save(); cx.translate(0, bob + DROP + Math.sin(cyc * Math.PI * 4 + 0.6) * 1.2);
      this.trunk(cx); this.ear(cx); this.face(cx);
      cx.restore(); cx.restore();
    }
  }

  window.Elephant = Elephant;
  window.Elephant.setup = setup;
  window.Elephant.WIDTH = 450;
})();
