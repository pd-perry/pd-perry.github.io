(() => {
  const root = document.querySelector('.selfplay-figure');
  if (!root) return;

  const base = root.querySelector('.selfplay-base');
  const over = root.querySelector('.selfplay-overlay');
  const stage = root.querySelector('.selfplay-stage');
  const elDone = root.querySelector('[data-stat="done"]');
  const elVer = root.querySelector('[data-stat="version"]');
  const elPar = root.querySelector('[data-stat="parallel"]');
  const bctx = base.getContext('2d');
  const octx = over.getContext('2d');

  const COLS = 24, ROWS = 12, N = 9, B = COLS * ROWS;
  const PERIOD = 5.4, SWEEP = 1.1;
  const LENS_COL = 10, LENS_ROW = 4;
  const LENS = LENS_ROW * COLS + LENS_COL;
  const C = {
    board: '#f2f2f2',
    black: '#1a1a1a',
    white: '#ffffff',
    whiteEdge: '#b5b5b5',
    winB: '#e8892f',
    winW: '#d4d4d4',
    flash: '#e8892f',
    accent: '#c2571a',
    line: '#a3a3a3',
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, cell = 0, bs = 0, dpr = 1;
  const drawn = new Int16Array(B).fill(-1);
  const drawnIter = new Int32Array(B).fill(-1);
  const settled = new Uint8Array(B);
  const games = new Array(B);

  const hash = (a, b) => {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const rng = seed => () => (seed = (seed + 0x6d2b79f5) | 0, hash(seed, 97));

  const makeGame = (b, k) => {
    const r = rng(b * 7919 + k * 104729);
    const len = 26 + Math.floor(r() * 36);
    const taken = new Uint8Array(N * N);
    const moves = [];
    while (moves.length < len) {
      let p;
      if (moves.length && r() < 0.72) {
        const q = moves[Math.floor(r() * moves.length)];
        const x = (q % N) + Math.floor(r() * 3) - 1, y = Math.floor(q / N) + Math.floor(r() * 3) - 1;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        p = y * N + x;
      } else p = Math.floor(r() * N * N);
      if (taken[p]) continue;
      taken[p] = 1;
      moves.push(p);
    }
    const margin = (Math.floor(r() * 12) + 0.5).toFixed(1);
    return {
      k, moves,
      jitter: r() * 0.35,
      dur: b === LENS ? 3.6 : 1.5 + r() * 2.1,
      blackWins: r() < 0.5,
      margin,
    };
  };

  const colDelay = c => (c / (COLS - 1)) * SWEEP;

  const stateAt = (b, t) => {
    const c = b % COLS;
    const local = t - colDelay(c);
    const k = Math.floor(local / PERIOD);
    const g = games[b] && games[b].k === k ? games[b] : (games[b] = makeGame(b, k));
    const u = local - k * PERIOD - g.jitter;
    const frac = Math.min(Math.max(u / g.dur, 0), 1);
    const n = Math.floor(frac * g.moves.length);
    const since = u - g.dur;
    return { g, n, done: since >= 0, flash: since >= 0 ? Math.exp(-since / 0.32) : 0 };
  };

  const boardXY = b => [(b % COLS) * cell + (cell - bs) / 2, Math.floor(b / COLS) * cell + (cell - bs) / 2];

  const drawStone = (x, y, p, i) => {
    const sp = bs / N;
    const s = Math.max(sp * 0.86, 1);
    bctx.fillStyle = i % 2 ? C.white : C.black;
    bctx.fillRect(x + (p % N) * sp + (sp - s) / 2, y + Math.floor(p / N) * sp + (sp - s) / 2, s, s);
  };

  const drawBoard = (b, st) => {
    const [x, y] = boardXY(b);
    bctx.clearRect(x - 2, y - 2, bs + 4, bs + 4);
    bctx.fillStyle = st.done ? (st.g.blackWins ? C.winB : C.winW) : C.board;
    bctx.fillRect(x, y, bs, bs);
    for (let i = 0; i < st.n; i++) drawStone(x, y, st.g.moves[i], i);
    if (st.flash > 0.02) {
      bctx.globalAlpha = st.flash * 0.85;
      bctx.fillStyle = C.flash;
      bctx.fillRect(x - 1, y - 1, bs + 2, bs + 2);
      bctx.globalAlpha = 1;
    }
  };

  const updateBoard = (b, t) => {
    const st = stateAt(b, t);
    const fresh = drawnIter[b] !== st.g.k;
    if (fresh || st.n < drawn[b] || (st.done && !settled[b]) || (!st.done && settled[b])) {
      drawBoard(b, st);
      drawn[b] = st.n;
      drawnIter[b] = st.g.k;
      settled[b] = st.done && st.flash <= 0.02 ? 1 : 0;
      return st;
    }
    if (st.n > drawn[b]) {
      const [x, y] = boardXY(b);
      for (let i = drawn[b]; i < st.n; i++) drawStone(x, y, st.g.moves[i], i);
      drawn[b] = st.n;
    }
    return st;
  };

  const lensRect = () => {
    const size = Math.min(H * 0.62, W * 0.34, 190);
    return { x: cell * 1.5, y: H - size - cell * 1.5 - 14, size };
  };

  const drawLens = (t) => {
    const b = LENS;
    const st = stateAt(b, t);
    const { x, y, size } = lensRect();
    const [tx, ty] = boardXY(b);

    octx.strokeStyle = C.accent;
    octx.lineWidth = 1.2;
    octx.setLineDash([3, 3]);
    octx.beginPath();
    octx.moveTo(x + size, y);
    octx.lineTo(tx - 2, ty + bs + 2);
    octx.stroke();
    octx.setLineDash([]);
    octx.lineWidth = 1.6;
    octx.strokeRect(tx - 2.5, ty - 2.5, bs + 5, bs + 5);

    const pad = size * 0.09;
    octx.save();
    octx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    octx.shadowBlur = 16;
    octx.shadowOffsetY = 4;
    octx.fillStyle = C.board;
    roundRect(octx, x, y, size, size, 8);
    octx.fill();
    octx.restore();
    if (st.done) {
      octx.globalAlpha = 0.35 + st.flash * 0.5;
      octx.fillStyle = st.g.blackWins ? C.winB : C.winW;
      roundRect(octx, x, y, size, size, 8);
      octx.fill();
      octx.globalAlpha = 1;
    }
    octx.strokeStyle = st.done ? C.accent : '#d4d4d4';
    octx.lineWidth = st.done ? 2 : 1;
    roundRect(octx, x, y, size, size, 8);
    octx.stroke();

    const g0 = x + pad, sp = (size - 2 * pad) / (N - 1);
    octx.strokeStyle = C.line;
    octx.lineWidth = 0.8;
    octx.beginPath();
    for (let i = 0; i < N; i++) {
      octx.moveTo(g0, g0 - x + y + i * sp);
      octx.lineTo(g0 + (N - 1) * sp, g0 - x + y + i * sp);
      octx.moveTo(g0 + i * sp, y + pad);
      octx.lineTo(g0 + i * sp, y + pad + (N - 1) * sp);
    }
    octx.stroke();
    octx.fillStyle = C.line;
    for (const [i, j] of [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]]) {
      octx.beginPath();
      octx.arc(g0 + i * sp, y + pad + j * sp, 1.8, 0, Math.PI * 2);
      octx.fill();
    }

    const r = sp * 0.44;
    for (let i = 0; i < st.n; i++) {
      const p = st.g.moves[i];
      const cx = g0 + (p % N) * sp, cy = y + pad + Math.floor(p / N) * sp;
      const white = i % 2 === 1;
      const grad = octx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      grad.addColorStop(0, white ? '#ffffff' : '#4a4a4a');
      grad.addColorStop(1, white ? '#e5e5e5' : C.black);
      octx.fillStyle = grad;
      octx.beginPath();
      octx.arc(cx, cy, r, 0, Math.PI * 2);
      octx.fill();
      if (white) {
        octx.strokeStyle = C.whiteEdge;
        octx.lineWidth = 0.7;
        octx.stroke();
      }
      if (i === st.n - 1 && !st.done) {
        octx.strokeStyle = C.flash;
        octx.lineWidth = 1.6;
        octx.beginPath();
        octx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
        octx.stroke();
      }
    }

    const label = st.done
      ? `${st.g.blackWins ? 'B' : 'W'}+${st.g.margin}  ·  reward ${st.g.blackWins ? '+1' : '−1'}`
      : `move ${st.n}`;
    const fs = Math.max(10, Math.min(12, size * 0.07));
    octx.font = `500 ${fs}px Geist, sans-serif`;
    const tw = octx.measureText(label).width + 14;
    const lx = x + size / 2 - tw / 2, ly = y + size + 6;
    octx.fillStyle = st.done ? C.accent : 'rgba(250, 250, 250, 0.95)';
    roundRect(octx, lx, ly, tw, fs + 8, (fs + 8) / 2);
    octx.fill();
    octx.fillStyle = st.done ? '#ffffff' : '#525252';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(label, x + size / 2, ly + (fs + 8) / 2 + 0.5);
  };

  const drawSweep = (t) => {
    const u = t % PERIOD;
    if (u > SWEEP + 0.25) return;
    const sx = (u / SWEEP) * W;
    const fade = u > SWEEP ? 1 - (u - SWEEP) / 0.25 : Math.min(1, u / 0.12);
    const bw = 90;
    const grad = octx.createLinearGradient(sx - bw, 0, sx, 0);
    grad.addColorStop(0, 'rgba(232, 137, 47, 0)');
    grad.addColorStop(1, `rgba(232, 137, 47, ${0.28 * fade})`);
    octx.fillStyle = grad;
    octx.fillRect(sx - bw, 0, bw, H);
    octx.fillStyle = `rgba(194, 87, 26, ${0.85 * fade})`;
    octx.fillRect(sx - 1, 0, 2, H);
  };

  const roundRect = (c, x, y, w, h, r) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };

  const fmt = n => n.toLocaleString('en-US');

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth;
    cell = W / COLS;
    bs = cell * 0.82;
    H = cell * ROWS;
    stage.style.height = `${H}px`;
    for (const cv of [base, over]) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawn.fill(-1);
    drawnIter.fill(-1);
    settled.fill(0);
    bctx.clearRect(0, 0, W, H);
  };

  const START = PERIOD * 11 + 0.4;
  const render = (t) => {
    let done = 0;
    for (let b = 0; b < B; b++) {
      const st = updateBoard(b, t);
      done += st.g.k + (st.done ? 1 : 0);
    }
    octx.clearRect(0, 0, W, H);
    drawSweep(t);
    drawLens(t);
    const k = Math.floor(t / PERIOD);
    elDone.textContent = fmt(done);
    elVer.textContent = `v${k}`;
  };

  elPar.textContent = fmt(B);
  resize();
  let raf = 0, t0 = null, tPaused = START, visible = false;
  const loop = (now) => {
    if (t0 === null) t0 = now - tPaused * 1000;
    tPaused = (now - t0) / 1000;
    render(tPaused);
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!raf && !reduced) { t0 = null; raf = requestAnimationFrame(loop); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  new ResizeObserver(() => { resize(); render(reduced ? START + 3.2 : tPaused); }).observe(stage);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : visible && start()));
  render(reduced ? START + 3.2 : START);
})();
