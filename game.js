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

  const paddle = { x: W / 2, y: 544, w: 144, h: 15, target: W / 2, wideTimer: 0 };
  const stars = Array.from({ length: 82 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    size: .5 + Math.random() * 1.5,
    phase: Math.random() * 6.28,
    speed: .25 + Math.random() * .7
  }));

  // Ambient cyber confetti is present even between impacts. Burst particles
  // remain event-driven so real collisions still feel substantially brighter.
  const ambientMotes = Array.from({ length: 48 }, (_, i) => ({
    x: 40 + Math.random() * (W - 80),
    y: TOP + 35 + Math.random() * (H - TOP - 90),
    phase: Math.random() * Math.PI * 2,
    speed: .35 + Math.random() * .85,
    radius: .8 + Math.random() * 2.1,
    color: ["#4feaff", "#ff53c1", "#ffc056", "#6affdf"][i % 4],
    kind: i % 3
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
    paddle.w = 144;
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
    const rows = phase === 1 ? 3 : phase === 2 ? 4 : 5;
    const bw = 65, bh = 27, gapX = 8, gapY = 12;
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
          color: ["#28caff", "#ff43ba", "#ffb33d", "#2ce9cb",
            "#a37aff", "#54c9ff", "#ff74bc"][r], flash: 0, row: r
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
    paddle.w = 144;
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
    ring(W / 2, H * .47, "#49dfff", 40, 1.68, 660, 10);
    ring(W / 2, H * .47, "#ff73b7", 0, 1.68, 560, 3);
    fireworks(W / 2, H * .35, "#65eaff", 135);
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
    paddle.w = 144;
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
    burst(cx, cy, brick.color, brick.hp === 0 ? 47 : 17, brick.hp === 0 ? 1.55 : .88);
    ring(cx, cy, brick.color, 3, brick.hp === 0 ? .7 : .33, brick.hp === 0 ? 102 : 46, 3.9);
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
      paddle.w = 215;
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
    if (paddle.wideTimer === 0 && paddle.w !== 144) paddle.w = 144;
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

    // A faint permanent reactor arc makes the playfield feel powered up
    // between collisions; sector-clear shockwaves are far brighter.
    ctx.save();
    ctx.lineWidth = 1;
    ctx.globalAlpha = .11 + .035 * Math.sin(clock * .8);
    ctx.strokeStyle = "#49e9ff";
    ctx.shadowColor = "#28ccff";
    ctx.shadowBlur = 13;
    ctx.beginPath();
    ctx.arc(W * .52, H * .49, 265, -.92 * Math.PI, .54 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha *= .7;
    ctx.strokeStyle = "#ff56ca";
    ctx.beginPath();
    ctx.arc(W * .52, H * .49, 250, .08 * Math.PI, 1.12 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // Slow drifting squares, sparks and diamonds; low visual density.
    ctx.save();
    for (const mote of ambientMotes) {
      const alpha = .22 + .38 * (.5 + .5 * Math.sin(clock * mote.speed * 2 + mote.phase));
      const x = mote.x + Math.sin(clock * mote.speed + mote.phase) * 5;
      const y = mote.y + Math.cos(clock * mote.speed * .7 + mote.phase) * 4;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = mote.color;
      ctx.shadowColor = mote.color;
      ctx.shadowBlur = 7;
      const rad = mote.radius;
      if (mote.kind === 0) ctx.fillRect(x, y, rad * 1.5, rad * 1.5);
      else if (mote.kind === 1) {
        ctx.beginPath();ctx.arc(x,y,rad*.75,0,Math.PI*2);ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x,y-rad*2);ctx.lineTo(x+rad,y);
        ctx.lineTo(x,y+rad*2);ctx.lineTo(x-rad,y);
        ctx.closePath();ctx.fill();
      }
    }
    ctx.restore();

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
      const special = Boolean(b.powerupType);
      const damaged = b.maxHp === 2 && b.hp === 1;
      const color = special
        ? ({ W: "#5cfcff", M: "#ff68dd", S: "#ffcb4d" })[b.powerupType]
        : b.color;
      const x = b.x, y = b.y, w = b.w, h = b.h;
      ctx.save();
      ctx.globalAlpha = appear;

      // Large, diffuse physical glow behind every tile; the old dark-grey
      // interior made the bricks look unlit in comparison with the mockup.
      ctx.shadowColor = color;
      ctx.shadowBlur = special ? 40 : 44;
      ctx.fillStyle = color;
      ctx.globalAlpha = appear * (special ? .19 : .34);
      rr(x - 1, y - 1, w + 2, h + 2, 5);
      ctx.fill();
      ctx.shadowBlur = 0;

      // True saturated neon glass fill. Only bonus tiles stay visibly hollow.
      ctx.globalAlpha = appear * (special ? .17 : damaged ? .53 : .77);
      ctx.fillStyle = color;
      rr(x, y, w, h, 5);
      ctx.fill();
      ctx.globalAlpha = appear;
      const lens = ctx.createLinearGradient(x, y, x, y + h);
      lens.addColorStop(0, "rgba(255,255,255,.55)");
      lens.addColorStop(.18, "rgba(255,255,255,.16)");
      lens.addColorStop(.50, "rgba(255,255,255,.035)");
      lens.addColorStop(1, special ? "rgba(4,8,28,.15)" : "rgba(1,4,23,.27)");
      ctx.fillStyle = lens;
      rr(x + 2, y + 2, w - 4, h - 4, 3);
      ctx.fill();

      // A bright luminous rim, a narrower hot-white rim and an upper light bar.
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 33;
      ctx.lineWidth = special ? 3.5 : 3.25;
      rr(x + 1.3, y + 1.3, w - 2.6, h - 2.6, 4);
      ctx.stroke();
      ctx.shadowBlur = 10;
      ctx.strokeStyle = special ? "rgba(241,255,255,.93)" : "rgba(255,255,255,.77)";
      ctx.lineWidth = 1.05;
      rr(x + 3.2, y + 3.2, w - 6.4, h - 6.4, 3);
      ctx.stroke();
      ctx.shadowBlur = 4;
      ctx.fillStyle = "rgba(255,255,255,.82)";
      rr(x + 8, y + 3, w - 16, 2.2, 1.1);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (special) {
        // Marked power-up tile stays recognizable in the brighter formation.
        // Dark central window and a pulsing diamond without changing drop logic.
        ctx.globalAlpha = appear * .68;
        ctx.fillStyle = "rgba(3,9,32,.60)";
        rr(x + 10, y + 7, w - 20, h - 14, 3);
        ctx.fill();
        const cx = x + w/2, cy = y + h/2;
        ctx.globalAlpha = appear * (.77 + .23*Math.sin(clock*5 + x*.018));
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 17;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7);ctx.lineTo(cx + 8,cy);
        ctx.lineTo(cx,cy + 7);ctx.lineTo(cx - 8,cy);
        ctx.closePath();ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#06152c";
        ctx.beginPath();
        ctx.moveTo(cx,cy - 3.1);ctx.lineTo(cx + 3.8,cy);
        ctx.lineTo(cx,cy + 3.1);ctx.lineTo(cx - 3.8,cy);
        ctx.closePath();ctx.fill();
      } else if (b.maxHp === 2) {
        ctx.globalAlpha = appear * .9;
        ctx.fillStyle = "rgba(255,255,255,.91)";
        ctx.fillRect(x+w/2-9, y+10, 6, 4);
        ctx.fillRect(x+w/2+3, y+10, 6, 4);
      }

      if (b.flash > 0) {
        ctx.globalAlpha = appear * Math.min(1, b.flash * 8);
        ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 26;
        ctx.fillStyle = "#ffffff";
        rr(x-2,y-2,w+4,h+4,5); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPaddle() {
    const x = paddle.x - paddle.w / 2, y = paddle.y;
    ctx.save();
    // Long cyber-glass paddle with a bright tube edge and reflected glow.
    const glass = ctx.createLinearGradient(x, y, x, y + paddle.h);
    glass.addColorStop(0, "#e1ffff");
    glass.addColorStop(.2, "#55f4ff");
    glass.addColorStop(.62, "#187dd7");
    glass.addColorStop(1, "#0b327d");
    ctx.shadowColor = "#2beeff";
    ctx.shadowBlur = 29;
    ctx.fillStyle = glass;
    rr(x, y, paddle.w, paddle.h, 8);
    ctx.fill();
    ctx.shadowBlur = 13;
    ctx.strokeStyle = "#b9ffff";
    ctx.lineWidth = 2.5;
    rr(x + 1, y + 1, paddle.w - 2, paddle.h - 2, 7);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    rr(x + 9, y + 2.8, paddle.w - 18, 2.2, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(61,223,255,.12)";
    rr(x - 10, y + 16, paddle.w + 20, 8, 3);
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
        const fraction = (i + 1) / b.trail.length;
        ctx.globalAlpha = fraction * .32;
        ctx.fillStyle = "#47deff";
        ctx.beginPath();
        ctx.arc(t.x, t.y, Math.max(.8, b.r * fraction * .95), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const glow = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, 24);
      glow.addColorStop(0, "rgba(255,255,255,.72)");
      glow.addColorStop(.28, "rgba(115,252,255,.35)");
      glow.addColorStop(1, "rgba(25,201,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();ctx.arc(b.x, b.y, 24, 0, Math.PI * 2);ctx.fill();
      ctx.fillStyle = "#edffff";
      ctx.shadowColor = "#60ecff";
      ctx.shadowBlur = 25;
      ctx.beginPath();ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.shadowBlur = 0;
      ctx.beginPath();ctx.arc(b.x - 2, b.y - 2, b.r * .52, 0, Math.PI * 2);ctx.fill();
      ctx.restore();
    }
  }

  function drawPowerups() {
    const colors = { W: "#60f4ff", M: "#ff6bd1", S: "#ffc262" };
    for (const p of powerups) {
      const color = colors[p.type];
      const pulse = .9 + .1 * Math.sin(clock * 9 + p.spin);
      ctx.save();
      ctx.translate(p.x, p.y);
      // Falling gold and aqua energy motes.
      for (let i = 0; i < 9; i++) {
        const phase = (clock * 2 + i * .71) % 2;
        const yy = 10 + phase * 23;
        const xx = Math.sin(i * 6.1 + clock * 3) * (12 + i * 2);
        ctx.globalAlpha = (1 - phase / 2) * .7;
        ctx.fillStyle = i % 3 === 0 ? "#fff8d2" : color;
        ctx.fillRect(xx, yy, i % 2 ? 2 : 3, i % 2 ? 2 : 4);
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 27;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();ctx.arc(0, 0, 19 * pulse, 0, Math.PI * 2);ctx.stroke();
      const body = ctx.createRadialGradient(-3, -6, 1, 0, 0, 17);
      body.addColorStop(0, "#364964");
      body.addColorStop(.55, "#111b38");
      body.addColorStop(1, "#08112b");
      ctx.shadowBlur = 0;
      ctx.fillStyle = body;
      ctx.beginPath();ctx.arc(0, 0, 15, 0, Math.PI * 2);ctx.fill();
      // Stylized lightning core, recalling the mockup's collectible energy orb.
      ctx.shadowColor = color;ctx.shadowBlur = 14;
      ctx.fillStyle = "#ffeba8";
      ctx.beginPath();
      ctx.moveTo(3, -13);ctx.lineTo(-7, -1);ctx.lineTo(-1, -1);
      ctx.lineTo(-4, 12);ctx.lineTo(9, -4);ctx.lineTo(3, -4);
      ctx.closePath();ctx.fill();
      ctx.shadowBlur = 0;
      // Small unobtrusive badge disambiguates W / M / S for gameplay.
      ctx.font = '900 10px "Segoe UI",sans-serif';
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.fillText(p.type, 0, 30);
      ctx.restore();
    }
  }

  function drawEffects(dt) {
    // Geometry-shard VFX with short streaks, diamonds and dots.
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(.983, dt * 60);
      p.vy = p.vy * Math.pow(.983, dt * 60) + 70 * dt;
      p.rotation += p.spin * dt;
      p.life -= dt;
      if (p.life <= 0) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation || 0);
      ctx.globalAlpha = Math.min(1, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.kind === 3 ? 11 : 8;
      const r = p.size;
      if (p.kind === 0) {
        ctx.fillRect(-r/2, -r/2, r, r); // glowing pixel shard
      } else if (p.kind === 1) {
        ctx.beginPath();
        ctx.moveTo(0,-r*1.15);ctx.lineTo(r*.85,r*.85);ctx.lineTo(-r*.85,r*.85);
        ctx.closePath();ctx.fill();
      } else if (p.kind === 2) {
        ctx.beginPath();ctx.arc(0,0,r*.48,0,Math.PI*2);ctx.fill();
      } else {
        ctx.fillRect(-r*.4,-r*2.1,r*.8,r*4.2); // long spark streak
      }
      ctx.restore();
    }
    particles = particles.filter(p=>p.life>0);

    for (const wave of shockwaves) {
      wave.life -= dt;
      if (wave.life <= 0) continue;
      const progress = 1 - wave.life / wave.maxLife;
      const eased = 1 - Math.pow(1 - progress, 2);
      const radius = wave.startRadius + (wave.endRadius - wave.startRadius) * eased;
      ctx.save();
      ctx.globalAlpha = Math.pow(1 - progress, .85) * .9;
      ctx.strokeStyle = wave.color;
      ctx.shadowColor = wave.color;
      ctx.shadowBlur = Math.min(30, wave.width * 5);
      ctx.lineWidth = Math.max(.8, wave.width * (1 - progress * .68));
      ctx.beginPath();ctx.arc(wave.x,wave.y,radius,0,Math.PI*2);ctx.stroke();
      // A second quieter ring sells the energy pulse without hiding the bricks.
      if (wave.width > 3) {
        ctx.globalAlpha *= .24;
        ctx.lineWidth = 1.2;
        ctx.beginPath();ctx.arc(wave.x,wave.y,radius+12,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    }
    shockwaves = shockwaves.filter(w=>w.life>0);

    // Minimal cyber-interface leader lines, visible only during events.
    for (const label of callouts) {
      label.life -= dt;
      if (label.life <= 0) continue;
      const opacity = Math.min(1, label.life / .2, (label.maxLife - label.life) / .14);
      const x=label.x,y=label.y;
      ctx.save();
      ctx.globalAlpha = Math.max(0,opacity);
      ctx.strokeStyle = label.color;
      ctx.fillStyle = label.color;
      ctx.shadowColor = label.color;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.5;
      ctx.beginPath();ctx.moveTo(x-25,y+21);ctx.lineTo(x-11,y+5);ctx.lineTo(x+78,y+5);ctx.stroke();
      ctx.beginPath();ctx.arc(x-25,y+21,2.7,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur = 4;
      ctx.font = '800 12px "Segoe UI",sans-serif';
      ctx.textAlign = "left";
      ctx.fillText(label.text,x,y-2);
      ctx.restore();
    }
    callouts = callouts.filter(l=>l.life>0);

    // New sector arrives as a bright horizontal scanner.
    if (stageReveal < 1.25 && state === "playing") {
      const scanY = 92 + stageReveal * 195;
      ctx.save();
      ctx.globalAlpha = Math.max(0,.35*(1-stageReveal/1.25));
      ctx.shadowColor = "#56dcff";ctx.shadowBlur = 20;
      ctx.strokeStyle = "#80eeff";ctx.lineWidth = 2;
      ctx.beginPath();ctx.moveTo(52,scanY);ctx.lineTo(W-52,scanY);ctx.stroke();
      ctx.restore();
    }

    if (worldFlash > 0) {
      worldFlash = Math.max(0, worldFlash - dt * 1.25);
      ctx.save();
      ctx.globalAlpha = worldFlash * .16;
      ctx.fillStyle = "#80ecff";
      ctx.fillRect(20,TOP,W-40,H-TOP-20);
      ctx.restore();
    }

    ctx.save();
    ctx.font = '900 15px "Segoe UI",sans-serif';
    ctx.textAlign = "center";
    for (const f of floaters) {
      f.y -= 40*dt;
      f.life -= dt;
      ctx.globalAlpha = Math.max(0,f.life/f.maxLife);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;ctx.shadowBlur = 9;
      ctx.fillText(f.text,f.x,f.y);
    }
    ctx.restore();
    floaters = floaters.filter(f=>f.life>0);
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
    if (state === "playing") stageReveal = Math.min(2, stageReveal + dt);
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
