// Soft nature sounds made in code (no sound files): crickets at night, a few far-off birds by day,
// a quiet breeze all the time. Browsers only allow sound after a first tap, click or key press.
// M key mutes; ?sound=0 starts muted. Sound.setNight(0..1) is called by scene.js every frame.
(function () {
  let ac = null, master, breeze, night = 0, muted = new URLSearchParams(location.search).get('sound') === '0';
  const VOL = 0.5;

  function start() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : VOL; master.connect(ac.destination);
    breezeLoop();
    crickets();
    frogs();
    birds();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(e => addEventListener(e, start, { once: false, passive: true }));
  addEventListener('keydown', e => {
    if (e.key !== 'm' && e.key !== 'M') return;
    muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ac.currentTime, 0.3);
  });

  function panner(x) { const p = ac.createStereoPanner(); p.pan.value = x; p.connect(master); return p; }

  // gentle filtered noise that swells and fades like a breeze
  function breezeLoop() {
    const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { b = 0.985 * b + 0.015 * (Math.random() * 2 - 1); d[i] = b * 6; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    breeze = ac.createGain(); breeze.gain.value = 0.05;
    src.connect(f).connect(breeze).connect(master); src.start();
    setInterval(() => breeze.gain.setTargetAtTime(0.03 + Math.random() * 0.05, ac.currentTime, 2.5), 4000);
  }

  // one cricket chirp: a few fast pulses of a high tone
  function chirp(at, pan, pitch, loud) {
    const out = panner(pan);
    for (let k = 0; k < 3; k++) {
      const t = at + k * 0.045, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = pitch;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(loud, t + 0.008); g.gain.linearRampToValueAtTime(0, t + 0.032);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.04);
    }
  }
  // several crickets, each with its own pitch, place and rhythm; quiet in the day
  function crickets() {
    for (let i = 0; i < 5; i++) {
      const pan = Math.random() * 1.6 - 0.8, pitch = 3900 + Math.random() * 900, gap = 0.5 + Math.random() * 0.5;
      (function loop() {
        const loud = 0.05 * night * (0.6 + Math.random() * 0.4);
        if (loud > 0.002) {
          const now = ac.currentTime, n = 3 + Math.floor(Math.random() * 6);
          for (let k = 0; k < n; k++) chirp(now + k * gap * 0.55, pan, pitch, loud);
        }
        setTimeout(loop, 2500 + Math.random() * 4000);
      })();
    }
  }

  // night frogs by the waterhole: a soft low croak now and then, from the right (where the pond is)
  function frogs() {
    (function loop() {
      const loud = 0.06 * night;
      if (loud > 0.004) {
        const out = panner(0.4 + Math.random() * 0.3), now = ac.currentTime, base = 140 + Math.random() * 60;
        for (let k = 0; k < 2; k++) {
          const t = now + k * 0.16, o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.3, t + 0.09);
          f.type = 'lowpass'; f.frequency.value = 700;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(loud, t + 0.02); g.gain.linearRampToValueAtTime(0, t + 0.11);
          o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.12);
        }
      }
      setTimeout(loop, 4000 + Math.random() * 8000);
    })();
  }

  // an occasional far-off bird: two or three soft falling whistles
  function birds() {
    (function loop() {
      const loud = 0.03 * (1 - night);
      if (loud > 0.003) {
        const out = panner(Math.random() * 1.4 - 0.7), base = 2200 + Math.random() * 1400, now = ac.currentTime;
        const n = 2 + Math.floor(Math.random() * 2);
        for (let k = 0; k < n; k++) {
          const t = now + k * 0.22, o = ac.createOscillator(), g = ac.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(base * 1.25, t); o.frequency.exponentialRampToValueAtTime(base, t + 0.16);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(loud, t + 0.03); g.gain.linearRampToValueAtTime(0, t + 0.17);
          o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
        }
      }
      setTimeout(loop, 5000 + Math.random() * 9000);
    })();
  }

  window.Sound = { setNight: n => { night = n; } };
})();
