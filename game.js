(() => {
  "use strict";

  const W = 960;
  const H = 600;
  const TOP = 42;
  const MAX_SPEED = 705;
  // Neon palette adapted from Star Swarm: hot pink, amber, mint, electric blue.
  const PALETTES = ["#ff73b7", "#f7ad50", "#43e0bf", "#49bfff", "#ab86ff", "#6bdcff", "#ff70bd"];
  const STAGES = ["INITIALIZE", "OVERDRIVE", "FINAL FREQUENCY"];
  const $ = id => document.getElementById(id);

  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d");
  const overlay = $("overlay");
  const actionButton = $("actionButton");
  const pauseButton = $("pauseButton");
  const soundButton = $("soundButton");
  const musicTrack = $("musicTrack");
  // HTML audio is used for the licensed loop; Web Audio remains for arcade SFX.
  const sfxSlider = $("sfxVolume");
  const musicSlider = $("musicVolume");
  const comboPill = $("comboPill");
  const toast = $("toast");

  let state = "menu";
  let action = null;
  let score = 0;
  let best = loadBest();
  let lives = 3;
  let level = 1;
  let bricks = [];
  let initialBricks = 0;
  let balls = [];
  let particles = [];
  let floaters = [];
  let shockwaves = [];
  let callouts = [];
  let stageReveal = 2;
  let worldFlash = 0;
  let powerups = [];
  let ballDocked = true;
  let combo = 0;
  let comboTimeout = 0;
  let slowTimer = 0;
  let interludeTimer = 0;
  let clock = 0;
  let shake = 0;
  let toastTimer = 0;
  let muted = false;
  let sfxVolume = readVolume("neon-breakout-sfx-volume", 70);
  let musicVolume = readInitialMusicVolume();
  let audio = null;
  const FRAME_MS = 1000 / 60; // Strict average rendering cap: 60 FPS on any refresh-rate display.
  let lastFrame = 0;
  let nextFrameAt = 0;
  let pointerActive = false;
  const keys = new Set();

  const paddle = { x: W / 2, y: 544, w: 118, h: 15, target: W / 2, wideTimer: 0 };
  const stars = Array.from({ length: 82 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    size: .5 + Math.random() * 1.5,
    phase: Math.random() * 6.28,
    speed: .25 + Math.random() * .7
  }));

  function loadBest() {
    try { return Number(localStorage.getItem("neon-breakout-best")) || 0; }
    catch { return 0; }
  }

  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem("neon-breakout-best", String(best)); } catch { /* storage disabled */ }
    }
  }

  function readInitialMusicVolume() {
    // One-time migration: players with older saved values (e.g. 8%) should
    // see the newly requested 3% default after the update. Future slider
    // changes are still remembered normally.
    const versionKey = "neon-breakout-music-default-3-migrated-v1";
    try {
      if (localStorage.getItem(versionKey) !== "yes") {
        localStorage.setItem("neon-breakout-music-volume", "3");
        localStorage.setItem(versionKey, "yes");
        return 3;
      }
    } catch {
      // Storage may be disabled; still show the intended initial volume.
      return 3;
    }
    return readVolume("neon-breakout-music-volume", 3);
  }

  function readVolume(key, fallback) {
    try {
      const saved = localStorage.getItem(key);
      if (saved === null) return fallback;
      const value = Number(saved);
      return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
    } catch { return fallback; }
  }

  function updateVolumes() {
    musicTrack.volume = muted ? 0 : musicVolume / 100;
    sfxSlider.value = String(sfxVolume);
    musicSlider.value = String(musicVolume);
    $("sfxPercent").textContent = sfxVolume + "%";
    $("musicPercent").textContent = musicVolume + "%";
    sfxSlider.style.setProperty("--fill", sfxVolume + "%");
    musicSlider.style.setProperty("--fill", musicVolume + "%");
    document.querySelector(".audio-toolbar")?.classList.toggle("master-muted", muted);
  }

  function setVolume(which, value) {
    const level = Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
    if (which === "sfx") sfxVolume = level;
    else musicVolume = level;
    try { localStorage.setItem("neon-breakout-" + which + "-volume", String(level)); } catch {}
    updateVolumes();
    if (which === "music" && level > 0 && !muted && state === "playing") playMusic();
  }

  function num(n) { return String(n).padStart(6, "0"); }

  function hud() {
    $("scoreValue").textContent = num(score);
    $("bestValue").textContent = num(Math.max(best, score));
    $("levelValue").textContent = String(level).padStart(2, "0");
    $("livesValue").innerHTML = Array.from({ length: 3 }, (_, i) =>
      i < lives ? "<span>♥</span>" : '<span class="lost">♥</span>').join("");
    $("livesValue").setAttribute("aria-label", lives + " lives remaining");
    $("stageTag").textContent = "SECTOR " + String(level).padStart(2, "0") + " · " + STAGES[(level - 1) % STAGES.length];
    const remaining = bricks.filter(b => b.hp > 0).length;
    const percent = initialBricks ? Math.round(100 * (initialBricks - remaining) / initialBricks) : 0;
    $("progressBar").style.width = percent + "%";
    $("progressText").textContent = percent + "%";
    comboPill.textContent = combo > 1 ? "✦ " + combo + "× COMBO" : "";
    comboPill.classList.toggle("active", combo > 1 && state === "playing");
    pauseButton.setAttribute("aria-label", state === "paused" ? "Resume game" : "Pause game");
    pauseButton.title = state === "paused" ? "Resume (P / Esc)" : "Pause (P / Esc)";
    pauseButton.innerHTML = state === "paused"
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 12 7-12 7z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  }

  function setOverlay(kicker, title, description, button, handler, stats) {
    $("overlayKicker").textContent = kicker;
    $("overlayTitle").innerHTML = title;
    $("overlayDescription").innerHTML = description;
    $("actionText").textContent = button;
    $("overlayStats").hidden = !stats;
    $("overlayStats").innerHTML = stats || "";
    action = handler;
    overlay.classList.toggle("minimal-start", handler === start);
    overlay.hidden = false;
  }

  function hideOverlay() { overlay.hidden = true; action = null; }

  function say(message, seconds = 1.5) {
    toast.textContent = message;
    toast.classList.add("visible");
    toastTimer = seconds;
  }

  function sound(frequency, duration = .07, type = "sine", volume = .04, endFrequency) {
    if (muted || sfxVolume <= 0) return;
    try {
      if (!audio) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        audio = new Audio();
      }
      if (audio.state === "suspended") audio.resume().catch(() => {});
      const time = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, time);
      if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), time + duration);
      gain.gain.setValueAtTime(Math.max(.0001, volume * sfxVolume / 100), time);
      gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(time);
      osc.stop(time + duration + .01);
    } catch { /* audio is optional */ }
  }

  function playMusic() {
    if (muted || musicVolume <= 0 || !["playing", "interlude"].includes(state)) return;
    const playing = musicTrack.play();
    if (playing && typeof playing.catch === "function") {
      // Playback can fail offline or when the browser hasn't granted audio.
      playing.catch(() => {});
    }
  }

  function pauseMusic() { musicTrack.pause(); }

  function start() {
    score = 0;
    lives = 3;
    level = 1;
    combo = 0;
    slowTimer = 0;
    paddle.w = 118;
    paddle.wideTimer = 0;
    paddle.target = W / 2;
    paddle.x = W / 2;
    particles = [];
    floaters = [];
    shockwaves = [];
    callouts = [];
    worldFlash = 0;
    powerups = [];
    createLevel();
    state = "playing";
    hideOverlay();
    musicTrack.currentTime = 0;
    playMusic();
    say("SPACE OR TAP TO LAUNCH", 2.3);
    sound(440, .12, "triangle", .055, 660);
    hud();
  }

  function createLevel() {
    bricks = [];
    const cols = 12;
    const phase = ((level - 1) % 3) + 1;
    const rows = phase === 1 ? 5 : phase === 2 ? 6 : 7;
    const bw = 61, bh = 24, gapX = 9, gapY = 12;
    const ox = (W - cols * bw - (cols - 1) * gapX) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (phase === 2 && (r === 2 || r === 3) && (c === 0 || c === 11)) continue;
        if (phase === 3 && ((r === 1 && (c === 0 || c === 11)) ||
          (r === 3 && (c === 0 || c === 1 || c === 10 || c === 11)))) continue;
        const armorFrequency = Math.max(4, phase === 3 ? 6 - Math.floor(level / 6) : 9 - Math.floor(level / 4));
        const heavy = level > 1 && (r + 2 * c + level) % armorFrequency === 0;
        bricks.push({
          x: ox + c * (bw + gapX), y: 105 + r * (bh + gapY),
          w: bw, h: bh, hp: heavy ? 2 : 1, maxHp: heavy ? 2 : 1,
          color: [PALETTES[3], PALETTES[0], PALETTES[1], PALETTES[2],
            PALETTES[4], PALETTES[5], PALETTES[6]][r], flash: 0, row: r
        });
      }
    }
    // Mark 1–2 non-armoured bricks per row. Each outlined brick contains a real,
    // preassigned power-up; ordinary bricks never drop hidden random items.
    const powerTypes = ["W", "M", "S"];
    let powerIndex = 0;
    for (let r = 0; r < rows; r++) {
      const candidates = bricks.filter(b => b.row === r && b.maxHp === 1);
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      const picks = r % 2 === 0 ? 2 : 1;
      for (const brick of candidates.slice(0, picks)) {
        brick.powerupType = powerTypes[(powerIndex + level - 1) % powerTypes.length];
        powerIndex++;
      }
    }
    initialBricks = bricks.length;
    balls = [];
    ballDocked = true;
    powerups = [];
    combo = 0;
    comboTimeout = 0;
    slowTimer = 0;
    paddle.wideTimer = 0;
    paddle.w = 118;
    spawnBall();
    stageReveal = level === 1 ? 2 : 0;
    hud();
  }

  function spawnBall() {
    balls = [{ x: paddle.x, y: paddle.y - 17, vx: 0, vy: 0, r: 8, trail: [] }];
    ballDocked = true;
  }

  function launch() {
    if (state !== "playing" || !ballDocked) return;
    ballDocked = false;
    const ball = balls[0];
    ball.vx = 200 + (Math.random() * 50 - 25);
    ball.vy = -395;
    sound(680, .13, "triangle", .05, 1080);
    say("GOOD LUCK, PLAYER", 1.1);
  }

  function pause() {
    if (state === "playing") {
      state = "paused";
      pauseMusic();
      setOverlay("GAME ON HOLD", 'TAKE A <span>BREATH.</span>',
        "The bricks will be right here when you return.", "RESUME GAME", resume);
      hud();
    } else if (state === "paused") resume();
  }

  function resume() {
    state = "playing";
    hideOverlay();
    playMusic();
    hud();
  }

  function nextLevel() {
    if (state !== "interlude") return;
    level++;
    createLevel();
    state = "playing";
    hideOverlay();
    say("SECTOR " + String(level).padStart(2, "0") + " · READY · LAUNCH!", 2);
    worldFlash = .24;
    ring(W / 2, 184, "#65eeff", 95, .55, 700, 5);
    callout(W / 2 + 155, 88, "NEW WAVE", "#67f1ff", 1.45);
    hud();
  }

  function finish() {
    pauseMusic();
    saveBest();
    state = "lost";
    ballDocked = true;
    combo = 0;
    sound(230, .38, "sawtooth", .03, 90);
    setOverlay("SIGNAL LOST", 'GAME <span>OVER</span>',
      "Your run is over. Beat that high score next time!",
      "TRY AGAIN", start,
      '<span>YOUR SCORE<strong>' + num(score) + '</strong></span><span>PERSONAL BEST<strong>' + num(best) + '</strong></span>');
    hud();
  }

  function clearLevel() {
    if (state !== "playing") return;
    const bonus = 500 + Math.min(level - 1, 50) * 100;
    score += bonus;
    saveBest();
    sound(620, .24, "triangle", .05, 970);
    state = "interlude";
    interludeTimer = 1.75;
    worldFlash = .7;
    ring(W / 2, H * .47, "#49dfff", 40, 1.55, 660, 7);
    ring(W / 2, H * .47, "#ff73b7", 0, 1.45, 560, 2);
    fireworks(W / 2, H * .35, "#65eaff", 95);
    callout(744, 102, "STAGE CLEAR", "#6df8ff", 1.7);
    say("SECTOR " + String(level).padStart(2, "0") + " CLEARED · +" + bonus, 1.1);
    hud();
  }

  function loseLife() {
    lives--;
    combo = 0;
    if (lives <= 0) {
      finish();
      return;
    }
    paddle.w = 118;
    paddle.wideTimer = 0;
    slowTimer = 0;
    powerups = [];
    spawnBall();
    sound(280, .25, "triangle", .055, 130);
    say("LIFE LOST · " + lives + " REMAINING", 1.8);
    hud();
  }

  function rr(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function circleRect(ball, rect) {
    const x = Math.max(rect.x, Math.min(ball.x, rect.x + rect.w));
    const y = Math.max(rect.y, Math.min(ball.y, rect.y + rect.h));
    const dx = ball.x - x, dy = ball.y - y;
    return dx * dx + dy * dy <= ball.r * ball.r;
  }

  // Tiny squares, shards, sparks and luminous streaks: procedural 2D neon VFX.
  function burst(x, y, color, amount = 10, force = 1) {
    for (let i = 0; i < amount && particles.length < 480; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (50 + Math.random() * 280) * force;
      const life = .3 + Math.random() * .52;
      particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life, maxLife: life, size: 1.6 + Math.random() * 4.2,
        kind: Math.floor(Math.random() * 4), rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - .5) * 9, color
      });
    }
  }

  function ring(x, y, color, startRadius = 5, lifetime = .5, endRadius = 90, width = 2.5) {
    shockwaves.push({ x, y, color, radius: startRadius, startRadius,
      endRadius, life: lifetime, maxLife: lifetime, width });
    if (shockwaves.length > 20) shockwaves.shift();
  }

  function callout(x, y, text, color = "#66edff", lifetime = .95) {
    // Callouts cannot block the ball or the player's view for long.
    callouts.push({ x: Math.max(65, Math.min(W - 170, x)), y: Math.max(84, Math.min(H - 125, y)),
      text, color, life: lifetime, maxLife: lifetime });
    if (callouts.length > 5) callouts.shift();
  }

  function fireworks(x, y, color, amount) {
    burst(x, y, color, amount, 1.7);
    burst(x, y, "#f875c7", Math.floor(amount / 2), 1.5);
  }

  function floating(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 1, maxLife: 1 });
    if (floaters.length > 28) floaters.shift();
  }

  function hitBrick(brick, ball) {
    brick.hp--;
    brick.flash = .16;
    shake = Math.max(shake, brick.hp === 0 ? 3.3 : 1.9);
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    burst(cx, cy, brick.color, brick.hp === 0 ? 25 : 9, brick.hp === 0 ? 1.25 : .62);
    ring(cx, cy, brick.color, 3, brick.hp === 0 ? .52 : .26, brick.hp === 0 ? 60 : 32, 2.3);
    if (brick.hp > 0) callout(cx, cy - 20, "BRICK HIT", brick.color, .55);
    sound(brick.hp === 0 ? 430 + brick.row * 60 : 230, .06, "triangle", .035, 730);
    if (brick.hp === 0) {
      if (comboTimeout > 0) combo = Math.min(combo + 1, 5);
      else combo = 1;
      comboTimeout = 2.4;
      const gained = 100 * combo;
      score += gained;
      if (score > best) saveBest();
      floating(brick.x + brick.w / 2, brick.y + 8, "+" + gained, brick.color);
      if (combo === 1 || combo % 4 === 0 || brick.powerupType) {
        callout(cx, cy - 21, "BRICK DESTROYED", brick.color, .9);
      }
      if (brick.powerupType) dropPowerup(brick);
    } else {
      score += 25;
      floating(brick.x + brick.w / 2, brick.y + 8, "+25", "#d4e6ff");
    }
    hud();
  }

  function dropPowerup(brick) {
    const type = brick.powerupType;
    if (!type) return;
    powerups.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2,
      type, vy: 128, spin: Math.random() * 6 });
    ring(brick.x + brick.w / 2, brick.y + brick.h / 2,
      type === "W" ? "#67f8ff" : type === "M" ? "#ff73b7" : "#ffca6a", 8, .53, 66, 2);
    callout(brick.x + brick.w / 2, brick.y - 26, "POWER-UP", "#ffc96b", 1);
  }

  function takePowerup(type) {
    if (type === "W") {
      paddle.wideTimer = 12;
      paddle.w = 190;
      say("WIDE PADDLE · 12 SECONDS");
    } else if (type === "M") {
      const existing = balls.filter(b => b.vx || b.vy);
      const source = existing[0];
      if (source && balls.length < 5) {
        for (const delta of [-.55, .55]) {
          if (balls.length >= 5) break;
          const angle = Math.atan2(source.vx, -source.vy) + delta;
          const speed = Math.hypot(source.vx, source.vy);
          balls.push({ x: source.x, y: source.y, r: 8,
            vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed, trail: [] });
        }
        say("MULTIBALL ACTIVATED");
      } else { score += 200; say("BONUS +200"); }
    } else {
      slowTimer = 9;
      say("SLOW-MO · 9 SECONDS");
    }
    sound(780, .2, "sine", .065, 1220);
    const pickupColor = type === "W" ? "#7cf5ff" : type === "M" ? "#ff73b7" : "#f7ad50";
    burst(paddle.x, paddle.y - 10, pickupColor, 36, 1.25);
    ring(paddle.x, paddle.y - 10, pickupColor, 7, .9, 145, 4);
    callout(paddle.x, paddle.y - 95, "POWER-UP", pickupColor, 1.25);
    worldFlash = Math.max(worldFlash, .12);
    hud();
  }

  function reflectBrick(ball, brick, previousX, previousY) {
    if (previousX + ball.r <= brick.x) {
      ball.x = brick.x - ball.r - .5;
      ball.vx = -Math.abs(ball.vx);
    } else if (previousX - ball.r >= brick.x + brick.w) {
      ball.x = brick.x + brick.w + ball.r + .5;
      ball.vx = Math.abs(ball.vx);
    } else if (previousY + ball.r <= brick.y) {
      ball.y = brick.y - ball.r - .5;
      ball.vy = -Math.abs(ball.vy);
    } else if (previousY - ball.r >= brick.y + brick.h) {
      ball.y = brick.y + brick.h + ball.r + .5;
      ball.vy = Math.abs(ball.vy);
    } else {
      const left = Math.abs(ball.x + ball.r - brick.x);
      const right = Math.abs(brick.x + brick.w - (ball.x - ball.r));
      const top = Math.abs(ball.y + ball.r - brick.y);
      const bottom = Math.abs(brick.y + brick.h - (ball.y - ball.r));
      const minimum = Math.min(left, right, top, bottom);
      if (minimum === left) { ball.x = brick.x - ball.r - .5; ball.vx = -Math.abs(ball.vx); }
      else if (minimum === right) { ball.x = brick.x + brick.w + ball.r + .5; ball.vx = Math.abs(ball.vx); }
      else if (minimum === top) { ball.y = brick.y - ball.r - .5; ball.vy = -Math.abs(ball.vy); }
      else { ball.y = brick.y + brick.h + ball.r + .5; ball.vy = Math.abs(ball.vy); }
    }
  }

  function moveBall(ball, step) {
    const lastX = ball.x, lastY = ball.y;
    const slow = slowTimer > 0 ? .68 : 1;
    ball.x += ball.vx * step * slow;
    ball.y += ball.vy * step * slow;
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 19) ball.trail.shift();

    if (ball.x < 20 + ball.r) {
      ball.x = 20 + ball.r;
      ball.vx = Math.abs(ball.vx);
      sound(270, .035, "sine", .015);
    }
    if (ball.x > W - 20 - ball.r) {
      ball.x = W - 20 - ball.r;
      ball.vx = -Math.abs(ball.vx);
      sound(270, .035, "sine", .015);
    }
    if (ball.y < TOP + ball.r) {
      ball.y = TOP + ball.r;
      ball.vy = Math.abs(ball.vy);
      sound(290, .04, "sine", .018);
    }

    const rect = { x: paddle.x - paddle.w / 2, y: paddle.y, w: paddle.w, h: paddle.h };
    if (ball.vy > 0 && lastY + ball.r <= paddle.y + 8 && circleRect(ball, rect)) {
      ball.y = paddle.y - ball.r - 1;
      const offset = Math.max(-1, Math.min(1, (ball.x - paddle.x) / (paddle.w / 2)));
      const angle = offset * 1.12;
      const speed = Math.min(MAX_SPEED, Math.max(420, Math.hypot(ball.vx, ball.vy) * 1.018));
      ball.vx = Math.sin(angle) * speed + (Math.abs(offset) < .07 ? Math.sign(ball.vx || 1) * 28 : 0);
      ball.vy = -Math.cos(angle) * speed;
      shake = Math.max(shake, 1.25);
      burst(ball.x, paddle.y, "#70f4ff", 7, .65);
      sound(210 + Math.abs(offset) * 150, .07, "triangle", .045, 310);
    }

    for (const brick of bricks) {
      if (brick.hp <= 0 || !circleRect(ball, brick)) continue;
      reflectBrick(ball, brick, lastX, lastY);
      hitBrick(brick, ball);
      break;
    }
  }

  function update(dt) {
    comboTimeout = Math.max(0, comboTimeout - dt);
    if (comboTimeout === 0 && combo > 0) { combo = 0; hud(); }

    paddle.wideTimer = Math.max(0, paddle.wideTimer - dt);
    if (paddle.wideTimer === 0 && paddle.w !== 118) paddle.w = 118;
    slowTimer = Math.max(0, slowTimer - dt);

    if (!pointerActive) {
      let movement = 0;
      if (keys.has("ArrowLeft") || keys.has("a")) movement--;
      if (keys.has("ArrowRight") || keys.has("d")) movement++;
      if (movement) paddle.target += movement * 800 * dt;
    }
    paddle.target = Math.max(28 + paddle.w / 2, Math.min(W - 28 - paddle.w / 2, paddle.target));
    const follow = Math.min(1, dt * 23);
    paddle.x += (paddle.target - paddle.x) * follow;
    paddle.x = Math.max(28 + paddle.w / 2, Math.min(W - 28 - paddle.w / 2, paddle.x));

    if (ballDocked) {
      for (const ball of balls) {
        ball.x = paddle.x;
        ball.y = paddle.y - ball.r - 2;
        ball.trail.length = 0;
      }
    } else {
      const steps = Math.max(1, Math.ceil(dt / .008));
      for (let i = 0; i < steps; i++) {
        for (const ball of balls) moveBall(ball, dt / steps);
      }
      balls = balls.filter(b => b.y - b.r < H + 12);
      if (bricks.every(b => b.hp <= 0)) {
        clearLevel();
        return;
      }
      if (!balls.length) {
        loseLife();
        return;
      }
    }

    for (const p of powerups) {
      p.y += p.vy * dt;
      p.spin += dt * 3.4;
      if (p.y > paddle.y - 8 && p.y < paddle.y + paddle.h + 8 &&
          Math.abs(p.x - paddle.x) < paddle.w / 2 + 13) {
        p.collected = true;
        takePowerup(p.type);
      }
    }
    powerups = powerups.filter(p => !p.collected && p.y < H + 25);
  }

  function drawBackground() {
    ctx.fillStyle = "#060d20";
    ctx.fillRect(0, 0, W, H);
    const space = ctx.createRadialGradient(W * .53, H * .42, 10, W * .5, H * .44, 660);
    space.addColorStop(0, "#14254b");
    space.addColorStop(.5, "#0a1530");
    space.addColorStop(1, "#050b1d");
    ctx.fillStyle = space;
    ctx.fillRect(0, 0, W, H);

    // Technological grid — clearly visible but darker than the game objects.
    ctx.strokeStyle = "rgba(61, 135, 236, .15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 20; x <= W; x += 46) {
      ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H);
    }
    for (let y = 40; y <= H; y += 46) {
      ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5);
    }
    ctx.stroke();

    // Subtle perspective lines ground the paddle in the cyber grid.
    ctx.strokeStyle = "rgba(38, 116, 215, .13)";
    ctx.beginPath();
    for (let x = 50; x < W; x += 120) {
      ctx.moveTo(W / 2 + (x - W / 2) * .25, H * .61);
      ctx.lineTo(x, H);
    }
    ctx.stroke();

    for (const star of stars) {
      const alpha = .19 + .35 * (.5 + .5 * Math.sin(clock * star.speed * 2 + star.phase));
      ctx.fillStyle = "rgba(116, 220, 255," + alpha + ")";
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }

    // Arc reactor glow behind the playfield, matching the concept artwork.
    const center = ctx.createRadialGradient(W * .52, H * .46, 100, W * .52, H * .46, 420);
    center.addColorStop(0, "rgba(0,185,245,.026)");
    center.addColorStop(.7, "rgba(19,97,229,.06)");
    center.addColorStop(1, "rgba(18,40,91,0)");
    ctx.fillStyle = center;
    ctx.fillRect(0, 0, W, H);

    // Two electric-blue rails frame the play area.
    ctx.save();
    ctx.strokeStyle = "#41cfff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#22ccff";
    ctx.shadowBlur = 21;
    ctx.beginPath();
    ctx.moveTo(19, TOP); ctx.lineTo(19, H - 21);
    ctx.moveTo(W - 19, TOP); ctx.lineTo(W - 19, H - 21);
    ctx.moveTo(19, H - 21); ctx.lineTo(W - 19, H - 21);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(15,175,249,.07)";
    ctx.fillRect(20, H - 34, W - 40, 14);
    ctx.strokeStyle = "rgba(60,190,255,.14)";
    ctx.beginPath(); ctx.moveTo(20, TOP);ctx.lineTo(W - 20, TOP);ctx.stroke();
  }

  function drawBricks() {
    for (const b of bricks) {
      if (b.hp <= 0) continue;
      const appear = Math.max(0, Math.min(1, (stageReveal - b.row * .11) / .28));
      if (appear <= 0) continue;
      const damaged = b.maxHp === 2 && b.hp === 1;
      const color = b.powerupType
        ? ({ W: "#67f6ff", M: "#ff77d2", S: "#ffc96b" })[b.powerupType]
        : b.color;
      ctx.save();
      ctx.globalAlpha = appear * (damaged ? .76 : 1);
      // Saturated dark glass center rather than a flat solid rectangle.
      ctx.fillStyle = "#0c1a35";
      rr(b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      const glass = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      glass.addColorStop(0, color);
      glass.addColorStop(.18, "rgba(42,95,148,.58)");
      glass.addColorStop(.5, "rgba(15,31,69,.84)");
      glass.addColorStop(1, "rgba(5,15,40,.95)");
      ctx.fillStyle = glass;
      ctx.globalAlpha = appear * (b.powerupType ? .24 : .67);
      rr(b.x + 1, b.y + 1, b.w - 2, b.h - 2, 3);
      ctx.fill();

      // Hot neon tube outline with layered glow and white lens highlight.
      ctx.globalAlpha = appear;
      ctx.strokeStyle = color;
      ctx.lineWidth = b.powerupType ? 2.6 : 2.35;
      ctx.shadowColor = color;
      ctx.shadowBlur = b.powerupType ? 32 : 23;
      rr(b.x + 1.2, b.y + 1.2, b.w - 2.4, b.h - 2.4, 4);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(220,250,255,.62)";
      ctx.lineWidth = .85;
      rr(b.x + 3.3, b.y + 3.3, b.w - 6.6, b.h - 6.6, 2.6);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,.50)";
      rr(b.x + 8, b.y + 3.5, b.w - 16, 1.6, 1);
      ctx.fill();

      if (b.powerupType) {
        // Outline-only reward brick; keep the center dark and add a power diamond.
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const pulse = .86 + .14 * Math.sin(clock * 5 + b.x / 40);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.globalAlpha = appear * pulse;
        ctx.beginPath();
        ctx.moveTo(cx,cy-6);ctx.lineTo(cx+7,cy);
        ctx.lineTo(cx,cy+6);ctx.lineTo(cx-7,cy);ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#09132b";
        ctx.beginPath();
        ctx.moveTo(cx,cy-3);ctx.lineTo(cx+3.7,cy);
        ctx.lineTo(cx,cy+3);ctx.lineTo(cx-3.7,cy);ctx.closePath();
        ctx.fill();
      } else if (b.maxHp === 2) {
        // Reinforced bricks use a restrained internal armor glyph.
        ctx.fillStyle = "rgba(240,254,255,.8)";
        ctx.fillRect(b.x + b.w / 2 - 9, b.y + 9, 6, 4);
        ctx.fillRect(b.x + b.w / 2 + 3, b.y + 9, 6, 4);
      }

      if (b.flash > 0) {
        ctx.globalAlpha = appear * Math.min(1, b.flash * 6);
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 22;
        rr(b.x - 1, b.y - 1, b.w + 2, b.h + 2, 4);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPaddle() {
    const x = paddle.x - paddle.w / 2, y = paddle.y;
    ctx.save();
    const g = ctx.createLinearGradient(x, 0, x + paddle.w, 0);
    g.addColorStop(0, "#3c84ff");
    g.addColorStop(.24, "#65ecff");
    g.addColorStop(.54, "#e1ffff");
    g.addColorStop(.78, "#65ecff");
    g.addColorStop(1, "#4f90ff");
    ctx.shadowColor = "#45e7ff";
    ctx.shadowBlur = 24;
    ctx.fillStyle = g;
    rr(x, y, paddle.w, paddle.h, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, .7)";
    rr(x + 13, y + 2, paddle.w - 26, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = "#b9faff";
    rr(x + paddle.w / 2 - 12, y + 5, 24, 5, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(53, 223, 255, .1)";
    rr(x - 13, y + 17, paddle.w + 26, 5, 2);
    ctx.fill();
    ctx.restore();

    if (paddle.wideTimer > 0 || slowTimer > 0) {
      ctx.save();
      ctx.textAlign = "right";
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.fillStyle = "#8eeafa";
      const label = (paddle.wideTimer > 0 ? "WIDE " + Math.ceil(paddle.wideTimer) + "s  " : "") +
        (slowTimer > 0 ? "SLOW " + Math.ceil(slowTimer) + "s" : "");
      ctx.fillText(label, W - 33, H - 49);
      ctx.restore();
    }
  }

  function drawBalls() {
    for (const b of balls) {
      ctx.save();
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        const alpha = (i / b.trail.length) * .28;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#5ceaff";
        ctx.beginPath();
        ctx.arc(t.x, t.y, b.r * (.3 + .65 * i / b.trail.length), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = "#81f2ff";
      ctx.shadowBlur = 29;
      ctx.fillStyle = "#9cf5ff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(b.x - 1.7, b.y - 2, b.r * .46, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPowerups() {
    const colors = { W: "#7cf5ff", M: "#ff73b7", S: "#f7ad50" };
    for (const p of powerups) {
      const color = colors[p.type];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(p.spin) * .14);
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#0e1930";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      rr(-16, -15, 32, 30, 7);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.font = 'bold 17px "Segoe UI", sans-serif';
      ctx.fillText(p.type, 0, 6);
      ctx.restore();
    }
  }

  function drawEffects(dt) {
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(.984, dt * 60);
      p.vy = p.vy * Math.pow(.984, dt * 60) + 65 * dt;
      p.life -= dt;
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 7;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    particles = particles.filter(p => p.life > 0);

    ctx.font = '900 16px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    for (const f of floaters) {
      f.y -= 36 * dt;
      f.life -= dt;
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    floaters = floaters.filter(f => f.life > 0);
  }

  function render(dt) {
    ctx.save();
    if (shake > .1 && state === "playing") {
      ctx.translate((Math.random() - .5) * shake * 2, (Math.random() - .5) * shake * 2);
    }
    drawBackground();
    drawBricks();
    drawPowerups();
    drawPaddle();
    drawBalls();
    drawEffects(dt);
    ctx.restore();
  }

  function frame(timestamp) {
    // RequestAnimationFrame follows the monitor (up to 240 Hz or more).
    // Only update and draw when the next 60 Hz slot is due.
    requestAnimationFrame(frame);
    if (!nextFrameAt) nextFrameAt = timestamp;
    if (timestamp < nextFrameAt) return;

    const dt = lastFrame ? Math.min(.035, Math.max(0, (timestamp - lastFrame) / 1000)) : 1 / 60;
    lastFrame = timestamp;
    nextFrameAt += FRAME_MS;
    // Don't run catch-up bursts after an inactive tab or a long stall.
    if (timestamp - nextFrameAt > FRAME_MS * 2) nextFrameAt = timestamp + FRAME_MS;

    clock += dt;
    shake *= Math.pow(.76, dt * 60);
    for (const brick of bricks) brick.flash = Math.max(0, brick.flash - dt);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.classList.remove("visible");
    }
    if (state === "playing") update(dt);
    else if (state === "interlude") {
      interludeTimer -= dt;
      if (interludeTimer <= 0) nextLevel();
    }
    render(dt);
  }

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * pixelRatio);
    canvas.height = Math.round(H * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function pointerToGame(e) {
    const bounds = canvas.getBoundingClientRect();
    return (e.clientX - bounds.left) * W / bounds.width;
  }

  canvas.addEventListener("pointermove", e => {
    if (state !== "playing") return;
    paddle.target = pointerToGame(e);
    pointerActive = true;
  });
  canvas.addEventListener("pointerdown", e => {
    if (state !== "playing") return;
    paddle.target = pointerToGame(e);
    pointerActive = true;
    if (e.pointerType === "touch" && canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    launch();
  });
  canvas.addEventListener("pointerup", e => {
    if (e.pointerType === "touch") pointerActive = false;
  });
  canvas.addEventListener("pointercancel", () => { pointerActive = false; });
  canvas.addEventListener("pointerleave", e => {
    if (e.pointerType !== "touch") pointerActive = false;
  });

  window.addEventListener("keydown", e => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["ArrowLeft", "ArrowRight", " ", "Spacebar"].includes(e.key)) e.preventDefault();
    if (key === "m" && !e.repeat) toggleSound();
    if ((key === "p" || key === "Escape") && !e.repeat) pause();
    if (["ArrowLeft", "ArrowRight", "a", "d"].includes(key)) pointerActive = false;
    keys.add(key);
    if ((key === " " || key === "Enter") && !e.repeat) {
      if (state === "playing") launch();
      else if (state === "menu" || state === "paused" || state === "lost" || state === "won" || state === "interlude") {
        if (action) action();
      }
    }
  });
  window.addEventListener("keyup", e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  window.addEventListener("blur", () => {
    keys.clear();
    pointerActive = false;
    if (state === "playing") pause();
  });

  function toggleSound() {
    muted = !muted;
    musicTrack.muted = muted;
    updateVolumes();
    if (muted) pauseMusic();
    else playMusic();
    soundButton.classList.toggle("muted", muted);
    soundButton.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    soundButton.title = muted ? "Unmute sound (M)" : "Mute sound (M)";
    $("soundIcon").innerHTML = muted
      ? '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>'
      : '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>';
    if (!muted) sound(770, .09, "sine", .045);
  }

  sfxSlider.addEventListener("input", () => setVolume("sfx", sfxSlider.value));
  musicSlider.addEventListener("input", () => setVolume("music", musicSlider.value));
  updateVolumes();

  actionButton.addEventListener("click", () => { if (action) action(); });
  pauseButton.addEventListener("click", pause);
  soundButton.addEventListener("click", toggleSound);
  window.addEventListener("resize", resize);

  resize();
  createLevel();
  setOverlay("", 'LIGHT IT <span>UP</span>', "", "START GAME", start);
  hud();
  requestAnimationFrame(frame);
})();
