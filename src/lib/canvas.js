/**
 * Enhanced Canvas drawing utilities for the Marauder's Map
 * Includes: parchment texture, candlelight, ink effects, realistic footprints
 */

// ============================================
// COLOR CONSTANTS
// ============================================
const PARCHMENT_COLORS = {
  base: "#f4e4bc",
  text: "#3d2914",
  inkDark: "#2c1810",
  inkMedium: "#4a3728",
  glow: "rgba(255, 223, 168, 0.8)",
  trail: "rgba(61, 41, 20, 0.5)",
  npcHighlight: "rgba(255, 200, 100, 0.9)",
  dialogueBg: "rgba(252, 246, 232, 0.95)",
  dialogueBorder: "#a56f36",
  candleGlow: "rgba(255, 200, 120, 0.15)",
  secretPath: "rgba(61, 41, 20, 0.2)"
};

const HOUSE_COLORS = {
  Gryffindor: "#740001",
  Slytherin: "#1a472a",
  Hufflepuff: "#c79a1e",
  Ravenclaw: "#0e1a40"
};

// House common room zones
const HOUSE_ZONES = {
  Gryffindor: { x: 180, y: 180, radius: 80 },
  Slytherin: { x: 350, y: 550, radius: 70 },
  Ravenclaw: { x: 750, y: 150, radius: 70 },
  Hufflepuff: { x: 420, y: 520, radius: 70 }
};

// Room labels
const ROOM_LABELS = [
  { name: "Great Hall", x: 500, y: 350, size: 16, important: true },
  { name: "Library", x: 720, y: 280, size: 12 },
  { name: "Potions Classroom", x: 280, y: 450, size: 11 },
  { name: "Gryffindor Tower", x: 180, y: 180, size: 12 },
  { name: "Slytherin Dungeon", x: 350, y: 550, size: 11 },
  { name: "Ravenclaw Tower", x: 750, y: 150, size: 11 },
  { name: "Hufflepuff Basement", x: 420, y: 520, size: 11 },
  { name: "Astronomy Tower", x: 680, y: 120, size: 11 },
  { name: "Owlery", x: 820, y: 200, size: 10 },
  { name: "Hospital Wing", x: 600, y: 220, size: 10 },
  { name: "Room of Requirement", x: 550, y: 480, size: 10, secret: true },
  { name: "Grand Staircase", x: 500, y: 420, size: 11 },
  { name: "Headmaster's Office", x: 620, y: 180, size: 10, important: true }
];

// Secret passages
const SECRET_PASSAGES = [
  { from: { x: 200, y: 300 }, to: { x: 400, y: 500 } },
  { from: { x: 600, y: 200 }, to: { x: 800, y: 400 } },
  { from: { x: 300, y: 400 }, to: { x: 150, y: 550 } }
];

// Moving staircases
const STAIRCASES = [
  { x: 480, y: 380, width: 40, height: 80 },
  { x: 520, y: 420, width: 40, height: 60 },
  { x: 460, y: 450, width: 35, height: 70 }
];

// ============================================
// TIME OF DAY
// ============================================
export const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
};

export const isCurfew = () => {
  const hour = new Date().getHours();
  return hour >= 21 || hour < 6;
};

const TIME_OVERLAYS = {
  morning: { color: "rgba(255, 240, 200, 0.05)" },
  afternoon: { color: "rgba(255, 230, 180, 0.03)" },
  evening: { color: "rgba(255, 180, 100, 0.1)" },
  night: { color: "rgba(30, 20, 50, 0.25)" }
};

// ============================================
// CORE CANVAS
// ============================================
export const clearCanvas = (ctx, width, height) => {
  ctx.clearRect(0, 0, width, height);
};

export const drawBackground = (ctx, image, camera, canvasWidth, canvasHeight) => {
  ctx.fillStyle = PARCHMENT_COLORS.base;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (image) {
    ctx.save();
    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  const timeOfDay = getTimeOfDay();
  const overlay = TIME_OVERLAYS[timeOfDay];
  ctx.fillStyle = overlay.color;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
};

export const drawCandlelightEffect = (ctx, canvasWidth, canvasHeight, time) => {
  const flickerSpeed = 0.003;
  const baseIntensity = 0.08;
  const flicker = Math.sin(time * flickerSpeed) * 0.03 + 
                  Math.sin(time * flickerSpeed * 2.3) * 0.02 +
                  Math.sin(time * flickerSpeed * 0.7) * 0.015;
  const intensity = baseIntensity + flicker;
  
  const gradient = ctx.createRadialGradient(
    canvasWidth / 2, canvasHeight / 2, 0,
    canvasWidth / 2, canvasHeight / 2, Math.max(canvasWidth, canvasHeight) * 0.7
  );
  gradient.addColorStop(0, `rgba(255, 200, 120, ${intensity})`);
  gradient.addColorStop(0.5, `rgba(255, 180, 100, ${intensity * 0.5})`);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const vignette = ctx.createRadialGradient(
    canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.2,
    canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.8
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(0.7, "rgba(20, 10, 5, 0.15)");
  vignette.addColorStop(1, "rgba(20, 10, 5, 0.4)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
};

export const drawParchmentTexture = (ctx, canvasWidth, canvasHeight) => {
  ctx.save();
  ctx.globalAlpha = 0.03;
  ctx.fillStyle = PARCHMENT_COLORS.inkDark;
  
  for (let i = 0; i < 200; i++) {
    const x = (Math.sin(i * 127.1) * 0.5 + 0.5) * canvasWidth;
    const y = (Math.cos(i * 311.7) * 0.5 + 0.5) * canvasHeight;
    const size = Math.abs(Math.sin(i * 43.3)) * 2 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = PARCHMENT_COLORS.inkMedium;
  ctx.lineWidth = 1;
  
  ctx.beginPath();
  ctx.moveTo(0, canvasHeight * 0.33);
  ctx.lineTo(canvasWidth, canvasHeight * 0.33);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(0, canvasHeight * 0.66);
  ctx.lineTo(canvasWidth, canvasHeight * 0.66);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(canvasWidth * 0.5, 0);
  ctx.lineTo(canvasWidth * 0.5, canvasHeight);
  ctx.stroke();
  
  ctx.restore();
};

export const drawBurntEdges = (ctx, canvasWidth, canvasHeight) => {
  ctx.save();
  const edgeSize = 60;
  
  const topGrad = ctx.createLinearGradient(0, 0, 0, edgeSize);
  topGrad.addColorStop(0, "rgba(60, 30, 10, 0.3)");
  topGrad.addColorStop(1, "rgba(60, 30, 10, 0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, canvasWidth, edgeSize);
  
  const bottomGrad = ctx.createLinearGradient(0, canvasHeight, 0, canvasHeight - edgeSize);
  bottomGrad.addColorStop(0, "rgba(60, 30, 10, 0.3)");
  bottomGrad.addColorStop(1, "rgba(60, 30, 10, 0)");
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, canvasHeight - edgeSize, canvasWidth, edgeSize);
  
  const leftGrad = ctx.createLinearGradient(0, 0, edgeSize, 0);
  leftGrad.addColorStop(0, "rgba(60, 30, 10, 0.3)");
  leftGrad.addColorStop(1, "rgba(60, 30, 10, 0)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, edgeSize, canvasHeight);
  
  const rightGrad = ctx.createLinearGradient(canvasWidth, 0, canvasWidth - edgeSize, 0);
  rightGrad.addColorStop(0, "rgba(60, 30, 10, 0.3)");
  rightGrad.addColorStop(1, "rgba(60, 30, 10, 0)");
  ctx.fillStyle = rightGrad;
  ctx.fillRect(canvasWidth - edgeSize, 0, edgeSize, canvasHeight);
  
  ctx.restore();
};

// ============================================
// MAP FEATURES
// ============================================
export const drawRoomLabels = (ctx, camera, time) => {
  ctx.save();
  
  ROOM_LABELS.forEach(label => {
    const screenX = (label.x - camera.x) * camera.zoom;
    const screenY = (label.y - camera.y) * camera.zoom;
    const scale = camera.zoom;
    
    if (screenX < -100 || screenY < -50) return;
    
    if (label.secret) {
      const pulse = Math.sin(time * 0.001) * 0.3 + 0.4;
      ctx.globalAlpha = pulse;
    } else {
      ctx.globalAlpha = 0.7;
    }
    
    const fontSize = (label.important ? label.size * 1.2 : label.size) * scale;
    ctx.font = `italic ${fontSize}px "Crimson Text", serif`;
    ctx.fillStyle = PARCHMENT_COLORS.inkDark;
    ctx.textAlign = "center";
    
    ctx.globalAlpha *= 0.3;
    ctx.fillText(label.name, screenX + 1, screenY + 1);
    ctx.globalAlpha *= 2;
    ctx.fillText(label.name, screenX, screenY);
  });
  
  ctx.restore();
};

export const drawSecretPassages = (ctx, camera, time, discoveredPassages = []) => {
  ctx.save();
  
  SECRET_PASSAGES.forEach((passage, index) => {
    const fromX = (passage.from.x - camera.x) * camera.zoom;
    const fromY = (passage.from.y - camera.y) * camera.zoom;
    const toX = (passage.to.x - camera.x) * camera.zoom;
    const toY = (passage.to.y - camera.y) * camera.zoom;
    
    const isDiscovered = discoveredPassages.includes(index);
    const pulse = Math.sin(time * 0.002 + index) * 0.15 + 0.15;
    
    ctx.globalAlpha = isDiscovered ? 0.5 : pulse;
    ctx.strokeStyle = PARCHMENT_COLORS.secretPath;
    ctx.lineWidth = 2 * camera.zoom;
    ctx.setLineDash([5 * camera.zoom, 8 * camera.zoom]);
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  });
  
  ctx.setLineDash([]);
  ctx.restore();
};

export const drawMovingStaircases = (ctx, camera, time) => {
  ctx.save();
  
  STAIRCASES.forEach((stair, index) => {
    const swing = Math.sin(time * 0.0005 + index * 2) * 10;
    const screenX = (stair.x + swing - camera.x) * camera.zoom;
    const screenY = (stair.y - camera.y) * camera.zoom;
    const width = stair.width * camera.zoom;
    const height = stair.height * camera.zoom;
    
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = PARCHMENT_COLORS.inkMedium;
    ctx.lineWidth = 1.5 * camera.zoom;
    ctx.strokeRect(screenX, screenY, width, height);
    
    const stepCount = 5;
    const stepHeight = height / stepCount;
    for (let i = 1; i < stepCount; i++) {
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + i * stepHeight);
      ctx.lineTo(screenX + width, screenY + i * stepHeight);
      ctx.stroke();
    }
  });
  
  ctx.restore();
};

export const drawHouseZone = (ctx, house, camera, time) => {
  const zone = HOUSE_ZONES[house];
  if (!zone) return;
  
  const screenX = (zone.x - camera.x) * camera.zoom;
  const screenY = (zone.y - camera.y) * camera.zoom;
  const radius = zone.radius * camera.zoom;
  const pulse = Math.sin(time * 0.002) * 0.05 + 0.1;
  
  ctx.save();
  ctx.globalAlpha = pulse;
  
  const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius);
  gradient.addColorStop(0, HOUSE_COLORS[house]);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
};

export const drawCurfewWarning = (ctx, canvasWidth, canvasHeight, time) => {
  if (!isCurfew()) return;
  
  const pulse = Math.sin(time * 0.003) * 0.2 + 0.8;
  
  ctx.save();
  ctx.globalAlpha = pulse * 0.95;
  // Dark background pill for better readability
  ctx.fillStyle = "rgba(20, 10, 5, 0.85)";
  const textWidth = ctx.measureText("⚠ CURFEW IN EFFECT - Students out of bed!").width || 350;
  ctx.font = "bold 14px 'Crimson Text', serif";
  const pillWidth = textWidth + 40;
  const pillHeight = 28;
  const pillX = (canvasWidth - pillWidth) / 2;
  ctx.beginPath();
  ctx.roundRect(pillX, 10, pillWidth, pillHeight, 14);
  ctx.fill();
  // White/light text for contrast
  ctx.fillStyle = "#f4e4bc";
  ctx.textAlign = "center";
  ctx.fillText("⚠ CURFEW IN EFFECT - Students out of bed!", canvasWidth / 2, 30);
  ctx.restore();
};

// ============================================
// FOOTPRINT SYSTEM
// ============================================
const drawLeftFoot = (ctx, x, y, scale, rotation) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  
  ctx.beginPath();
  ctx.ellipse(-4, 0, 4, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-6 + i * 2.5, -10, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
};

const drawRightFoot = (ctx, x, y, scale, rotation) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  
  ctx.beginPath();
  ctx.ellipse(4, 0, 4, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-3 + i * 2.5, -10, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
};

export const drawFootprintPair = (ctx, x, y, direction, house, camera, options = {}) => {
  const { alpha = 1, isRunning = false, inkFade = 1, isLeft = true } = options;
  
  const screenX = (x - camera.x) * camera.zoom;
  const screenY = (y - camera.y) * camera.zoom;
  const scale = camera.zoom * 0.8;
  
  ctx.save();
  ctx.shadowColor = PARCHMENT_COLORS.inkDark;
  ctx.shadowBlur = 2 * scale * inkFade;
  
  const color = HOUSE_COLORS[house] || PARCHMENT_COLORS.inkDark;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * inkFade * 0.8;
  
  const spacing = isRunning ? 8 : 5;
  
  // Add PI/2 to convert movement direction to foot orientation
  // (feet point in direction of travel, not perpendicular)
  const footRotation = direction + Math.PI / 2;
  
  if (isLeft) {
    drawLeftFoot(ctx, screenX - spacing * scale, screenY, scale, footRotation);
  } else {
    drawRightFoot(ctx, screenX + spacing * scale, screenY, scale, footRotation);
  }
  
  ctx.restore();
};

export const drawFootprint = (ctx, x, y, name, house, isCurrentUser, camera, options = {}) => {
  const { 
    isIdle = false, 
    isBlocked = false, 
    isNearby = false, 
    direction = 0,
    isRunning = false,
    appearTime = Date.now() - 2000,
    role = "student"
  } = options;

  const screenX = (x - camera.x) * camera.zoom;
  const screenY = (y - camera.y) * camera.zoom;
  const scale = camera.zoom;

  const timeSinceAppear = Date.now() - appearTime;
  const inkFade = Math.min(1, timeSinceAppear / 1000);

  ctx.save();
  ctx.globalAlpha = isIdle || isBlocked ? 0.3 : 1;

  if (isNearby && !isBlocked) {
    ctx.shadowColor = PARCHMENT_COLORS.glow;
    ctx.shadowBlur = 20 * scale;
  }

  const baseAlpha = inkFade * (isBlocked ? 0.3 : 1);
  
  drawFootprintPair(ctx, x - 3, y, direction, house, camera, {
    alpha: baseAlpha, isRunning, inkFade, isLeft: true
  });
  
  drawFootprintPair(ctx, x + 3, y + 4, direction, house, camera, {
    alpha: baseAlpha * 0.9, isRunning, inkFade, isLeft: false
  });

  ctx.shadowBlur = 0;

  const color = HOUSE_COLORS[house] || PARCHMENT_COLORS.text;
  ctx.fillStyle = color;
  ctx.globalAlpha = inkFade * (isIdle || isBlocked ? 0.3 : 0.9);
  
  let fontSize = isCurrentUser ? 12 : 10;
  let fontStyle = "";
  if (role === "prefect") { fontStyle = "bold "; fontSize += 1; }
  else if (role === "professor") { fontStyle = "bold italic "; fontSize += 2; }
  
  ctx.font = `${fontStyle}${fontSize * scale}px "Crimson Text", serif`;
  ctx.textAlign = "center";
  ctx.shadowColor = color;
  ctx.shadowBlur = 1 * scale * inkFade;
  ctx.fillText(name || house || "Unknown", screenX, screenY + 22 * scale);
  
  if (role === "prefect") {
    ctx.font = `${8 * scale}px serif`;
    ctx.fillText("⭐", screenX + 30 * scale, screenY + 22 * scale);
  } else if (role === "professor") {
    ctx.font = `${8 * scale}px serif`;
    ctx.fillText("🎓", screenX + 35 * scale, screenY + 22 * scale);
  }

  ctx.restore();
};

export const drawFootprintTrail = (ctx, trail, camera, house = "Gryffindor") => {
  if (!trail?.length) return;

  ctx.save();

  trail.forEach((point, index) => {
    const age = Date.now() - point.timestamp;
    const maxAge = 3000;
    const alpha = Math.max(0, 1 - age / maxAge);

    if (alpha <= 0) return;

    // Use stored direction from trail point, or calculate from movement
    let direction = point.direction || 0;
    if (!point.direction && index > 0) {
      const prev = trail[index - 1];
      direction = Math.atan2(point.y - prev.y, point.x - prev.x);
    }
    
    const isLeft = index % 2 === 0;
    
    drawFootprintPair(ctx, point.x, point.y, direction, house, camera, {
      alpha: alpha * 0.5, inkFade: alpha, isLeft
    });
  });

  ctx.restore();
};

// ============================================
// SPELL EFFECTS
// ============================================
export const drawSpellEffect = (ctx, x, y, camera, type = "lumos", time) => {
  const screenX = (x - camera.x) * camera.zoom;
  const screenY = (y - camera.y) * camera.zoom;
  const scale = camera.zoom;
  
  ctx.save();
  
  if (type === "lumos") {
    const pulse = Math.sin(time * 0.01) * 0.2 + 0.8;
    const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 50 * scale);
    gradient.addColorStop(0, `rgba(255, 255, 200, ${pulse})`);
    gradient.addColorStop(0.5, `rgba(255, 230, 150, ${pulse * 0.3})`);
    gradient.addColorStop(1, "rgba(255, 200, 100, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, 50 * scale, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "sparkle") {
    ctx.fillStyle = "rgba(255, 215, 0, 0.8)";
    for (let i = 0; i < 5; i++) {
      const angle = (time * 0.005 + i * Math.PI * 2 / 5) % (Math.PI * 2);
      const dist = 20 * scale;
      const sx = screenX + Math.cos(angle) * dist;
      const sy = screenY + Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(sx, sy, 2 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  ctx.restore();
};

export const drawChattingIndicator = (ctx, x, y, camera, time = Date.now()) => {
  const screenX = (x - camera.x) * camera.zoom;
  const screenY = (y - camera.y) * camera.zoom;
  const scale = camera.zoom;

  ctx.save();
  const bobble = Math.sin(time * 0.008) * 2;
  ctx.fillStyle = PARCHMENT_COLORS.inkDark;
  ctx.font = `${12 * scale}px serif`;
  ctx.textAlign = "center";
  ctx.globalAlpha = 0.7 + Math.sin(time * 0.005) * 0.2;
  ctx.fillText("✒️", screenX + 20 * scale, screenY - 10 * scale + bobble);
  ctx.restore();
};

export const drawOwlDelivery = (ctx, fromX, fromY, toX, toY, camera, progress) => {
  const currentX = fromX + (toX - fromX) * progress;
  const currentY = fromY + (toY - fromY) * progress - Math.sin(progress * Math.PI) * 50;
  
  const screenX = (currentX - camera.x) * camera.zoom;
  const screenY = (currentY - camera.y) * camera.zoom;
  const scale = camera.zoom;
  
  ctx.save();
  ctx.font = `${20 * scale}px serif`;
  ctx.textAlign = "center";
  ctx.fillText("🦉", screenX, screenY);
  ctx.restore();
  
  return progress < 1;
};

// ============================================
// NPC (kept for future)
// ============================================
export const drawNPC = (ctx, npc, camera, isHighlighted = false) => {
  const screenX = (npc.x - camera.x) * camera.zoom;
  const screenY = (npc.y - camera.y) * camera.zoom;
  const scale = camera.zoom;

  ctx.save();
  if (isHighlighted) {
    ctx.shadowColor = PARCHMENT_COLORS.npcHighlight;
    ctx.shadowBlur = 25 * scale;
  }

  ctx.font = `${28 * scale}px serif`;
  ctx.textAlign = "center";
  ctx.fillText("👣", screenX, screenY);
  ctx.shadowBlur = 0;

  ctx.fillStyle = isHighlighted ? PARCHMENT_COLORS.npcHighlight : PARCHMENT_COLORS.text;
  ctx.font = `bold ${11 * scale}px "Crimson Text", serif`;
  ctx.fillText(npc.name, screenX, screenY + 20 * scale);

  if (npc.title) {
    ctx.font = `italic ${9 * scale}px "Crimson Text", serif`;
    ctx.fillStyle = PARCHMENT_COLORS.text;
    ctx.globalAlpha = 0.7;
    ctx.fillText(npc.title, screenX, screenY + 32 * scale);
  }

  ctx.restore();
};

export const drawDialogueBox = (ctx, npc, camera, canvasWidth) => {
  const screenX = (npc.x - camera.x) * camera.zoom;
  const screenY = (npc.y - camera.y) * camera.zoom;
  const scale = camera.zoom;

  const boxWidth = 220 * scale;
  const boxHeight = 80 * scale;
  const boxX = Math.min(screenX - boxWidth / 2, canvasWidth - boxWidth - 10);
  const boxY = screenY - boxHeight - 40 * scale;

  ctx.save();
  ctx.fillStyle = PARCHMENT_COLORS.dialogueBg;
  ctx.strokeStyle = PARCHMENT_COLORS.dialogueBorder;
  ctx.lineWidth = 2 * scale;

  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8 * scale);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PARCHMENT_COLORS.text;
  ctx.font = `bold ${12 * scale}px "Crimson Text", serif`;
  ctx.textAlign = "left";
  ctx.fillText(npc.name, boxX + 12 * scale, boxY + 20 * scale);
  ctx.restore();

  return { x: boxX, y: boxY, width: boxWidth, height: boxHeight, npcId: npc.id };
};

// ============================================
// COORDINATE TRANSFORMS
// ============================================
export const screenToWorld = (screenX, screenY, camera) => ({
  x: screenX / camera.zoom + camera.x,
  y: screenY / camera.zoom + camera.y
});

export const worldToScreen = (worldX, worldY, camera) => ({
  x: (worldX - camera.x) * camera.zoom,
  y: (worldY - camera.y) * camera.zoom
});

// ============================================
// CURFEW DARKNESS OVERLAY WITH LUMOS LIGHT
// ============================================
export const drawCurfewDarkness = (ctx, canvasWidth, canvasHeight, playerScreenX, playerScreenY, lumosActive, time, lumosFlash = false) => {
  // LUMOS MAXIMA - Show full daylight map (no darkness at all!)
  if (lumosFlash) {
    // Don't draw any darkness - map appears in full daylight
    return;
  }
  
  // Create dark overlay with player's flashlight cutout
  const lightRadius = lumosActive ? 180 : 100; // Bigger radius when Lumos is active
  const flickerAmount = lumosActive ? 8 : 5;
  const flicker = Math.sin(time * 0.005) * flickerAmount + Math.sin(time * 0.008) * (flickerAmount / 2);
  const currentRadius = lightRadius + flicker;
  
  // Create radial gradient for flashlight effect
  const gradient = ctx.createRadialGradient(
    playerScreenX, playerScreenY, 0,
    playerScreenX, playerScreenY, currentRadius
  );
  
  if (lumosActive) {
    // Lumos spell - warm bright light
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.3, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.6, "rgba(0, 0, 0, 0.3)");
    gradient.addColorStop(0.85, "rgba(0, 0, 0, 0.7)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.92)");
  } else {
    // Normal curfew - dim light
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.2, "rgba(0, 0, 0, 0.2)");
    gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.6)");
    gradient.addColorStop(0.8, "rgba(0, 0, 0, 0.85)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.95)");
  }
  
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Add Lumos glow effect when active
  if (lumosActive) {
    const glowGradient = ctx.createRadialGradient(
      playerScreenX, playerScreenY, 0,
      playerScreenX, playerScreenY, currentRadius * 0.6
    );
    glowGradient.addColorStop(0, "rgba(255, 255, 200, 0.15)");
    glowGradient.addColorStop(0.5, "rgba(255, 230, 150, 0.08)");
    glowGradient.addColorStop(1, "rgba(255, 200, 100, 0)");
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  
  ctx.restore();
};

// Draw scary NPC on canvas
export const drawScaryNPC = (ctx, npc, camera, timestamp, isVisible = true) => {
  const screenX = (npc.x - camera.x) * camera.zoom;
  const screenY = (npc.y - camera.y) * camera.zoom;
  const scale = camera.zoom;
  
  // Don't draw if not visible (outside Lumos radius during curfew)
  if (!isVisible) return;
  
  ctx.save();
  
  // Draw warning glow FIRST (behind everything) - much more visible now!
  if (npc.isScary) {
    const warningPulse = Math.sin(timestamp * 0.008) * 0.4 + 0.6;
    const glowSize = 45 * scale;
    
    // Outer red glow - large and visible
    const gradient = ctx.createRadialGradient(screenX, screenY - 5 * scale, 0, screenX, screenY - 5 * scale, glowSize);
    gradient.addColorStop(0, `rgba(255, 50, 50, ${warningPulse * 0.6})`);
    gradient.addColorStop(0.4, `rgba(200, 30, 30, ${warningPulse * 0.35})`);
    gradient.addColorStop(0.7, `rgba(150, 0, 0, ${warningPulse * 0.15})`);
    gradient.addColorStop(1, 'rgba(100, 0, 0, 0)');
    
    ctx.beginPath();
    ctx.arc(screenX, screenY - 5 * scale, glowSize, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Inner pulsing ring
    ctx.beginPath();
    ctx.arc(screenX, screenY - 5 * scale, 25 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 100, 100, ${warningPulse * 0.8})`;
    ctx.lineWidth = 3 * scale;
    ctx.stroke();
  }
  
  // Dark background circle for better visibility
  ctx.beginPath();
  ctx.arc(screenX, screenY - 2 * scale, 22 * scale, 0, Math.PI * 2);
  ctx.fillStyle = npc.ghostly ? 'rgba(30, 50, 80, 0.9)' : 'rgba(20, 10, 5, 0.85)';
  ctx.fill();
  ctx.strokeStyle = npc.ghostly ? 'rgba(100, 180, 255, 0.7)' : 'rgba(139, 69, 19, 0.8)';
  ctx.lineWidth = 2 * scale;
  ctx.stroke();
  
  // Ghostly effect for dementor
  if (npc.ghostly) {
    const pulse = Math.sin(timestamp * 0.004) * 0.2 + 0.8;
    ctx.globalAlpha = pulse;
  }
  
  // Draw NPC emoji/icon - larger and clearer
  const fontSize = Math.max(28 * scale, 20);
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(npc.emoji || '👤', screenX, screenY - 2 * scale);
  
  ctx.globalAlpha = 1;
  
  // Draw name label below with dark background for contrast
  const labelFontSize = Math.max(11 * scale, 9);
  ctx.font = `bold ${labelFontSize}px "Crimson Text", serif`;
  const textWidth = ctx.measureText(npc.name).width;
  
  // Label background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(screenX - textWidth/2 - 6, screenY + 16 * scale, textWidth + 12, labelFontSize + 6, 4);
  ctx.fill();
  
  // Label text - bright color for visibility
  ctx.fillStyle = npc.ghostly ? '#8ec8ff' : '#ff9966';
  ctx.textBaseline = 'top';
  ctx.fillText(npc.name, screenX, screenY + 18 * scale);
  
  ctx.restore();
};

// Draw scary encounter dialogue box
export const drawScaryEncounterDialogue = (ctx, npc, dialogue, canvasWidth, canvasHeight) => {
  ctx.save();
  
  // Semi-transparent dark overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Dialogue box
  const boxWidth = Math.min(380, canvasWidth - 40);
  const boxHeight = 200;
  const boxX = (canvasWidth - boxWidth) / 2;
  const boxY = (canvasHeight - boxHeight) / 2;
  
  // Parchment background with scary border
  ctx.fillStyle = "rgba(252, 246, 232, 0.98)";
  ctx.strokeStyle = npc.ghostly ? "#4a6fa5" : "#8B0000";
  ctx.lineWidth = 4;
  
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
  ctx.fill();
  ctx.stroke();
  
  // Inner border
  ctx.strokeStyle = npc.ghostly ? "rgba(74, 111, 165, 0.5)" : "rgba(139, 0, 0, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(boxX + 8, boxY + 8, boxWidth - 16, boxHeight - 16, 8);
  ctx.stroke();
  
  // NPC emoji
  ctx.font = "48px Arial";
  ctx.textAlign = "center";
  ctx.fillText(npc.emoji || "👤", canvasWidth / 2, boxY + 55);
  
  // NPC name
  ctx.fillStyle = npc.ghostly ? "#4a6fa5" : "#8B0000";
  ctx.font = "bold 20px 'Crimson Text', serif";
  ctx.fillText(npc.name, canvasWidth / 2, boxY + 85);
  
  // Title
  if (npc.title) {
    ctx.fillStyle = "#666";
    ctx.font = "italic 12px 'Crimson Text', serif";
    ctx.fillText(npc.title, canvasWidth / 2, boxY + 102);
  }
  
  // Dialogue text with word wrap
  ctx.fillStyle = "#3d2914";
  ctx.font = "italic 16px 'Crimson Text', serif";
  
  const maxWidth = boxWidth - 40;
  const words = dialogue.split(' ');
  let line = '';
  let y = boxY + 130;
  const lineHeight = 22;
  
  for (let word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(`"${line.trim()}"`, canvasWidth / 2, y);
      line = word + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    ctx.fillText(`"${line.trim()}"`, canvasWidth / 2, y);
  }
  
  ctx.restore();
};

export { HOUSE_COLORS, HOUSE_ZONES, PARCHMENT_COLORS };
