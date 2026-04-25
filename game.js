(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const leftButton = document.getElementById("leftButton");
  const rightButton = document.getElementById("rightButton");
  const pauseButton = document.getElementById("pauseButton");
  const restartButton = document.getElementById("restartButton");

  const W = 900;
  const H = 760;
  const GRAVITY = 760;
  const MAX_UPWARD_SPEED = 90;
  const colors = [
    { base: "#f65368", light: "#ffb8c1", dark: "#bc2440" },
    { base: "#ff9a3d", light: "#ffd09a", dark: "#c55f15" },
    { base: "#ffd447", light: "#fff1a7", dark: "#c79507" },
    { base: "#67c95f", light: "#c1edac", dark: "#2c8b3a" },
    { base: "#2fc8bd", light: "#9ff0ea", dark: "#118178" },
    { base: "#4d9dff", light: "#bedcff", dark: "#2266bc" },
    { base: "#af79ff", light: "#dbc8ff", dark: "#7045c2" },
    { base: "#ff79bd", light: "#ffc2df", dark: "#c53b83" }
  ];

  const cup = {
    topWidth: 270,
    bottomWidth: 214,
    height: 356,
    x: 0,
    y: 300,
    minX: 0,
    maxX: 0,
    minVisible: 40,
    speed: 650,
    vx: 0,
    accel: 0,
    tilt: 0,
    angle: 0,
    shake: 0
  };
  cup.minX = -cup.topWidth + cup.minVisible;
  cup.maxX = W - cup.minVisible;

  const keys = { left: false, right: false };
  const gummies = [];
  const particles = [];
  const scoreBursts = [];

  let falling;
  let nextColor = 0;
  let score = 0;
  let chainText = "";
  let level = 1;
  let elapsed = 0;
  let state = "playing";
  let lastTime = 0;
  let highScore = Number(localStorage.getItem("gummyCupHighScore") || 0);
  let nextId = 1;
  let matchClock = 0;

  function initCanvas() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function randomColor() {
    return Math.floor(Math.random() * colors.length);
  }

  function resetGame() {
    gummies.length = 0;
    particles.length = 0;
    scoreBursts.length = 0;
    cup.x = (W - cup.topWidth) / 2;
    cup.vx = 0;
    cup.accel = 0;
    cup.tilt = 0;
    cup.angle = 0;
    cup.shake = 0;
    score = 0;
    level = 1;
    elapsed = 0;
    chainText = "";
    matchClock = 0;
    state = "playing";
    pauseButton.textContent = "⏸";
    pauseButton.setAttribute("aria-label", "一時停止");
    nextColor = randomColor();
    spawnGummy();
    canvas.focus({ preventScroll: true });
  }

  function spawnGummy() {
    const margin = 58;
    falling = {
      color: nextColor,
      seed: Math.random() * 1000,
      x: margin + Math.random() * (W - margin * 2),
      y: -36,
      vx: -18 + Math.random() * 36,
      vy: 0,
      r: 18 + Math.random() * 2.4,
      spin: -0.25 + Math.random() * 0.5,
      rotation: -0.2 + Math.random() * 0.4
    };
    nextColor = randomColor();
  }

  function endGame(reason) {
    if (state === "over") return;
    state = "over";
    chainText = reason;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("gummyCupHighScore", String(highScore));
    }
  }

  function update(dt, now) {
    if (state === "paused") {
      return;
    }

    updateParticles(dt);

    if (state !== "playing") {
      return;
    }

    elapsed += dt;
    level = Math.min(12, 1 + Math.floor(score / 1800) + Math.floor(elapsed / 50));
    updateCup(dt, now / 1000);
    updateFalling(dt, now);
    simulateGummies(dt, now);

    matchClock -= dt;
    if (matchClock <= 0) {
      matchClock = 0.14;
      resolveMatches(now);
    }

    checkOverflow(now);
  }

  function updateCup(dt, t) {
    const oldVx = cup.vx;
    const oldX = cup.x;
    const direction = Number(keys.right) - Number(keys.left);

    cup.x += direction * cup.speed * dt;
    cup.x = clamp(cup.x, cup.minX, cup.maxX);
    cup.vx = dt > 0 ? (cup.x - oldX) / dt : 0;
    cup.accel = dt > 0 ? (cup.vx - oldVx) / dt : 0;

    const targetTilt = clamp(cup.vx / cup.speed, -1, 1) * 0.12;
    cup.tilt += (targetTilt - cup.tilt) * Math.min(1, dt * 9);
    cup.shake = Math.max(0, cup.shake - dt * 2.6);
    cup.angle = cup.tilt + Math.sin(t * 18) * cup.shake * 0.035;
  }

  function updateFalling(dt, now) {
    const fallSpeed = 116 + level * 9 + Math.min(70, elapsed * 0.7);
    falling.vy = fallSpeed;
    falling.x += falling.vx * dt;
    falling.y += falling.vy * dt;
    falling.rotation += falling.spin * dt;

    if (falling.x < falling.r || falling.x > W - falling.r) {
      falling.vx *= -0.8;
      falling.x = clamp(falling.x, falling.r, W - falling.r);
    }

    const localToCup = worldToCup(falling.x, falling.y);
    if (localToCup.y + falling.r >= -6 && isTouchingCupTop(falling, localToCup)) {
      catchGummy(now, localToCup);
      return;
    }

    if (falling.y + falling.r >= H) {
      falling.y = H - falling.r;
      splashAt(falling.x, falling.y, falling.color, 16);
      endGame("取りこぼし");
    }
  }

  function catchGummy(now, localToCup) {
    const entryY = clamp(localToCup.y + falling.r * 0.35, falling.r + 6, 66);
    const entryHalf = Math.max(10, halfWidthAt(entryY) - falling.r - 3);
    const entryX = clamp(localToCup.x, -entryHalf, entryHalf);
    const entry = cupToWorld(entryX, entryY);
    const edgeNudge = (entryX - localToCup.x) * 1.25;

    const body = {
      id: nextId,
      color: falling.color,
      seed: falling.seed,
      x: entry.x,
      y: entry.y,
      vx: falling.vx * 0.35 - cup.vx * 0.08 + edgeNudge,
      vy: falling.vy * 0.42,
      r: falling.r,
      spin: falling.rotation,
      spinSpeed: falling.spin,
      caughtAt: now,
      inCup: true,
      escapedAt: 0,
      squish: 0
    };

    nextId += 1;
    gummies.push(body);
    cup.shake = Math.min(1, cup.shake + 0.38);
    splashAt(body.x, body.y, body.color, 8);
    spawnGummy();
  }

  function simulateGummies(dt, now) {
    const steps = 3;
    const step = dt / steps;

    for (let s = 0; s < steps; s += 1) {
      for (const g of gummies) {
        if (g.inCup) {
          g.vx += -cup.accel * 0.18 * step;
        }
        g.vy += GRAVITY * step;
        g.vx *= 0.996;
        g.vy *= 0.997;
        g.x += g.vx * step;
        g.y += g.vy * step;
        g.spin += (g.vx * 0.0012 + g.spinSpeed * 0.25) * step;
        g.squish = Math.max(0, g.squish - step * 4);
      }

      for (let i = 0; i < 4; i += 1) {
        resolveBodyCollisions();
        for (const g of gummies) {
          updateCupContainment(g, now);
        }
      }
    }
  }

  function updateCupContainment(g, now) {
    const local = worldToCup(g.x, g.y);

    if (!g.inCup) {
      if (canReenterCup(g, local, now)) {
        placeGummyInCup(g, local, now);
      }
      return;
    }

    constrainToCup(g, now);
    dampenUpwardMotion(g, sideUpwardDamping(g));

    const constrainedLocal = worldToCup(g.x, g.y);
    if (shouldLeaveCup(g, constrainedLocal, now)) {
      g.inCup = false;
      g.escapedAt = now;
      g.vx += cup.vx * 0.05;
    }
  }

  function resolveBodyCollisions() {
    for (let i = 0; i < gummies.length; i += 1) {
      for (let j = i + 1; j < gummies.length; j += 1) {
        const a = gummies[i];
        const b = gummies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r - 1.5;
        const distSq = dx * dx + dy * dy;

        if (distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(distSq) || 0.001;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const push = overlap * 0.5;

        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;

        const relVx = b.vx - a.vx;
        const relVy = b.vy - a.vy;
        const normalSpeed = relVx * nx + relVy * ny;
        if (normalSpeed < 0) {
          const impulse = -normalSpeed * 0.58;
          a.vx -= nx * impulse;
          a.vy -= ny * impulse;
          b.vx += nx * impulse;
          b.vy += ny * impulse;

          const tx = -ny;
          const ty = nx;
          const tangentSpeed = relVx * tx + relVy * ty;
          const friction = tangentSpeed * 0.018;
          a.vx += tx * friction;
          a.vy += ty * friction;
          b.vx -= tx * friction;
          b.vy -= ty * friction;
        }

        const squish = clamp(overlap / Math.max(1, minDist), 0, 0.45);
        a.squish = Math.max(a.squish, squish);
        b.squish = Math.max(b.squish, squish);
      }
    }
  }

  function constrainToCup(g, now) {
    const local = worldToCup(g.x, g.y);
    let changed = false;
    let sideHit = false;
    let floorHit = false;

    if (local.y > cup.height - g.r) {
      local.y = cup.height - g.r;
      changed = true;
      floorHit = true;
    }

    if (local.y > -g.r * 0.95) {
      const half = halfWidthAt(local.y);
      const inner = half - g.r;
      if (local.x < -inner) {
        local.x = -inner;
        changed = true;
        sideHit = true;
      } else if (local.x > inner) {
        local.x = inner;
        changed = true;
        sideHit = true;
      }
    }

    if (!changed) return;

    const world = cupToWorld(local.x, local.y);
    const correctionX = world.x - g.x;
    const correctionY = world.y - g.y;
    g.x = world.x;
    g.y = world.y;

    if (floorHit && g.vy > 0) {
      g.vy *= -0.15;
      g.vx *= 0.94;
      g.vx += cup.vx * 0.025;
      g.squish = Math.max(g.squish, 0.22);
    }

    if (sideHit) {
      if (Math.sign(g.vx) === Math.sign(correctionX) || Math.abs(g.vx) < 80) {
        g.vx *= -0.28;
      }
      g.vx += cup.vx * 0.08;
      g.vy *= 0.97;
      g.squish = Math.max(g.squish, 0.18);
    }

    if (now - g.caughtAt > 160) {
      g.vx += correctionX * 3;
      g.vy += correctionY > 0 ? correctionY * 3 : correctionY * 0.55;
    }
  }

  function sideUpwardDamping(g) {
    const local = worldToCup(g.x, g.y);
    const half = halfWidthAt(local.y);
    const distanceFromWall = Math.abs(local.x) - (half - g.r * 1.8);
    return distanceFromWall > 0 ? 1.25 : 1;
  }

  function dampenUpwardMotion(g, strength = 1) {
    if (g.vy >= 0) return;

    const damping = Math.max(0.45, 1 - 0.26 * strength);
    g.vy *= damping;
    g.vy = Math.max(g.vy, -MAX_UPWARD_SPEED);
  }

  function shouldLeaveCup(g, local, now) {
    if (now - g.caughtAt < 620) return false;

    const exitsThroughTop = local.y < -g.r * 1.05;
    const nearMouth = Math.abs(local.x) < cup.topWidth / 2 + g.r * 0.9;
    return exitsThroughTop && nearMouth;
  }

  function canReenterCup(g, local, now) {
    if (now - g.escapedAt < 180) return false;
    if (local.y - g.r > 14) return false;
    if (local.y > g.r + 18) return false;
    if (g.vy < -30) return false;
    return isTouchingCupTop(g, local);
  }

  function placeGummyInCup(g, local, now) {
    const entryY = clamp(local.y + g.r * 0.35, g.r + 6, 66);
    const entryHalf = Math.max(10, halfWidthAt(entryY) - g.r - 3);
    const entryX = clamp(local.x, -entryHalf, entryHalf);
    const entry = cupToWorld(entryX, entryY);
    const edgeNudge = (entryX - local.x) * 1.1;

    g.x = entry.x;
    g.y = entry.y;
    g.vx = g.vx * 0.42 - cup.vx * 0.08 + edgeNudge;
    g.vy = Math.max(28, g.vy * 0.45);
    g.inCup = true;
    g.caughtAt = now;
    g.escapedAt = 0;
    g.squish = Math.max(g.squish, 0.18);
    cup.shake = Math.min(1, cup.shake + 0.22);
  }

  function resolveMatches(now) {
    const groups = findTouchGroups();
    if (!groups.length) {
      if (chainText !== "取りこぼし" && chainText !== "あふれた") chainText = "";
      return;
    }

    const removed = new Set();
    let scoreAdded = 0;

    for (const group of groups) {
      for (const index of group) {
        if (removed.has(index)) continue;
        const g = gummies[index];
        removed.add(index);
        scoreAdded += 110;
        splashAt(g.x, g.y, g.color, 14);
      }
      scoreAdded += Math.max(0, group.length - 4) * 55;
    }

    for (let i = gummies.length - 1; i >= 0; i -= 1) {
      if (removed.has(i)) gummies.splice(i, 1);
    }

    score += scoreAdded;
    cup.shake = Math.min(1, cup.shake + 0.22);
    chainText = `${removed.size} CLEAR`;
    scoreBursts.push({
      text: `+${scoreAdded}`,
      x: W / 2,
      y: cup.y - 32,
      age: 0,
      color: "#f65368"
    });
  }

  function findTouchGroups() {
    const visited = new Set();
    const groups = [];

    for (let i = 0; i < gummies.length; i += 1) {
      if (!gummies[i].inCup) continue;
      if (visited.has(i)) continue;
      const color = gummies[i].color;
      const stack = [i];
      const group = [];
      visited.add(i);

      while (stack.length) {
        const currentIndex = stack.pop();
        const current = gummies[currentIndex];
        group.push(currentIndex);

        for (let j = 0; j < gummies.length; j += 1) {
          if (!gummies[j].inCup || visited.has(j) || gummies[j].color !== color) continue;
          if (!areTouching(current, gummies[j])) continue;
          visited.add(j);
          stack.push(j);
        }
      }

      if (group.length >= 4) groups.push(group);
    }

    return groups;
  }

  function areTouching(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const reach = (a.r + b.r) * 1.18;
    return dx * dx + dy * dy <= reach * reach;
  }

  function checkOverflow(now) {
    for (const g of gummies) {
      if (g.inCup) continue;

      if (g.y + g.r >= H) {
        g.y = H - g.r;
        splashAt(g.x, g.y, g.color, 18);
        endGame("あふれた");
        return;
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 460 * dt;
      p.spin += p.spinSpeed * dt;
      if (p.age >= p.life) particles.splice(i, 1);
    }

    for (let i = scoreBursts.length - 1; i >= 0; i -= 1) {
      const b = scoreBursts[i];
      b.age += dt;
      b.y -= 42 * dt;
      if (b.age >= 0.9) scoreBursts.splice(i, 1);
    }
  }

  function splashAt(x, y, colorIndex, count) {
    const palette = colors[colorIndex];
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 150;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 68,
        r: 3 + Math.random() * 5,
        age: 0,
        life: 0.45 + Math.random() * 0.45,
        color: palette.base,
        light: palette.light,
        spin: Math.random() * Math.PI,
        spinSpeed: -7 + Math.random() * 14
      });
    }
  }

  function draw(now) {
    const t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    drawBackground(t);
    drawHud(t);
    drawDropLane(t);
    drawCupBack(t);
    drawGummies(t);
    drawCupFront(t);
    drawFalling(t);
    drawParticles();
    drawScoreBursts();
    if (state === "paused") drawPaused();
    if (state === "over") drawGameOver(t);
  }

  function drawBackground(t) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#fffaf0");
    sky.addColorStop(0.58, "#effbf6");
    sky.addColorStop(1, "#e9f3ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#9bc8c8";
    ctx.lineWidth = 1;
    for (let i = 0; i < 22; i += 1) {
      const x = ((i * 67 + Math.sin(t * 0.7 + i) * 9) % W + W) % W;
      const y = 78 + ((i * 71 + t * 18) % 470);
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud() {
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
    roundRect(24, 18, 260, 94, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(38, 50, 58, 0.12)";
    ctx.stroke();

    ctx.fillStyle = "#26323a";
    ctx.font = "800 15px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("ぷるぷるグミカップ", 42, 30);
    ctx.font = "800 24px system-ui, sans-serif";
    ctx.fillText(String(score).padStart(5, "0"), 42, 54);

    ctx.font = "700 13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(38, 50, 58, 0.66)";
    ctx.fillText(`LV ${level}`, 184, 56);
    ctx.fillText(`BEST ${String(highScore).padStart(5, "0")}`, 42, 94);

    if (chainText) {
      ctx.fillStyle = "#f65368";
      ctx.font = "900 16px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(chainText, W - 36, 95);
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.76)";
    roundRect(W - 116, 18, 92, 72, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(38, 50, 58, 0.12)";
    ctx.stroke();
    ctx.fillStyle = "rgba(38, 50, 58, 0.62)";
    ctx.font = "800 13px system-ui, sans-serif";
    ctx.fillText("NEXT", W - 98, 29);
    drawGummy(W - 70, 62, 20, nextColor, 0, 8, 0.05, 1);
    ctx.restore();
  }

  function drawDropLane(t) {
    if (!falling || state === "over") return;

    ctx.save();
    ctx.globalAlpha = 0.14 + Math.sin(t * 6) * 0.025;
    ctx.strokeStyle = colors[falling.color].base;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 14]);
    ctx.beginPath();
    ctx.moveTo(falling.x, 92);
    ctx.lineTo(falling.x, cup.y - 18);
    ctx.stroke();
    ctx.restore();
  }

  function drawCupBack() {
    ctx.save();
    transformCup();

    const top = cup.topWidth;
    const bottom = cup.bottomWidth;
    const h = cup.height;

    const glass = ctx.createLinearGradient(-top / 2, 0, top / 2, h);
    glass.addColorStop(0, "rgba(255, 255, 255, 0.32)");
    glass.addColorStop(0.48, "rgba(237, 255, 252, 0.18)");
    glass.addColorStop(1, "rgba(220, 235, 255, 0.3)");
    ctx.fillStyle = glass;
    ctx.strokeStyle = "rgba(48, 93, 104, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-top / 2 - 22, -6);
    ctx.quadraticCurveTo(0, -22, top / 2 + 22, -6);
    ctx.lineTo(bottom / 2 + 10, h + 28);
    ctx.quadraticCurveTo(0, h + 48, -bottom / 2 - 10, h + 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = "rgba(76, 107, 116, 0.18)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i += 1) {
      const y = 42 + i * 48;
      const half = halfWidthAt(y);
      ctx.beginPath();
      ctx.moveTo(-half + 12, y);
      ctx.quadraticCurveTo(0, y + Math.sin(i) * 3, half - 12, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCupFront() {
    ctx.save();
    transformCup();

    const top = cup.topWidth;
    const bottom = cup.bottomWidth;
    const h = cup.height;
    const pulse = cup.shake * 9;

    ctx.lineWidth = 5 + pulse * 0.1;
    ctx.strokeStyle = `rgba(80, 155, 168, ${0.5 + cup.shake * 0.26})`;
    ctx.beginPath();
    ctx.moveTo(-top / 2 - 24 - pulse, -6);
    ctx.quadraticCurveTo(0, -28 - pulse * 0.5, top / 2 + 24 + pulse, -6);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.64)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-top / 2 + 36, 24);
    ctx.quadraticCurveTo(-top / 2 + 18, h * 0.48, -bottom / 2 + 28, h + 18);
    ctx.stroke();

    ctx.strokeStyle = "rgba(48, 93, 104, 0.34)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-top / 2 - 16, 4);
    ctx.lineTo(-bottom / 2 - 6, h + 30);
    ctx.quadraticCurveTo(0, h + 50, bottom / 2 + 6, h + 30);
    ctx.lineTo(top / 2 + 16, 4);
    ctx.stroke();
    ctx.restore();
  }

  function drawGummies(t) {
    for (const g of gummies) {
      const speed = Math.hypot(g.vx, g.vy);
      const pop = 1 + Math.min(0.2, speed / 1200) + g.squish * 0.7;
      drawGummy(g.x, g.y, g.r, g.color, t, g.seed, g.spin, pop);
    }
  }

  function drawFalling(t) {
    if (!falling || state === "over") return;
    drawGummy(
      falling.x,
      falling.y,
      falling.r,
      falling.color,
      t,
      falling.seed,
      falling.rotation,
      1.04
    );
  }

  function drawGummy(x, y, r, colorIndex, t, seed, rotation = 0, pop = 1) {
    const palette = colors[colorIndex];
    const wobble = Math.sin(t * 10 + seed) * 0.055 + Math.sin(t * 17 + seed * 0.41) * 0.025;
    const sx = pop * (1 + wobble);
    const sy = pop * (1 - wobble * 0.85);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation + Math.sin(t * 4 + seed) * 0.03);
    ctx.scale(sx, sy);

    ctx.shadowColor = "rgba(61, 70, 72, 0.22)";
    ctx.shadowBlur = 11;
    ctx.shadowOffsetY = 7;

    const gradient = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.16, 0, 0, r * 1.12);
    gradient.addColorStop(0, palette.light);
    gradient.addColorStop(0.34, palette.base);
    gradient.addColorStop(1, palette.dark);

    ctx.fillStyle = gradient;
    blobPath(r, t, seed);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
    blobPath(r * 0.94, t + 0.2, seed + 1.7);
    ctx.stroke();

    ctx.globalAlpha = 0.74;
    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.39, r * 0.34, r * 0.17, -0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(r * 0.26, r * 0.2, r * 0.14, r * 0.08, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function blobPath(r, t, seed) {
    const a = Math.sin(t * 9 + seed) * r * 0.025;
    const b = Math.cos(t * 7 + seed * 0.7) * r * 0.03;
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r - a);
    ctx.bezierCurveTo(r * 0.58, -r * 1.04 - b, r * 1.08 + a, -r * 0.46, r * 0.98, r * 0.04);
    ctx.bezierCurveTo(r * 0.86 + b, r * 0.66, r * 0.34, r * 1.04 + a, -r * 0.24, r * 0.94);
    ctx.bezierCurveTo(-r * 0.84 - a, r * 0.84, -r * 1.08, r * 0.28 + b, -r * 0.98, -r * 0.24);
    ctx.bezierCurveTo(-r * 0.87, -r * 0.72, -r * 0.58, -r * 0.96, -r * 0.1, -r - a);
    ctx.closePath();
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      const alpha = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      const gradient = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 1, 0, 0, p.r);
      gradient.addColorStop(0, p.light);
      gradient.addColorStop(1, p.color);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawScoreBursts() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const b of scoreBursts) {
      const alpha = 1 - b.age / 0.9;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = b.color;
      ctx.font = "900 26px system-ui, sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.strokeText(b.text, b.x, b.y);
      ctx.fillText(b.text, b.x, b.y);
    }
    ctx.restore();
  }

  function drawGameOver(t) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 250, 240, 0.82)";
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < colors.length; i += 1) {
      const x = W / 2 - 168 + i * 48 + Math.sin(t * 2.2 + i) * 6;
      const y = 205 + Math.cos(t * 2.8 + i) * 7;
      drawGummy(x, y, 17, i, t, i * 9.7, 0, 1);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#26323a";
    ctx.font = "900 46px system-ui, sans-serif";
    ctx.fillText("GAME OVER", W / 2, 282);
    ctx.font = "800 20px system-ui, sans-serif";
    ctx.fillText(chainText || "FINISH", W / 2, 325);

    ctx.font = "900 32px system-ui, sans-serif";
    ctx.fillText(String(score).padStart(5, "0"), W / 2, 378);
    ctx.font = "800 16px system-ui, sans-serif";
    ctx.fillStyle = "rgba(38, 50, 58, 0.68)";
    ctx.fillText(`BEST ${String(highScore).padStart(5, "0")}`, W / 2, 416);

    ctx.fillStyle = "#26323a";
    roundRect(W / 2 - 82, 464, 164, 52, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 18px system-ui, sans-serif";
    ctx.fillText("RESTART", W / 2, 490);
    ctx.restore();
  }

  function drawPaused() {
    ctx.save();
    ctx.fillStyle = "rgba(255, 250, 240, 0.68)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#26323a";
    ctx.font = "900 44px system-ui, sans-serif";
    ctx.fillText("PAUSE", W / 2, 342);
    ctx.restore();
  }

  function isTouchingCupTop(gummy, local) {
    const rimHalf = cup.topWidth / 2 + 24;
    const horizontalOverlap = local.x + gummy.r >= -rimHalf && local.x - gummy.r <= rimHalf;
    const verticalOverlap = local.y + gummy.r >= -8 && local.y - gummy.r <= 14;
    return horizontalOverlap && verticalOverlap;
  }

  function cupCenterX() {
    return cup.x + cup.topWidth / 2;
  }

  function halfWidthAt(localY) {
    const p = clamp(localY / cup.height, 0, 1);
    return cup.topWidth / 2 - ((cup.topWidth - cup.bottomWidth) / 2) * p;
  }

  function cupToWorld(localX, localY) {
    const c = Math.cos(cup.angle);
    const s = Math.sin(cup.angle);
    return {
      x: cupCenterX() + localX * c - localY * s,
      y: cup.y + localX * s + localY * c
    };
  }

  function worldToCup(x, y) {
    const c = Math.cos(cup.angle);
    const s = Math.sin(cup.angle);
    const dx = x - cupCenterX();
    const dy = y - cup.y;
    return {
      x: dx * c + dy * s,
      y: -dx * s + dy * c
    };
  }

  function transformCup() {
    ctx.translate(cupCenterX(), cup.y);
    ctx.rotate(cup.angle);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loop(now) {
    const dt = Math.min(0.033, Math.max(0, (now - lastTime) / 1000 || 0));
    lastTime = now;
    update(dt, now);
    draw(now);
    requestAnimationFrame(loop);
  }

  function bindKeyEvents() {
    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        if (state === "playing") keys.left = true;
        event.preventDefault();
      } else if (event.key === "ArrowRight") {
        if (state === "playing") keys.right = true;
        event.preventDefault();
      } else if (event.key === "p" || event.key === "P" || event.key === "Escape") {
        togglePause();
        event.preventDefault();
      } else if (event.key === " " || event.key === "Enter") {
        if (state === "over") resetGame();
        else togglePause();
        event.preventDefault();
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.key === "ArrowLeft") {
        keys.left = false;
        event.preventDefault();
      } else if (event.key === "ArrowRight") {
        keys.right = false;
        event.preventDefault();
      }
    });
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      keys.left = false;
      keys.right = false;
      pauseButton.textContent = "▶";
      pauseButton.setAttribute("aria-label", "再開");
    } else if (state === "paused") {
      state = "playing";
      pauseButton.textContent = "⏸";
      pauseButton.setAttribute("aria-label", "一時停止");
      canvas.focus({ preventScroll: true });
    }
  }

  function bindButton(button, keyName) {
    const press = (event) => {
      event.preventDefault();
      keys[keyName] = true;
      button.classList.add("is-active");
      canvas.focus({ preventScroll: true });
    };
    const release = (event) => {
      event.preventDefault();
      keys[keyName] = false;
      button.classList.remove("is-active");
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (state === "over") {
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * W;
      const y = ((event.clientY - rect.top) / rect.height) * H;
      if (x >= W / 2 - 92 && x <= W / 2 + 92 && y >= 450 && y <= 530) {
        resetGame();
      }
    }
    canvas.focus({ preventScroll: true });
  });

  pauseButton.addEventListener("click", togglePause);
  restartButton.addEventListener("click", resetGame);
  bindButton(leftButton, "left");
  bindButton(rightButton, "right");
  bindKeyEvents();
  initCanvas();
  window.addEventListener("resize", initCanvas);
  resetGame();
  requestAnimationFrame(loop);
})();
