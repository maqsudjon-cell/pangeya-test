/* MPSF mascots + one-button hop. Mounts into [data-seal-game]. */
(function () {
  var PAPER = "#f7f1e8";
  var INK = "#14110f";
  var CINN = "#8c2a24";
  var DUST = "#7e746c";
  var LINE = "#e4d8cc";
  var ASH = "#5c564e";
  var BLUSH = "#c45c52";
  var BEST_KEY = "mpsf-hop";

  var INK_PAL = { body: "#2c2824", shade: INK, light: "#6a635a", face: PAPER };
  var CINN_PAL = { body: CINN, shade: "#5c1a16", light: BLUSH, face: "#f6e3dc" };

  function mount(root) {
    if (root.dataset.live === "1") return function () {};
    root.dataset.live = "1";
    root.innerHTML =
      '<canvas aria-hidden="true"></canvas>' +
      '<div class="arena-ui">' +
      '<p class="arena-bubble"></p>' +
      '<p class="arena-score" hidden></p>' +
      '<p class="arena-best"></p>' +
      '<button type="button" class="arena-go">Boshlash</button>' +
      "</div>";
    var canvas = root.querySelector("canvas");
    var bubble = root.querySelector(".arena-bubble");
    var scoreEl = root.querySelector(".arena-score");
    var bestEl = root.querySelector(".arena-best");
    var go = root.querySelector(".arena-go");
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
    var best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
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
    var obs = [];
    var seals = [];
    var motes = [];
    var audio;
    var dead = false;

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

    function resize() {
      var rect = root.getBoundingClientRect();
      W = Math.max(280, rect.width);
      H = Math.max(260, rect.height);
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
      obs.length = 0;
      seals.length = 0;
      motes.length = 0;
    }

    function showIdle() {
      state = "idle";
      bubble.hidden = false;
      bubble.textContent = "O‘ynaymizmi?";
      scoreEl.hidden = true;
      go.hidden = false;
      go.textContent = "Boshlash";
      bestEl.textContent = best ? "Eng yaxshi " + best : "Bosing — sakrash";
    }

    function start() {
      resetRun();
      state = "play";
      bubble.hidden = true;
      scoreEl.hidden = false;
      scoreEl.textContent = "0";
      go.hidden = true;
      bestEl.textContent = best ? "Eng yaxshi " + best : "Havoda yana bir marta";
      beep(420, 0.06, 0.03);
    }

    function finish() {
      state = "over";
      shake = 10;
      if (score > best) {
        best = score;
        localStorage.setItem(BEST_KEY, String(best));
      }
      bubble.hidden = false;
      bubble.textContent = score > 0 ? "Yana bir marta" : "Yana";
      scoreEl.hidden = false;
      scoreEl.textContent = String(score);
      go.hidden = false;
      go.textContent = "Yana";
      bestEl.textContent = "Eng yaxshi " + best;
      beep(140, 0.18, 0.04);
    }

    function tryJump() {
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
        puff(px + 28, py + 20, CINN);
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
          color: color,
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
          got: false,
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

    function cell(x, y, s, c, r, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x + c * s), Math.round(y + r * s), w * s, h * s);
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
        "....#......#....",
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
      var eyes = mood === "hurt"
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
          else color = pal.body;
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
        buddy(drawX, drawY, sc, INK_PAL, mood, t * 14);
        if (state === "over") {
          buddy(px + 70, GROUND - 64, 4, CINN_PAL, "idle", t * 3);
        }
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
      if (!root.isConnected) return;
      e.preventDefault();
      if (state === "play") {
        if (feetOnGround() || coyote > 0 || jumps < 2) tryJump();
        else buffer = 0.12;
      } else start();
    }

    go.addEventListener("click", function (e) {
      e.stopPropagation();
      start();
    });
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", resize);
    resize();
    showIdle();
    raf = requestAnimationFrame(frame);

    return function destroy() {
      dead = true;
      root.dataset.live = "";
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
