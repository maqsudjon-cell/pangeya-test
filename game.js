/* MPSF hop. Pick a name, then one-button jump. Scores are shared. */
(function () {
  var PAPER = "#f7f1e8";
  var INK = "#14110f";
  var CINN = "#8c2a24";
  var DUST = "#7e746c";
  var LINE = "#e4d8cc";
  var ASH = "#5c564e";
  var BLUSH = "#c45c52";
  var LIVE = "https://crudcrud.com/api/6bf92a3a1f284c42bf03d2018fa2c01e/scores";
  var WHO_KEY = "mpsf-who";
  var BOARD_KEY = "mpsf-board";
  var QUEUE_KEY = "mpsf-queue";
  var INK_PAL = { body: "#2c2824", shade: INK, light: "#6a635a", face: PAPER };
  var CINN_PAL = { body: CINN, shade: "#5c1a16", light: BLUSH, face: "#f6e3dc" };
  var generation = 0;

  function emptyBoard() {
    return {
      mp: { name: "Maqsudjon", best: 0, at: null },
      sf: { name: "Sohiba", best: 0, at: null }
    };
  }

  function clampBest(n) {
    n = Math.floor(Number(n) || 0);
    if (n < 0 || n > 5000) return 0;
    return n;
  }

  function accept(run) {
    if (!run || run.tag !== "mpsf-hop") return false;
    if (run.side !== "mp" && run.side !== "sf") return false;
    var score = Math.floor(Number(run.score));
    var ms = Math.floor(Number(run.ms));
    if (!isFinite(score) || score < 1 || score > 5000) return false;
    if (!isFinite(ms) || ms < 400 || ms > 30 * 60 * 1000) return false;
    if (score > ms / 1000 * 15 + 30) return false;
    return true;
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function mount(root) {
    if (root.dataset.live === "1") return function () {};
    root.dataset.live = "1";
    var gen = ++generation;
    root.innerHTML =
      '<div class="arena-stage">' +
      '<canvas aria-hidden="true"></canvas>' +
      '<p class="arena-bubble"></p>' +
      '<p class="arena-score" hidden></p>' +
      "</div>" +
      '<div class="arena-dock">' +
      '<div class="arena-board" aria-live="polite">' +
      '<button type="button" data-pick="mp"><span>Maqsudjon</span><b>—</b></button>' +
      '<button type="button" data-pick="sf"><span>Sohiba</span><b>—</b></button>' +
      "</div>" +
      '<button type="button" class="arena-go" hidden>Boshlash</button>' +
      '<p class="arena-status">Eng yaxshi ball shu yerda turadi</p>' +
      "</div>";

    var stage = root.querySelector(".arena-stage");
    var canvas = root.querySelector("canvas");
    var bubble = root.querySelector(".arena-bubble");
    var scoreEl = root.querySelector(".arena-score");
    var picks = root.querySelectorAll("[data-pick]");
    var go = root.querySelector(".arena-go");
    var statusEl = root.querySelector(".arena-status");
    var ctx = canvas.getContext("2d");

    var W = 360;
    var H = 320;
    var GROUND = 268;
    var state = "idle";
    var raf = 0;
    var last = 0;
    var acc = 0;
    var t = 0;
    var shake = 0;
    var score = 0;
    var speed = 210;
    var spawnIn = 0;
    var px = 78;
    var py = 0;
    var vy = 0;
    var jumps = 0;
    var coyote = 0;
    var buffer = 0;
    var squash = 1;
    var blink = 0;
    var runMs = 0;
    var obs = [];
    var seals = [];
    var motes = [];
    var audio;
    var dead = false;
    var flushing = false;
    var saved = readJson(WHO_KEY, "");
    var player = saved === "mp" || saved === "sf" ? saved : null;
    var board = emptyBoard();
    var queue = readJson(QUEUE_KEY, []);
    if (!Array.isArray(queue)) queue = [];
    var cached = readJson(BOARD_KEY, null);
    if (cached && cached.mp && cached.sf) {
      board.mp.best = clampBest(cached.mp.best);
      board.sf.best = clampBest(cached.sf.best);
      board.mp.at = cached.mp.at || null;
      board.sf.at = cached.sf.at || null;
    }

    function beep(freq, dur, gain) {
      try {
        if (!audio) audio = new AudioContext();
        if (audio.state === "suspended") audio.resume();
        var o = audio.createOscillator();
        var g = audio.createGain();
        o.type = "square";
        o.frequency.value = freq;
        g.gain.value = gain;
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
        o.connect(g);
        g.connect(audio.destination);
        o.start();
        o.stop(audio.currentTime + dur);
      } catch (e) {}
    }

    function status(text) {
      if (dead || gen !== generation) return;
      statusEl.textContent = text;
    }

    function persistBoard() {
      try {
        localStorage.setItem(BOARD_KEY, JSON.stringify(board));
      } catch (e) {}
    }

    function persistQueue() {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, 20)));
      } catch (e) {}
    }

    function noteBest(side, value, at) {
      value = clampBest(value);
      if (value > board[side].best) {
        board[side].best = value;
        board[side].at = at || board[side].at;
        persistBoard();
      }
    }

    function paintBoard() {
      if (dead || gen !== generation) return;
      for (var i = 0; i < picks.length; i++) {
        var btn = picks[i];
        var side = btn.dataset.pick;
        btn.querySelector("b").textContent = board[side].best ? String(board[side].best) : "—";
        btn.setAttribute("aria-pressed", String(player === side));
        btn.disabled = state === "play";
      }
    }

    function resize() {
      var rect = stage.getBoundingClientRect();
      W = Math.max(280, rect.width || 360);
      H = Math.max(220, rect.height || 280);
      GROUND = H - 46;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (state !== "play") py = GROUND - 64;
    }

    function feetOnGround() {
      return py >= GROUND - 64 - 0.6;
    }

    function resetRun() {
      score = 0;
      speed = 210;
      spawnIn = 90;
      px = Math.min(92, W * 0.24);
      py = GROUND - 64;
      vy = 0;
      jumps = 0;
      coyote = 0;
      buffer = 0;
      squash = 1;
      shake = 0;
      runMs = 0;
      obs.length = 0;
      seals.length = 0;
      motes.length = 0;
    }

    function showIdle() {
      state = "idle";
      bubble.hidden = false;
      bubble.textContent = player ? "O‘ynaymizmi?" : "Kim o‘ynaydi?";
      scoreEl.hidden = true;
      go.hidden = !player;
      go.textContent = "Boshlash";
      paintBoard();
    }

    function start() {
      if (!player || state === "play") return;
      resetRun();
      state = "play";
      bubble.hidden = true;
      scoreEl.hidden = false;
      scoreEl.textContent = "0";
      go.hidden = true;
      status("");
      paintBoard();
      beep(420, 0.06, 0.03);
    }

    function finish() {
      state = "over";
      shake = 10;
      var notable = score > board[player].best;
      bubble.hidden = false;
      bubble.textContent = notable ? "Yangi rekord" : score > 0 ? "Yana bir marta" : "Yana";
      scoreEl.hidden = false;
      scoreEl.textContent = String(score);
      go.hidden = false;
      go.textContent = "Yana";
      paintBoard();
      beep(140, 0.18, 0.04);
      if (score > 0) keep(player, score, runMs, notable);
    }

    function keep(side, value, ms, notable) {
      var run = {
        tag: "mpsf-hop",
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        side: side,
        score: Math.floor(value),
        ms: Math.max(400, Math.round(ms)),
        at: new Date().toISOString(),
        echo: notable ? 1 : 0
      };
      if (!accept(run)) {
        if (notable) status("Bu ball saqlanmadi");
        return;
      }
      noteBest(side, run.score, run.at);
      paintBoard();
      queue.push(run);
      persistQueue();
      if (notable) status("Saqlanmoqda");
      flush();
    }

    function flush() {
      if (flushing || dead || gen !== generation) return;
      flushing = true;
      pump();
    }

    function pump() {
      if (dead || gen !== generation) {
        flushing = false;
        return;
      }
      if (!queue.length) {
        flushing = false;
        return;
      }
      var run = queue[0];
      fetch(LIVE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(run)
      })
        .then(function (res) {
          if (!res.ok) throw new Error("save");
          return res.json();
        })
        .then(function () {
          if (dead || gen !== generation) {
            flushing = false;
            return;
          }
          queue.shift();
          persistQueue();
          if (!queue.length && run.echo) status("Saqlandi");
          pump();
        })
        .catch(function () {
          flushing = false;
          if (!dead && gen === generation && run.echo) status("Saqlanmadi");
        });
    }

    function refresh() {
      var live = fetch(LIVE, { headers: { Accept: "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error("board");
          return res.json();
        })
        .catch(function () {
          return [];
        });
      var archive = fetch("/board.json", { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("archive");
          return res.json();
        })
        .catch(function () {
          return null;
        });
      Promise.all([live, archive]).then(function (pair) {
        if (dead || gen !== generation) return;
        var runs = Array.isArray(pair[0]) ? pair[0] : [];
        var seen = {};
        for (var i = 0; i < runs.length; i++) {
          var run = runs[i];
          if (!accept(run)) continue;
          if (run.id) seen[run.id] = 1;
          noteBest(run.side, run.score, run.at);
        }
        var archived = pair[1];
        if (archived) {
          if (archived.mp) noteBest("mp", archived.mp.best, archived.mp.at);
          if (archived.sf) noteBest("sf", archived.sf.best, archived.sf.at);
        }
        queue = queue.filter(function (item) {
          return item && !seen[item.id];
        });
        persistQueue();
        paintBoard();
        flush();
      });
    }

    function choose(side) {
      if (state === "play") return;
      player = side;
      try {
        localStorage.setItem(WHO_KEY, side);
      } catch (e) {}
      if (state !== "play") {
        bubble.hidden = false;
        bubble.textContent = "O‘ynaymizmi?";
        go.hidden = false;
        go.textContent = state === "over" ? "Yana" : "Boshlash";
      }
      paintBoard();
    }

    function tryJump() {
      var dust = player === "sf" ? CINN : INK;
      if (feetOnGround() || coyote > 0) {
        vy = -640;
        jumps = 1;
        coyote = 0;
        buffer = 0;
        squash = 1.25;
        beep(500, 0.07, 0.035);
        return;
      }
      if (jumps < 2) {
        vy = -540;
        jumps = 2;
        buffer = 0;
        squash = 0.82;
        puff(px + 28, py + 20, dust);
        beep(680, 0.06, 0.03);
      }
    }

    function puff(x, y, color) {
      for (var i = 0; i < 5; i++) {
        motes.push({
          x: x,
          y: y,
          vx: (Math.random() - 0.5) * 80,
          vy: -40 - Math.random() * 80,
          life: 0.35 + Math.random() * 0.2,
          color: color
        });
      }
    }

    function step(dt) {
      t += dt;
      blink -= dt;
      if (blink < -0.12) blink = 2.6 + Math.random();
      if (shake > 0) shake = Math.max(0, shake - dt * 28);
      for (var m = motes.length - 1; m >= 0; m--) {
        var mote = motes[m];
        mote.life -= dt;
        mote.x += mote.vx * dt;
        mote.y += mote.vy * dt;
        if (mote.life <= 0) motes.splice(m, 1);
      }
      if (state !== "play") {
        squash += (1 - squash) * Math.min(1, dt * 8);
        return;
      }
      runMs += dt * 1000;
      speed = Math.min(360, 210 + score * 3.2);
      if (buffer > 0) {
        buffer -= dt;
        tryJump();
      }
      vy += 1750 * dt;
      if (vy > 900) vy = 900;
      py += vy * dt;
      if (py > GROUND - 64) {
        py = GROUND - 64;
        if (vy > 80) squash = 1.18;
        vy = 0;
        jumps = 0;
        coyote = 0.09;
      } else {
        coyote = Math.max(0, coyote - dt);
      }
      squash += (1 - squash) * Math.min(1, dt * 10);

      spawnIn -= speed * dt;
      if (spawnIn <= 0) {
        var tall = Math.random() < 0.38 + Math.min(0.2, score * 0.004);
        var h = tall ? 54 : 30;
        obs.push({ x: W + 8, w: 18, h: h, passed: false });
        var high = Math.random() < 0.45;
        seals.push({
          x: W + 8 + (tall ? 46 : 28),
          y: GROUND - (high ? 128 : 86),
          got: false
        });
        var gap = Math.max(200, 300 - score * 2.2);
        spawnIn = gap + Math.random() * 70;
      }

      var hitL = px + 18;
      var hitT = py + 16;
      var hitW = 26;
      var hitH = 42;
      for (var i = obs.length - 1; i >= 0; i--) {
        var o = obs[i];
        o.x -= speed * dt;
        if (!o.passed && o.x + o.w < hitL) {
          o.passed = true;
          score += 1;
          scoreEl.textContent = String(score);
        }
        var ox = o.x;
        var oy = GROUND - o.h;
        if (hitL < ox + o.w && hitL + hitW > ox && hitT < oy + o.h && hitT + hitH > oy) {
          finish();
          return;
        }
        if (o.x < -40) obs.splice(i, 1);
      }
      for (var s = seals.length - 1; s >= 0; s--) {
        var seal = seals[s];
        seal.x -= speed * dt;
        if (!seal.got) {
          var sx = seal.x - 8;
          var sy = seal.y - 8;
          if (hitL < sx + 16 && hitL + hitW > sx && hitT < sy + 16 && hitT + hitH > sy) {
            seal.got = true;
            score += 3;
            scoreEl.textContent = String(score);
            puff(seal.x, seal.y, CINN);
            beep(760, 0.08, 0.03);
          }
        }
        if (seal.x < -20) seals.splice(s, 1);
      }
    }

    function buddy(x, y, s, pal, mood, phase) {
      var rows = [
        "................",
        ".....######.....",
        "....########....",
        "...##########...",
        "..############..",
        "..############..",
        "..############..",
        "...##########...",
        "..############..",
        ".##############.",
        "################",
        "##...######...##",
        "....########....",
        "....###..###....",
        "....##....##....",
        "....#......#...."
      ];
      var run = mood === "run" ? Math.sin(phase) : 0;
      if (run > 0.3) {
        rows[13] = "....##....###...";
        rows[14] = "....#......##...";
      } else if (run < -0.3) {
        rows[13] = "...###....##....";
        rows[14] = "...##......#....";
      }
      if (mood === "jump") {
        rows[9] = "################";
        rows[10] = "##...######...##";
        rows[11] = "#....######....#";
        rows[13] = ".....##..##.....";
        rows[14] = ".....#....#.....";
      }
      var eyes =
        mood === "hurt"
          ? ["....xx....xx....", ".....x....x....."]
          : blink > 0 && blink < 0.12
            ? ["................", "................"]
            : ["....ww...ww.....", ".....ww.ww......"];
      paintRow(rows, 5, eyes[0]);
      paintRow(rows, 6, eyes[1]);
      paintRow(rows, 7, "......mmmm......");
      for (var r = 0; r < rows.length; r++) {
        for (var c = 0; c < 16; c++) {
          var ch = rows[r][c];
          if (ch === "." || !ch) continue;
          var color = pal.body;
          if (ch === "w" || ch === "m" || ch === "x") color = pal.face;
          else if (r > 13) color = pal.shade;
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(x + c * s), Math.round(y + r * s), s, s);
        }
      }
    }

    function paintRow(rows, index, bits) {
      var next = rows[index].split("");
      for (var i = 0; i < 16; i++) if (bits[i] && bits[i] !== ".") next[i] = bits[i];
      rows[index] = next.join("");
    }

    function sealDot(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2);
      ctx.fillStyle = CINN;
      ctx.fill();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      ctx.fillStyle = LINE;
      ctx.fillRect(0, GROUND, W, 1);
      var tick = (t * speed) % 28;
      ctx.fillStyle = "#efe4d6";
      for (var gx = -tick; gx < W; gx += 28) ctx.fillRect(gx, GROUND + 10, 10, 2);

      if (state === "idle") {
        var s = Math.max(5, Math.min(7, Math.floor(W / 70)));
        var y = GROUND - 16 * s;
        var gap = 18 * s;
        var x0 = (W - gap * 2) / 2;
        var phase = t * 2;
        buddy(x0, y + Math.sin(phase) * 2, s, INK_PAL, "idle", phase);
        buddy(x0 + gap, y + Math.sin(phase + 1) * 2, s, CINN_PAL, "idle", phase);
        sealDot(W / 2, y + 6 * s, s * 0.9);
      } else {
        var pal = player === "sf" ? CINN_PAL : INK_PAL;
        var other = player === "sf" ? INK_PAL : CINN_PAL;
        var ps = 3;
        var watchX = state === "over" ? Math.min(W - 16 * ps - 8, px + 86) : 8;
        buddy(watchX, GROUND - 16 * ps + Math.sin(t * 2) * 1.5, ps, other, "idle", t * 2);
        for (var i = 0; i < obs.length; i++) {
          var o = obs[i];
          ctx.fillStyle = INK;
          ctx.fillRect(Math.round(o.x), GROUND - o.h, o.w, o.h);
          ctx.fillStyle = ASH;
          ctx.fillRect(Math.round(o.x), GROUND - o.h, 3, o.h);
        }
        for (var k = 0; k < seals.length; k++) {
          if (!seals[k].got) sealDot(seals[k].x, seals[k].y, 7);
        }
        var mood = state === "over" ? "hurt" : jumps > 0 ? "jump" : "run";
        var sc = 4 * squash;
        var sw = 16 * 4;
        var drawX = px + (sw - 16 * sc) / 2;
        var drawY = py + 64 - 16 * sc;
        buddy(drawX, drawY, sc, pal, mood, t * 14);
      }

      for (var n = 0; n < motes.length; n++) {
        ctx.globalAlpha = Math.max(0, motes[n].life * 2);
        ctx.fillStyle = motes[n].color;
        ctx.fillRect(motes[n].x, motes[n].y, 3, 3);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function frame(now) {
      if (dead) return;
      if (!last) last = now;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= 1 / 60) {
        step(1 / 60);
        acc -= 1 / 60;
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function onPointer(e) {
      if (!player) return;
      if (state !== "play") {
        start();
        return;
      }
      if (e.cancelable) e.preventDefault();
      if (feetOnGround() || coyote > 0 || jumps < 2) tryJump();
      else buffer = 0.12;
    }

    function onKey(e) {
      if (e.target && e.target.closest && e.target.closest("input, textarea")) return;
      if (e.code !== "Space" && e.code !== "ArrowUp") return;
      if (!root.isConnected || dead) return;
      e.preventDefault();
      if (!player) return;
      if (state === "play") {
        if (feetOnGround() || coyote > 0 || jumps < 2) tryJump();
        else buffer = 0.12;
      } else start();
    }

    function onPick(e) {
      var btn = e.currentTarget;
      if (btn.disabled) return;
      choose(btn.dataset.pick);
    }

    go.addEventListener("click", function (e) {
      e.stopPropagation();
      start();
    });
    for (var p = 0; p < picks.length; p++) picks[p].addEventListener("click", onPick);
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", resize);
    resize();
    showIdle();
    refresh();
    var poll = setInterval(function () {
      if (dead || gen !== generation || document.hidden) return;
      refresh();
    }, 40000);
    raf = requestAnimationFrame(frame);

    return function destroy() {
      dead = true;
      generation += 1;
      root.dataset.live = "";
      clearInterval(poll);
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", resize);
    };
  }

  window.mountMpsfGame = mount;
  function boot() {
    if (window.__mpsfManual) return;
    var nodes = document.querySelectorAll("[data-seal-game]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].dataset.live) continue;
      mount(nodes[i]);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
