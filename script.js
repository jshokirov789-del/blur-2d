const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const menu = document.getElementById("menu");
const startButton = document.getElementById("startButton");
const statusBanner = document.getElementById("statusBanner");
const touchButtons = Array.from(document.querySelectorAll(".touch-button"));

const world = { width: 2500, height: 1600 };
const roadWidth = 170;
const targetLaps = 3;

const trackPoints = [
  { x: 270, y: 805 },
  { x: 350, y: 470 },
  { x: 705, y: 255 },
  { x: 1175, y: 295 },
  { x: 1515, y: 205 },
  { x: 1935, y: 390 },
  { x: 2215, y: 760 },
  { x: 2060, y: 1175 },
  { x: 1710, y: 1350 },
  { x: 1310, y: 1265 },
  { x: 885, y: 1390 },
  { x: 470, y: 1215 }
];

const cityBlocks = [
  { x: 80, y: 80, w: 285, h: 220, accent: "#2ad6ff" },
  { x: 520, y: 40, w: 235, h: 145, accent: "#ffc06b" },
  { x: 855, y: 52, w: 330, h: 150, accent: "#5ff1ff" },
  { x: 1290, y: 35, w: 255, h: 125, accent: "#ff7688" },
  { x: 1710, y: 70, w: 320, h: 200, accent: "#ffc06b" },
  { x: 2190, y: 270, w: 195, h: 260, accent: "#4ce1ff" },
  { x: 2215, y: 1000, w: 210, h: 210, accent: "#ff7688" },
  { x: 1785, y: 1405, w: 245, h: 130, accent: "#5ff1ff" },
  { x: 1180, y: 1410, w: 255, h: 135, accent: "#ffc06b" },
  { x: 645, y: 1470, w: 255, h: 110, accent: "#ff7688" },
  { x: 95, y: 1165, w: 250, h: 245, accent: "#4ce1ff" },
  { x: 60, y: 640, w: 155, h: 185, accent: "#ffc06b" }
];

const track = buildTrack(trackPoints);
const trackPath = buildTrackPath(track.points);

const keys = new Set();
const touchState = [
  { left: false, right: false, fire: false },
  { left: false, right: false, fire: false }
];

const desktopFire = { held: false };

const boostPads = [
  0.06, 0.16, 0.29, 0.43, 0.58, 0.71, 0.83, 0.93
].map((ratio) => ({
  distance: track.totalLength * ratio,
  radius: 42,
  readyAt: 0
}));

const projectiles = [];
const particles = [];
const players = [];

const game = {
  dpr: 1,
  width: 0,
  height: 0,
  split: "vertical",
  viewports: [],
  time: 0,
  lastTime: 0,
  state: "menu",
  message: "Press Start Duel to launch the arena.",
  messageUntil: 0,
  pointerCoarse: window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawRoundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function buildTrack(points) {
  const segments = [];
  let totalLength = 0;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    segments.push({
      start,
      end,
      dx,
      dy,
      length,
      cumulative: totalLength
    });

    totalLength += length;
  }

  return { points, segments, totalLength };
}

function buildTrackPath(points) {
  const path = new Path2D();
  path.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    path.lineTo(points[index].x, points[index].y);
  }

  path.closePath();
  return path;
}

function sampleTrack(distanceAlong) {
  const wrapped = ((distanceAlong % track.totalLength) + track.totalLength) % track.totalLength;

  for (const segment of track.segments) {
    if (wrapped <= segment.cumulative + segment.length) {
      const local = wrapped - segment.cumulative;
      const t = segment.length === 0 ? 0 : local / segment.length;
      return {
        x: segment.start.x + segment.dx * t,
        y: segment.start.y + segment.dy * t,
        angle: Math.atan2(segment.dy, segment.dx),
        distanceAlong: wrapped
      };
    }
  }

  const last = track.segments[track.segments.length - 1];
  return {
    x: last.end.x,
    y: last.end.y,
    angle: Math.atan2(last.dy, last.dx),
    distanceAlong: wrapped
  };
}

function closestPointOnTrack(x, y) {
  let best = null;

  for (const segment of track.segments) {
    const lengthSquared = segment.length * segment.length || 1;
    const t = clamp(
      ((x - segment.start.x) * segment.dx + (y - segment.start.y) * segment.dy) / lengthSquared,
      0,
      1
    );
    const px = segment.start.x + segment.dx * t;
    const py = segment.start.y + segment.dy * t;
    const dist = Math.hypot(x - px, y - py);

    if (!best || dist < best.distance) {
      best = {
        x: px,
        y: py,
        distance: dist,
        angle: Math.atan2(segment.dy, segment.dx),
        distanceAlong: segment.cumulative + segment.length * t
      };
    }
  }

  return best;
}

function spawnBurst(x, y, color, count, spread = Math.PI * 2, speed = 180) {
  for (let index = 0; index < count; index += 1) {
    const angle = spread >= Math.PI * 2
      ? Math.random() * spread
      : -spread / 2 + Math.random() * spread;
    const velocity = speed * (0.35 + Math.random() * 0.85);

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      size: 2 + Math.random() * 4,
      life: 0.22 + Math.random() * 0.45,
      maxLife: 0.65,
      color
    });
  }
}

function createPlayer(id, name, color, accent, leftKey, rightKey, spawnDistance) {
  const spawn = sampleTrack(spawnDistance);

  return {
    id,
    name,
    color,
    accent,
    leftKey,
    rightKey,
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    speed: 250,
    radius: 24,
    health: 100,
    lap: 0,
    cooldown: 0,
    boostTimer: 0,
    trailTimer: 0,
    trail: [],
    lastProgress: spawn.distanceAlong,
    input: {
      left: false,
      right: false,
      fire: false
    }
  };
}

function setMessage(message, seconds = 0) {
  game.message = message;
  game.messageUntil = seconds > 0 ? game.time + seconds : 0;
  statusBanner.textContent = message;
}

function resetGame() {
  players.length = 0;
  projectiles.length = 0;
  particles.length = 0;

  players.push(
    createPlayer(0, "Player 1", "#55dcff", "#b8f4ff", "KeyA", "KeyD", track.totalLength * 0.1),
    createPlayer(1, "Player 2", "#ff6d88", "#ffd1d8", "ArrowLeft", "ArrowRight", track.totalLength * 0.6)
  );

  boostPads.forEach((pad) => {
    pad.readyAt = 0;
  });

  touchState.forEach((entry) => {
    entry.left = false;
    entry.right = false;
    entry.fire = false;
  });

  desktopFire.held = false;
  game.time = 0;
  game.lastTime = 0;
  game.state = "running";
  setMessage("First to 3 laps or a knockout wins.", 2.8);
}

function syncInputs() {
  players.forEach((player, index) => {
    const touch = touchState[index];
    player.input.left = keys.has(player.leftKey) || touch.left;
    player.input.right = keys.has(player.rightKey) || touch.right;
    player.input.fire = desktopFire.held || touch.fire;
  });
}

function updatePlayer(player, dt) {
  const steer = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
  const beforeMove = closestPointOnTrack(player.x, player.y);
  const grip = clamp(1 - Math.max(0, beforeMove.distance - roadWidth * 0.28) / (roadWidth * 0.95), 0.3, 1);
  const topSpeed = player.boostTimer > 0 ? 520 : 365;
  const acceleration = player.boostTimer > 0 ? 320 : 220;

  player.speed += acceleration * grip * dt;
  player.speed -= Math.abs(steer) * 24 * dt;
  player.speed = clamp(player.speed, 145, topSpeed);
  player.angle += steer * (1.35 + player.speed / 410) * dt;

  player.x += Math.cos(player.angle) * player.speed * dt;
  player.y += Math.sin(player.angle) * player.speed * dt;

  const nearest = closestPointOnTrack(player.x, player.y);

  if (nearest.distance > roadWidth * 0.48) {
    const pullX = nearest.x - player.x;
    const pullY = nearest.y - player.y;
    const overflow = nearest.distance - roadWidth * 0.48;
    const dist = Math.hypot(pullX, pullY) || 1;
    const force = Math.min(34, overflow * 0.26);

    player.x += (pullX / dist) * force;
    player.y += (pullY / dist) * force;
    player.speed *= 1 - Math.min(0.22, dt * overflow * 0.018);
    player.health -= dt * Math.max(0, nearest.distance - roadWidth * 0.78) * 0.025;
  } else if (nearest.distance > roadWidth * 0.32) {
    player.speed *= 1 - dt * 0.28;
  }

  player.cooldown = Math.max(0, player.cooldown - dt);
  player.boostTimer = Math.max(0, player.boostTimer - dt);
  player.health = clamp(player.health, 0, 100);

  const lapThresholdHigh = track.totalLength * 0.84;
  const lapThresholdLow = track.totalLength * 0.16;

  if (player.lastProgress > lapThresholdHigh && nearest.distanceAlong < lapThresholdLow) {
    player.lap += 1;
    player.health = clamp(player.health + 9, 0, 100);
    spawnBurst(player.x, player.y, player.color, 18, Math.PI * 2, 220);
    setMessage(`${player.name} completed lap ${player.lap}.`, 1.2);
  } else if (player.lastProgress < lapThresholdLow && nearest.distanceAlong > lapThresholdHigh) {
    player.lap = Math.max(0, player.lap - 1);
  }

  player.lastProgress = nearest.distanceAlong;

  player.trailTimer += dt;
  if (player.trailTimer >= 0.03) {
    player.trailTimer = 0;
    player.trail.push({ x: player.x, y: player.y, life: 0.44 });
  }

  for (let index = player.trail.length - 1; index >= 0; index -= 1) {
    player.trail[index].life -= dt;
    if (player.trail[index].life <= 0) {
      player.trail.splice(index, 1);
    }
  }

  if (player.input.fire && player.cooldown <= 0) {
    fireProjectile(player);
  }
}

function fireProjectile(player) {
  const muzzleDistance = player.radius + 22;
  const speed = 700 + player.speed * 0.28;

  projectiles.push({
    ownerId: player.id,
    x: player.x + Math.cos(player.angle) * muzzleDistance,
    y: player.y + Math.sin(player.angle) * muzzleDistance,
    vx: Math.cos(player.angle) * speed,
    vy: Math.sin(player.angle) * speed,
    radius: 7,
    life: 1,
    color: player.color
  });

  player.cooldown = player.boostTimer > 0 ? 0.28 : 0.48;
  spawnBurst(player.x, player.y, player.color, 8, Math.PI * 0.65, 180);
}

function updateProjectiles(dt) {
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index];
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;

    if (
      projectile.life <= 0 ||
      projectile.x < -200 ||
      projectile.x > world.width + 200 ||
      projectile.y < -200 ||
      projectile.y > world.height + 200
    ) {
      projectiles.splice(index, 1);
      continue;
    }

    for (const player of players) {
      if (player.id === projectile.ownerId) {
        continue;
      }

      if (distance(projectile, player) <= player.radius + projectile.radius + 4) {
        player.health = clamp(player.health - 14, 0, 100);
        player.speed = Math.max(145, player.speed - 30);
        player.x += projectile.vx * 0.014;
        player.y += projectile.vy * 0.014;
        spawnBurst(player.x, player.y, projectile.color, 16, Math.PI * 2, 200);
        setMessage(`${players[projectile.ownerId].name} landed a pulse shot.`, 0.7);
        projectiles.splice(index, 1);
        break;
      }
    }
  }
}

function updateBoostPads() {
  for (const pad of boostPads) {
    if (game.time < pad.readyAt) {
      continue;
    }

    const point = sampleTrack(pad.distance);

    for (const player of players) {
      if (distance(point, player) <= pad.radius + player.radius) {
        player.boostTimer = Math.max(player.boostTimer, 1.85);
        player.speed = Math.min(560, player.speed + 135);
        pad.readyAt = game.time + 4;
        spawnBurst(point.x, point.y, "#ffbf67", 20, Math.PI * 2, 250);
        setMessage(`${player.name} grabbed a nitro burst.`, 0.9);
        break;
      }
    }
  }
}

function resolvePlayerCollision() {
  if (players.length < 2) {
    return;
  }

  const first = players[0];
  const second = players[1];
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const dist = Math.hypot(dx, dy);
  const minDist = first.radius + second.radius + 8;

  if (dist > 0 && dist < minDist) {
    const overlap = (minDist - dist) / 2;
    const nx = dx / dist;
    const ny = dy / dist;

    first.x -= nx * overlap;
    first.y -= ny * overlap;
    second.x += nx * overlap;
    second.y += ny * overlap;

    first.speed = Math.max(145, first.speed - 28);
    second.speed = Math.max(145, second.speed - 28);
    spawnBurst((first.x + second.x) / 2, (first.y + second.y) / 2, "#ffffff", 6, Math.PI * 2, 140);
  }
}

function updateParticles(dt) {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;

    if (particle.life <= 0) {
      particles.splice(index, 1);
    }
  }
}

function finishRound(winner, reason) {
  if (game.state !== "running") {
    return;
  }

  game.state = "finished";
  spawnBurst(winner.x, winner.y, winner.color, 54, Math.PI * 2, 320);
  setMessage(`${winner.name} wins by ${reason}. Press R for a rematch.`, 0);
}

function checkForWinner() {
  if (players.some((player) => player.lap >= targetLaps)) {
    const winner = players.reduce((best, player) => (player.lap > best.lap ? player : best), players[0]);
    finishRound(winner, "laps");
    return;
  }

  if (players.some((player) => player.health <= 0)) {
    const winner = players.reduce((best, player) => (player.health > best.health ? player : best), players[0]);
    finishRound(winner, "knockout");
  }
}

function update(dt) {
  if (game.messageUntil && game.time > game.messageUntil && game.state === "running") {
    setMessage("First to 3 laps or a knockout wins.", 0);
  }

  if (game.state !== "running") {
    return;
  }

  game.time += dt;
  syncInputs();
  players.forEach((player) => updatePlayer(player, dt));
  resolvePlayerCollision();
  updateBoostPads();
  updateProjectiles(dt);
  updateParticles(dt);
  checkForWinner();
}

function drawBackdrop(viewport) {
  const gradient = ctx.createLinearGradient(viewport.x, viewport.y, viewport.x + viewport.w, viewport.y + viewport.h);
  gradient.addColorStop(0, "#06101c");
  gradient.addColorStop(0.52, "#091523");
  gradient.addColorStop(1, "#030811");
  ctx.fillStyle = gradient;
  ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);

  const glow = ctx.createRadialGradient(
    viewport.x + viewport.w * 0.5,
    viewport.y + viewport.h * 0.35,
    20,
    viewport.x + viewport.w * 0.5,
    viewport.y + viewport.h * 0.35,
    viewport.w * 0.8
  );
  glow.addColorStop(0, "rgba(61, 216, 255, 0.15)");
  glow.addColorStop(0.45, "rgba(255, 191, 103, 0.08)");
  glow.addColorStop(1, "rgba(3, 8, 17, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(116, 167, 199, 0.08)";
  ctx.lineWidth = 2;

  for (let x = -120; x <= world.width + 120; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, -120);
    ctx.lineTo(x, world.height + 120);
    ctx.stroke();
  }

  for (let y = -120; y <= world.height + 120; y += 120) {
    ctx.beginPath();
    ctx.moveTo(-120, y);
    ctx.lineTo(world.width + 120, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCityBlocks() {
  cityBlocks.forEach((block) => {
    ctx.fillStyle = "rgba(8, 16, 28, 0.96)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 6;
    drawRoundRect(block.x, block.y, block.w, block.h, 22);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = block.accent;
    ctx.lineWidth = 3;
    drawRoundRect(block.x + 12, block.y + 12, block.w - 24, block.h - 24, 16);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    drawRoundRect(block.x + 26, block.y + 26, block.w * 0.38, 14, 7);
    ctx.fill();
  });
}

function drawTrack() {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.shadowColor = "rgba(40, 191, 255, 0.28)";
  ctx.shadowBlur = 48;
  ctx.strokeStyle = "rgba(21, 32, 46, 0.95)";
  ctx.lineWidth = roadWidth + 42;
  ctx.stroke(trackPath);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#1b2330";
  ctx.lineWidth = roadWidth + 12;
  ctx.stroke(trackPath);

  ctx.strokeStyle = "#313a46";
  ctx.lineWidth = roadWidth - 8;
  ctx.stroke(trackPath);

  ctx.strokeStyle = "rgba(255, 112, 130, 0.48)";
  ctx.lineWidth = roadWidth + 22;
  ctx.setLineDash([34, 14]);
  ctx.stroke(trackPath);

  ctx.strokeStyle = "rgba(240, 248, 255, 0.28)";
  ctx.lineWidth = 7;
  ctx.setLineDash([38, 28]);
  ctx.stroke(trackPath);
  ctx.setLineDash([]);
  ctx.restore();

  const startLine = sampleTrack(0);
  ctx.save();
  ctx.translate(startLine.x, startLine.y);
  ctx.rotate(startLine.angle + Math.PI / 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.84)";
  ctx.fillRect(-roadWidth * 0.33, -18, roadWidth * 0.66, 36);
  ctx.fillStyle = "#0a111d";
  for (let index = 0; index < 6; index += 1) {
    ctx.fillRect(-roadWidth * 0.31 + index * 18, -18, 9, 18);
    ctx.fillRect(-roadWidth * 0.31 + index * 18 + 9, 0, 9, 18);
  }
  ctx.restore();
}

function drawBoostPads() {
  boostPads.forEach((pad) => {
    const point = sampleTrack(pad.distance);
    const active = game.time >= pad.readyAt;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.strokeStyle = active ? "rgba(255, 191, 103, 0.88)" : "rgba(255, 191, 103, 0.18)";
    ctx.fillStyle = active ? "rgba(255, 191, 103, 0.18)" : "rgba(255, 191, 103, 0.06)";
    ctx.shadowColor = active ? "rgba(255, 191, 103, 0.45)" : "transparent";
    ctx.shadowBlur = active ? 24 : 0;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, pad.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(0, -16);
    ctx.lineTo(16, 0);
    ctx.lineTo(0, 16);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  });
}

function drawTrails() {
  players.forEach((player) => {
    if (player.trail.length < 2) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = `${player.color}66`;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(player.trail[0].x, player.trail[0].y);

    for (let index = 1; index < player.trail.length; index += 1) {
      ctx.lineTo(player.trail[index].x, player.trail[index].y);
    }

    ctx.stroke();
    ctx.restore();
  });
}

function drawProjectiles() {
  projectiles.forEach((projectile) => {
    ctx.save();
    ctx.fillStyle = projectile.color;
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach((particle) => {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawCar(player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  ctx.shadowColor = player.color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = player.color;
  drawRoundRect(-28, -16, 56, 32, 12);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#07111d";
  drawRoundRect(-18, -10, 36, 20, 8);
  ctx.fill();

  ctx.fillStyle = player.accent;
  ctx.fillRect(-12, -4, 24, 8);
  ctx.fillRect(18, -8, 6, 16);

  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.fillRect(24, -7, 5, 5);
  ctx.fillRect(24, 2, 5, 5);
  ctx.restore();
}

function drawHud(viewport, player) {
  const panelWidth = Math.min(250, viewport.w - 28);
  const panelX = viewport.x + 14;
  const panelY = viewport.y + 14;

  ctx.save();
  ctx.fillStyle = "rgba(5, 11, 20, 0.62)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  drawRoundRect(panelX, panelY, panelWidth, 80, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = player.color;
  ctx.font = '700 13px "Trebuchet MS", sans-serif';
  ctx.fillText(player.name.toUpperCase(), panelX + 14, panelY + 20);

  ctx.fillStyle = "rgba(239, 247, 255, 0.82)";
  ctx.font = '600 12px "Trebuchet MS", sans-serif';
  ctx.fillText(`Lap ${player.lap}/${targetLaps}`, panelX + 14, panelY + 40);

  const hpX = panelX + 14;
  const hpY = panelY + 52;
  const barWidth = panelWidth - 28;

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  drawRoundRect(hpX, hpY, barWidth, 10, 6);
  ctx.fill();

  ctx.fillStyle = player.health > 35 ? player.color : "#ff5e7a";
  drawRoundRect(hpX, hpY, Math.max(16, barWidth * (player.health / 100)), 10, 6);
  ctx.fill();

  ctx.fillStyle = "rgba(239, 247, 255, 0.76)";
  ctx.fillText(`HP ${Math.round(player.health)}`, hpX, hpY + 24);

  const boostLabel = player.boostTimer > 0 ? `Boost ${player.boostTimer.toFixed(1)}s` : "No Boost";
  ctx.fillText(boostLabel, panelX + panelWidth - 94, hpY + 24);
  ctx.restore();
}

function drawWinnerOverlay() {
  const winner = players.reduce((best, player) => (
    player.health + player.lap * 100 > best.health + best.lap * 100 ? player : best
  ), players[0]);

  ctx.save();
  ctx.fillStyle = "rgba(3, 8, 17, 0.48)";
  ctx.fillRect(0, 0, game.width, game.height);

  const panelWidth = Math.min(540, game.width - 40);
  const panelHeight = 170;
  const panelX = (game.width - panelWidth) / 2;
  const panelY = (game.height - panelHeight) / 2;

  ctx.fillStyle = "rgba(5, 11, 20, 0.82)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1.5;
  drawRoundRect(panelX, panelY, panelWidth, panelHeight, 24);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = winner.color;
  ctx.font = '700 18px "Trebuchet MS", sans-serif';
  ctx.fillText("NEON FINISH", panelX + 28, panelY + 42);

  ctx.fillStyle = "#eff7ff";
  ctx.font = '900 34px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';
  ctx.fillText(`${winner.name} WINS`, panelX + 28, panelY + 92);

  ctx.font = '600 15px "Trebuchet MS", sans-serif';
  ctx.fillStyle = "rgba(239, 247, 255, 0.78)";
  ctx.fillText("Press R to restart the duel.", panelX + 28, panelY + 130);
  ctx.restore();
}

function renderViewport(viewport, focusPlayer) {
  drawBackdrop(viewport);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
  ctx.clip();

  ctx.translate(viewport.x + viewport.w / 2, viewport.y + viewport.h / 2);
  const baseZoom = clamp(Math.min(viewport.w / 860, viewport.h / 520), 0.42, 0.82);
  const zoom = baseZoom * (focusPlayer.boostTimer > 0 ? 0.95 : 1);
  ctx.scale(zoom, zoom);
  ctx.translate(-focusPlayer.x, -focusPlayer.y);

  drawGrid();
  drawCityBlocks();
  drawTrack();
  drawBoostPads();
  drawTrails();
  drawProjectiles();
  drawParticles();
  players.forEach((player) => drawCar(player));
  ctx.restore();

  drawHud(viewport, focusPlayer);
}

function drawSplitLine() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(61, 216, 255, 0.22)";
  ctx.shadowBlur = 20;

  if (game.split === "vertical") {
    const splitX = game.width / 2;
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, game.height);
    ctx.stroke();
  } else {
    const splitY = game.height / 2;
    ctx.beginPath();
    ctx.moveTo(0, splitY);
    ctx.lineTo(game.width, splitY);
    ctx.stroke();
  }

  ctx.restore();
}

function renderMenuPreview() {
  ctx.save();
  ctx.fillStyle = "rgba(3, 8, 17, 0.82)";
  ctx.fillRect(0, 0, game.width, game.height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  for (let index = 0; index < 18; index += 1) {
    const x = (index * 140) % game.width;
    const y = (index * 90) % game.height;
    drawRoundRect(x, y, 120, 60, 18);
    ctx.fill();
  }
  ctx.restore();
}

function render() {
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  ctx.clearRect(0, 0, game.width, game.height);

  if (players.length < 2) {
    renderMenuPreview();
    return;
  }

  game.viewports.forEach((viewport, index) => {
    renderViewport(viewport, players[index]);
  });

  drawSplitLine();

  if (game.state === "finished") {
    drawWinnerOverlay();
  }
}

function updateLayout() {
  game.split = game.width >= game.height * 1.15 ? "vertical" : "horizontal";
  document.body.classList.toggle("split-vertical", game.split === "vertical");
  document.body.classList.toggle("split-horizontal", game.split === "horizontal");

  if (game.split === "vertical") {
    game.viewports = [
      { x: 0, y: 0, w: game.width / 2, h: game.height },
      { x: game.width / 2, y: 0, w: game.width / 2, h: game.height }
    ];
  } else {
    game.viewports = [
      { x: 0, y: 0, w: game.width, h: game.height / 2 },
      { x: 0, y: game.height / 2, w: game.width, h: game.height / 2 }
    ];
  }
}

function resizeCanvas() {
  game.dpr = Math.min(window.devicePixelRatio || 1, 2);
  game.width = window.innerWidth;
  game.height = window.innerHeight;
  canvas.width = Math.floor(game.width * game.dpr);
  canvas.height = Math.floor(game.height * game.dpr);
  updateLayout();
  document.body.classList.toggle("touch-mode", game.pointerCoarse);
}

function animationFrame(timestamp) {
  if (!game.lastTime) {
    game.lastTime = timestamp;
  }

  const dt = Math.min(0.033, (timestamp - game.lastTime) / 1000);
  game.lastTime = timestamp;

  update(dt);
  render();
  window.requestAnimationFrame(animationFrame);
}

function setTouchAction(button, isActive) {
  const playerIndex = Number(button.dataset.player);
  const action = button.dataset.action;
  touchState[playerIndex][action] = isActive;
  button.classList.toggle("is-active", isActive);
}

startButton.addEventListener("click", () => {
  resetGame();
  menu.classList.add("hidden");
});

window.addEventListener("resize", resizeCanvas);

document.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "KeyR" && game.state === "finished") {
    resetGame();
    menu.classList.add("hidden");
    return;
  }

  if (event.code === "Escape") {
    game.state = "menu";
    menu.classList.remove("hidden");
    setMessage("Paused. Press Start Duel to continue.", 0);
    return;
  }

  keys.add(event.code);
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0 && game.state === "running") {
    desktopFire.held = true;
  }
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    desktopFire.held = false;
  }
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

touchButtons.forEach((button) => {
  const release = () => setTouchAction(button, false);

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (game.state !== "running") {
      return;
    }
    setTouchAction(button, true);
  });

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

resizeCanvas();
players.push(
  createPlayer(0, "Player 1", "#55dcff", "#b8f4ff", "KeyA", "KeyD", track.totalLength * 0.1),
  createPlayer(1, "Player 2", "#ff6d88", "#ffd1d8", "ArrowLeft", "ArrowRight", track.totalLength * 0.6)
);
setMessage("Press Start Duel to launch the arena.", 0);
window.requestAnimationFrame(animationFrame);
