(() => {
  const root = document.querySelector('.horizon-figure');
  if (!root) return;

  const stage = root.querySelector('.selfplay-stage');
  const cv = root.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const elReward = root.querySelector('[data-stat="reward"]');

  const T = 500;
  const PHASES = [
    { name: 'reach', start: 0, end: 170 },
    { name: 'descend', start: 170, end: 250 },
    { name: 'grasp', start: 250, end: 280 },
    { name: 'lift', start: 280, end: 450 },
    { name: 'hold', start: 450, end: 500 },
  ];
  const PH = Object.fromEntries(PHASES.map(p => [p.name, p]));
  const ROWS = ['Δx', 'Δy', 'Δz', 'Δroll', 'Δpitch', 'Δyaw', 'grip'];
  const RUN = 10, POST = 3.2, FADE = 0.6, CYCLE = RUN + POST + FADE;
  const C = {
    panel: '#fafafa',
    ink: '#262626',
    text: '#000000',
    muted: '#868686',
    faint: '#b5b5b5',
    link: '#fafafa',
    accent: '#c2571a',
    flash: '#e8892f',
    band: '#f2f2f2',
    bandPast: '#fbe4d3',
    bandNow: '#f3c49f',
    zero: '#f5f5f5',
    pos: '#c2571a',
    neg: '#525252',
    dotFuture: '#e5e5e5',
    ramp: ['#f2c08c', '#e8892f', '#c2571a', '#7f3714'],
    glass: '#a3a3a3',
    water: 'rgba(163, 163, 163, 0.25)',
  };
  const ARM = { base: [0, 0.42], l1: 0.52, l2: 0.46, hand: 0.13, finger: 0.11, open: 0.11, closed: 0.07 };
  const GLASS = { x: 0.82, h: 0.24, rb: 0.052, rt: 0.066 };
  const VIEW = { x0: -0.25, x1: 1.15, y0: -0.07, y1: 0.95 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const mj = u => (u = clamp(u, 0, 1), u * u * u * (10 - 15 * u + 6 * u * u));
  const lerp = (a, b, u) => a + (b - a) * u;
  const lerp2 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
  const bez = (a, b, c, d, u) => {
    const v = 1 - u;
    return [0, 1].map(i => v * v * v * a[i] + 3 * v * v * u * b[i] + 3 * v * u * u * c[i] + u * u * u * d[i]);
  };
  const wave = (s, t) => (Math.sin(t * 0.061 + s * 1.7) + 0.6 * Math.sin(t * 0.143 + s * 4.1) + 0.35 * Math.sin(t * 0.37 + s * 2.3)) / 1.95;
  const bump = (t, a, b) => (t < a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));
  const phaseAt = t => PHASES.find(p => t < p.end) || PHASES[PHASES.length - 1];

  const HOME = [0.36, 0.66], PRE = [0.82, 0.52], GRASP = [0.82, 0.27], UP = [0.7, 0.5];
  const plan = t => {
    const u = ph => (t - ph.start) / (ph.end - ph.start - 1);
    if (t < PH.reach.end) return bez(HOME, [0.46, 0.92], [0.8, 0.84], PRE, mj(u(PH.reach)));
    if (t < PH.descend.end) return lerp2(PRE, GRASP, mj(u(PH.descend)));
    if (t < PH.grasp.end) return GRASP;
    if (t < PH.lift.end) return bez(GRASP, [0.82, 0.4], [0.74, 0.5], UP, mj(u(PH.lift)));
    return UP;
  };
  const within = (t, ph) => t >= ph.start && t < ph.end;
  const calm = t => (within(t, PH.descend) || within(t, PH.lift) ? 0.25 : 1);
  const P = Array.from({ length: T }, (_, t) => {
    const a = t >= PH.hold.start ? 0.0015 : 0.003 * calm(t);
    const [x, y] = plan(t);
    return [x + a * wave(1, t * 2.3), y + a * wave(2, t * 2.1)];
  });
  const grip = Float32Array.from({ length: T }, (_, t) => mj((t - PH.grasp.start - 2) / (PH.grasp.end - PH.grasp.start - 4)));
  const D = P.map((p, t) => (t ? [p[0] - P[t - 1][0], p[1] - P[t - 1][1]] : [0, 0]));
  const vmax = Math.max(...D.flat().map(Math.abs));
  const A = [
    t => D[t][0] / vmax,
    t => 0.16 * wave(3, t * 0.9) + 0.3 * bump(t, 10, 160),
    t => D[t][1] / vmax,
    t => 0.14 * wave(4, t * 1.7),
    t => 0.12 * wave(5, t * 1.4) - 0.5 * bump(t, PH.lift.start, PH.lift.end),
    t => 0.6 * bump(t, PH.descend.start + 5, PH.descend.end) + 0.1 * wave(6, t * 1.9),
    t => grip[t],
  ].map((f, r) => Float32Array.from({ length: T }, (_, t) => clamp(f(t) + 0.05 * calm(t) * Math.sin(t * 2.7 + r * 1.3), -1, 1)));

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, u) => {
    const [x, y] = [hex(a), hex(b)];
    return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], u))).join(',')})`;
  };
  const rampAt = u => {
    const n = C.ramp.length - 1, i = Math.min(Math.floor(u * n), n - 1);
    return mix(C.ramp[i], C.ramp[i + 1], u * n - i);
  };

  let W = 0, H = 0, dpr = 1, L = null;

  const layout = () => {
    const wide = W >= 600;
    const sceneW = wide ? Math.min(W * 0.56, 470) : W;
    const k = sceneW / (VIEW.x1 - VIEW.x0);
    const sceneH = k * (VIEW.y1 - VIEW.y0);
    const labelW = wide ? 54 : 44;
    const gx = labelW, gw = W - labelW - 4;
    const bandY = sceneH + 20, bandH = 18;
    const rwY = bandY + bandH + 8, rwH = 12;
    const axY = rwY + rwH + 12;
    return { wide, sceneW, sceneH, k, gx, gw, bandY, bandH, rwY, rwH, axY, height: axY + 8 };
  };

  const sx = x => (x - VIEW.x0) * L.k;
  const sy = y => (VIEW.y1 - y) * L.k;
  const tx = t => L.gx + (t / T) * L.gw;

  const ik = ([px, py]) => {
    const { base: [bx, by], l1, l2, hand } = ARM;
    const wx = px, wy = py + hand;
    const dx = wx - bx, dy = wy - by, d = Math.min(Math.hypot(dx, dy), l1 + l2 - 1e-4);
    const a = Math.atan2(dy, dx) + Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
    return { s: [bx, by], e: [bx + l1 * Math.cos(a), by + l1 * Math.sin(a)], w: [wx, wy], p: [px, py] };
  };

  const poseAt = s => {
    const i = clamp(Math.floor(s), 0, T - 1), j = Math.min(i + 1, T - 1), u = clamp(s - i, 0, 1);
    return { p: lerp2(P[i], P[j], u), g: lerp(grip[i], grip[j], u), t: s };
  };

  const line = (a, b, w, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(sx(a[0]), sy(a[1]));
    ctx.lineTo(sx(b[0]), sy(b[1]));
    ctx.stroke();
  };
  const capsule = (a, b, w) => {
    line(a, b, w, C.ink);
    line(a, b, Math.max(w - 3, 1), C.link);
  };
  const joint = (p, r) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx(p[0]), sy(p[1]), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.flash;
    ctx.beginPath();
    ctx.arc(sx(p[0]), sy(p[1]), r * 0.36, 0, Math.PI * 2);
    ctx.fill();
  };

  const gripperGeom = (p, g) => {
    const gap = lerp(ARM.open, ARM.closed, g);
    return { gap, palm: [[p[0] - gap - 0.012, p[1]], [p[0] + gap + 0.012, p[1]]], fingers: [-1, 1].map(s => [[p[0] + s * gap, p[1]], [p[0] + s * gap, p[1] - ARM.finger]]) };
  };

  const drawGhost = s => {
    const { p, g } = poseAt(s);
    const gg = gripperGeom(p, g);
    ctx.lineCap = 'round';
    for (const [a, b] of [[p, [p[0], p[1] + ARM.hand]], gg.palm, ...gg.fingers]) line(a, b, 1.1, 'rgba(0, 0, 0, 0.1)');
  };

  const drawArm = ({ p, g }) => {
    const j = ik(p), gg = gripperGeom(p, g), k = L.k;
    ctx.lineCap = 'round';
    capsule(j.s, j.e, 0.062 * k);
    capsule(j.e, j.w, 0.052 * k);
    capsule(j.w, j.p, 0.044 * k);
    capsule(...gg.palm, 0.03 * k);
    for (const [a, b] of gg.fingers) {
      line(a, b, 0.026 * k, C.ink);
      line([b[0], b[1] + 0.03], b, 0.014 * k, g > 0.6 ? C.flash : '#525252');
    }
    joint(j.s, 0.036 * k);
    joint(j.e, 0.032 * k);
    joint(j.w, 0.026 * k);
  };

  const drawGlass = (off, t) => {
    const { x, h, rb, rt } = GLASS;
    const ox = x + off[0], oy = off[1];
    const l = t - PH.lift.start;
    const tilt = l >= 0 ? 0.05 * Math.sin(l * 0.16) * Math.exp(-l / 55) : 0;
    const X = sx(ox), Y0 = sy(oy), Y1 = sy(oy + h), B = rb * L.k, R = rt * L.k, rim = 0.012 * L.k;
    const edge = y => lerp(B, R, (Y0 - y) / (Y0 - Y1));

    const wy = sy(oy + h * 0.62);
    ctx.fillStyle = C.water;
    ctx.beginPath();
    ctx.moveTo(X - B, Y0);
    ctx.lineTo(X - edge(wy), wy + tilt * L.k);
    ctx.lineTo(X + edge(wy), wy - tilt * L.k);
    ctx.lineTo(X + B, Y0);
    ctx.closePath();
    ctx.fill();

    const grad = ctx.createLinearGradient(X - R, 0, X + R, 0);
    grad.addColorStop(0, 'rgba(229, 229, 229, 0.55)');
    grad.addColorStop(0.5, 'rgba(245, 245, 245, 0.25)');
    grad.addColorStop(1, 'rgba(212, 212, 212, 0.5)');
    ctx.fillStyle = grad;
    ctx.strokeStyle = C.glass;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(X - B, Y0);
    ctx.lineTo(X - R, Y1);
    ctx.lineTo(X + R, Y1);
    ctx.lineTo(X + B, Y0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(163, 163, 163, 0.55)';
    ctx.fillRect(X - B + 1, Y0 - 0.016 * L.k, 2 * B - 2, 0.016 * L.k);
    ctx.beginPath();
    ctx.ellipse(X, Y1, R, rim, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X - B * 0.62, Y0 - 0.03 * L.k);
    ctx.lineTo(X - R * 0.66, Y1 + 0.03 * L.k);
    ctx.stroke();
  };

  const drawScene = s => {
    const { k, sceneW } = L;
    const floor = sy(0);
    const grad = ctx.createLinearGradient(0, floor, 0, L.sceneH);
    grad.addColorStop(0, '#f2f2f2');
    grad.addColorStop(1, 'rgba(242, 242, 242, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, floor, sceneW, L.sceneH - floor);
    ctx.strokeStyle = '#d4d4d4';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, floor);
    ctx.lineTo(sceneW, floor);
    ctx.stroke();

    const pose = poseAt(s);
    const g0 = P[PH.lift.start - 1];
    const off = s >= PH.lift.start ? [pose.p[0] - g0[0], pose.p[1] - g0[1]] : [0, 0];
    const lift = clamp(off[1] / 0.25, 0, 1);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.12 * (1 - lift * 0.7)})`;
    ctx.beginPath();
    ctx.ellipse(sx(GLASS.x + off[0]), floor + 2, GLASS.rb * k * (1.3 + lift * 0.8), 0.014 * k, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e5e5e5';
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    const pw = 0.09 * k;
    ctx.beginPath();
    ctx.moveTo(sx(0) - pw, floor);
    ctx.lineTo(sx(0) - pw * 0.62, sy(ARM.base[1] - 0.03));
    ctx.lineTo(sx(0) + pw * 0.62, sy(ARM.base[1] - 0.03));
    ctx.lineTo(sx(0) + pw, floor);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.fillRect(sx(0) - pw * 1.2, floor - 4, pw * 2.4, 4);

    for (let t = 0; t < T; t++) {
      const past = t < s;
      ctx.fillStyle = past ? rampAt(t / (T - 1)) : C.dotFuture;
      ctx.beginPath();
      ctx.arc(sx(P[t][0]), sy(P[t][1]), past ? 1.4 : 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let t = 0; t < Math.min(s, T); t += 25) drawGhost(t);
    drawGlass(off, s);
    drawArm(pose);
    ctx.font = '500 9.5px "Geist Mono", monospace';
    ctx.textBaseline = 'middle';
    for (const t of [100, 200]) {
      if (t > s) continue;
      const x = sx(P[t][0]), y = sy(P[t][1]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.accent;
      ctx.textAlign = 'left';
      ctx.fillText(`step ${t}`, x + (t === 100 ? 7 : (ARM.open + 0.01) * L.k), y - 1);
    }


    if (s < T) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx(pose.p[0]), sy(pose.p[1]), 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const drawReadout = (s, done) => {
    const rx = L.sceneW + 30, rw = W - rx, step = Math.min(22, (L.sceneH - 128) / 6), ry = Math.max(4, (L.sceneH - 118 - 6 * step) / 2);
    const i = clamp(Math.floor(s), 0, T - 1);
    const ph = phaseAt(i);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.muted;
    ctx.font = '500 10px "Geist Mono", monospace';
    ctx.letterSpacing = '0.12em';
    ctx.fillText('CONTROL STEP', rx, ry + 12);
    ctx.letterSpacing = '0px';

    const n = done ? T : Math.min(T, Math.floor(s) + 1);
    ctx.font = '500 40px Geist, sans-serif';
    ctx.fillStyle = C.text;
    const num = String(n).padStart(3, ' ');
    ctx.fillText(num, rx, ry + 54);
    const nw = ctx.measureText(num).width;
    ctx.font = '400 18px Geist, sans-serif';
    ctx.fillStyle = C.faint;
    ctx.fillText(`/ ${T}`, rx + nw + 8, ry + 54);

    ctx.font = '400 12px "Geist Mono", monospace';
    ctx.fillStyle = C.muted;
    const lead = done ? 'task complete ' : 'phase ';
    ctx.fillText(lead, rx, ry + 78);
    ctx.fillStyle = C.accent;
    ctx.font = '500 12px "Geist Mono", monospace';
    ctx.fillText(done ? 'glass held' : ph.name, rx + ctx.measureText(lead).width + 2, ry + 78);

    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx, ry + 94);
    ctx.lineTo(rx + rw, ry + 94);
    ctx.stroke();

    const bx = rx + 52, bw = rw - 52 - 44, cx = bx + bw / 2;
    ROWS.forEach((name, r) => {
      const y = ry + 112 + r * step, v = A[r][i];
      ctx.fillStyle = '#525252';
      ctx.font = '500 11px "Geist Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, rx, y);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(bx, y - 4, bw, 8);
      ctx.fillStyle = v >= 0 ? C.pos : C.neg;
      const len = (v * bw) / 2;
      ctx.fillRect(Math.min(cx, cx + len), y - 4, Math.abs(len), 8);
      ctx.fillStyle = '#b5b5b5';
      ctx.fillRect(cx - 0.5, y - 7, 1, 14);
      ctx.fillStyle = C.muted;
      ctx.font = '400 10.5px "Geist Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`, rx + rw, y);
      ctx.textAlign = 'left';
    });
    ctx.textBaseline = 'alphabetic';
  };

  const drawTimeline = (s, post) => {
    const { gx, gw, bandY, bandH, rwY, rwH, axY, wide } = L;
    const cur = Math.min(s, T);
    const i = clamp(Math.floor(s), 0, T - 1);
    const small = wide ? 10.5 : 9.5;

    for (const ph of PHASES) {
      const x0 = tx(ph.start), x1 = tx(ph.end);
      const now = post < 0 && i >= ph.start && i < ph.end;
      ctx.fillStyle = now ? C.bandNow : cur >= ph.end ? C.bandPast : C.band;
      ctx.fillRect(x0, bandY, x1 - x0 - 1.5, bandH);
      ctx.fillStyle = now ? C.accent : cur >= ph.start ? '#525252' : C.faint;
      const weight = now ? '700 ' : '';
      ctx.font = `${weight}${small}px Geist, sans-serif`;
      const fit = Math.min(1, (x1 - x0 - 6) / ctx.measureText(ph.name).width);
      ctx.font = `${weight}${Math.max(8, small * fit)}px Geist, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ph.name, (x0 + x1) / 2, bandY + bandH / 2 + 0.5);
    }

    ctx.textAlign = 'left';
    ctx.font = `500 ${small}px "Geist Mono", monospace`;
    ctx.fillStyle = C.muted;
    ctx.fillText('phase', 0, bandY + bandH / 2);
    ctx.fillText('reward', 0, rwY + rwH / 2 + 0.5);

    const cutX = tx(cur);

    ctx.fillStyle = C.band;
    ctx.fillRect(gx, rwY, gw, rwH);
    for (let t = 5; t < T - 5; t += 10) {
      ctx.fillStyle = t < cur ? '#a3a3a3' : '#e5e5e5';
      ctx.fillRect(tx(t) - 0.5, rwY + rwH / 2 - 0.5, 1.2, 1.2);
    }
    const ex = tx(T) - rwH;
    const got = post >= 0;
    if (got) {
      const glow = Math.exp(-post / 0.7);
      ctx.save();
      ctx.shadowColor = 'rgba(232, 137, 47, 0.9)';
      ctx.shadowBlur = 6 + 14 * glow;
      ctx.fillStyle = C.flash;
      ctx.fillRect(ex, rwY, rwH, rwH);
      ctx.restore();
      ctx.fillStyle = C.accent;
      ctx.font = `500 ${small + 0.5}px "Geist Mono", monospace`;
      ctx.textAlign = 'right';
      ctx.fillText('+1', ex - 5, rwY + rwH / 2 + 0.5);
    } else {
      ctx.strokeStyle = C.flash;
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.strokeRect(ex + 0.5, rwY + 0.5, rwH - 1, rwH - 1);
      ctx.setLineDash([]);
    }

    if (got) {
      const u = mj((post - 0.45) / 1.7);
      if (u > 0) {
        const hx = lerp(ex - 30, gx + 2, u);
        const g = ctx.createLinearGradient(hx, 0, hx + 90, 0);
        g.addColorStop(0, `rgba(232, 137, 47, ${0.34 * (1 - u * 0.5)})`);
        g.addColorStop(1, 'rgba(232, 137, 47, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(hx, bandY, Math.min(90, ex - hx), rwY + rwH - bandY);
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(ex - 30, rwY + rwH / 2);
        ctx.lineTo(hx, rwY + rwH / 2);
        ctx.stroke();
        ctx.fillStyle = C.accent;
        ctx.beginPath();
        ctx.moveTo(hx - 1, rwY + rwH / 2);
        ctx.lineTo(hx + 6, rwY + rwH / 2 - 4);
        ctx.lineTo(hx + 6, rwY + rwH / 2 + 4);
        ctx.fill();
        const msg = 'credit for success must reach back through all 500 steps';
        ctx.font = `500 ${small}px Geist, sans-serif`;
        const mw = ctx.measureText(msg).width + 14, mx = gx + gw / 2 - 20;
        ctx.globalAlpha = clamp((u - 0.5) * 3, 0, 1);
        ctx.fillStyle = C.panel;
        ctx.fillRect(mx - mw / 2, rwY - 1, mw, rwH + 2);
        ctx.fillStyle = C.accent;
        ctx.textAlign = 'center';
        ctx.fillText(msg, mx, rwY + rwH / 2 + 0.5);
        ctx.globalAlpha = 1;
      }
    }

    ctx.textAlign = 'center';
    ctx.font = `400 ${small - 0.5}px "Geist Mono", monospace`;
    ctx.fillStyle = C.faint;
    for (let t = 0; t <= T; t += 100) {
      ctx.textAlign = t === 0 ? 'left' : t === T ? 'right' : 'center';
      ctx.fillText(String(t), tx(t), axY);
    }
    ctx.textAlign = 'left';
    ctx.fillText('step', 0, axY);

    if (!got) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cutX, bandY - 4);
      ctx.lineTo(cutX, rwY + rwH + 2);
      ctx.stroke();
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.moveTo(cutX - 4, bandY - 8);
      ctx.lineTo(cutX + 4, bandY - 8);
      ctx.lineTo(cutX, bandY - 3);
      ctx.fill();
    }
  };

  const render = tau => {
    const s = clamp((tau / RUN) * T, 0, T);
    const post = tau >= RUN ? tau - RUN : -1;
    ctx.clearRect(0, 0, W, H);
    drawScene(s);
    if (L.wide) drawReadout(s, post >= 0);
    drawTimeline(s, post);
    const fade = tau > RUN + POST ? (tau - RUN - POST) / FADE : tau < 0.35 ? 1 - tau / 0.35 : 0;
    if (fade > 0) {
      ctx.fillStyle = `rgba(250, 250, 250, ${fade})`;
      ctx.fillRect(0, 0, W, H);
    }
    elReward.textContent = post >= 0 ? '+1' : '0';
  };

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth;
    L = layout();
    H = L.height;
    stage.style.height = `${H}px`;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const STILL = RUN + POST - 0.01;
  let raf = 0, t0 = null, tNow = 0.4, visible = false;
  const loop = now => {
    if (t0 === null) t0 = now - tNow * 1000;
    tNow = ((now - t0) / 1000) % CYCLE;
    render(tNow);
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!raf && !reduced) { t0 = null; raf = requestAnimationFrame(loop); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  if (reduced) tNow = STILL;
  resize();
  render(tNow);
  new ResizeObserver(() => { resize(); render(tNow); }).observe(stage);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : visible && start()));
  document.fonts.ready.then(() => render(tNow));
})();
