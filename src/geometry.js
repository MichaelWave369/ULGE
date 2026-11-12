import { clamp01 } from "./audio.js";

/**
 * Visual-art projection of a 7-D descriptor vector into a deformable toroidal
 * wireframe. This is NOT a discovered acoustic manifold or intrinsic geometry.
 */
export function pointOnSurface(features, u, v, time = 0) {
  const brightness = clamp01(features.brightness);
  const spread = clamp01(features.spread);
  const low = clamp01(features.low);
  const high = clamp01(features.high);
  const texture = clamp01(features.texture);
  const dynamics = clamp01(features.dynamics);
  const crossings = clamp01(features.crossings);
  const rings = 4 + 10 * high;
  const lobes = 2 + 9 * crossings;
  const swirl = 0.18 + texture * 0.95;
  const wave = Math.sin(u * rings + v * 2 + time * 0.72) * (0.07 + spread * 0.26);
  const perturb = Math.cos(v * lobes - u * 1.5 + time * 0.35) * (0.04 + dynamics * 0.18);
  const r = 0.42 + brightness * 0.18 + wave + perturb;
  const R = 1.22 + low * 0.44 + 0.10 * Math.sin(v + u * swirl * 3);
  return [
    (R + r * Math.cos(v)) * Math.cos(u),
    (R + r * Math.cos(v)) * Math.sin(u),
    r * Math.sin(v) + 0.14 * Math.sin(u * (2 + spread * 7) + time) * dynamics
  ];
}

function project(point, yaw, pitch, scale, cx, cy) {
  const [x, y, z] = point;
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const cb = Math.cos(pitch), sb = Math.sin(pitch);
  const x1 = x * ca - z * sa;
  const z1 = x * sa + z * ca;
  const y1 = y * cb - z1 * sb;
  const z2 = y * sb + z1 * cb;
  const perspective = 4.6 / (4.6 + z2);
  return [cx + x1 * scale * perspective, cy + y1 * scale * perspective, z2];
}

function traceSurface(ctx, features, config) {
  const { time, yaw, pitch, scale, cx, cy, tone, opacity = 1 } = config;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const rings = 20, longitudinal = 18, resolution = 140;
  for (let mode = 0; mode < 2; mode++) {
    const lines = mode === 0 ? rings : longitudinal;
    for (let a = 0; a < lines; a++) {
      const linePoints = [];
      let depth = 0;
      for (let s = 0; s <= resolution; s++) {
        const u = mode === 0 ? (s / resolution) * Math.PI * 2
          : (a / lines) * Math.PI * 2;
        const v = mode === 0 ? (a / lines) * Math.PI * 2
          : (s / resolution) * Math.PI * 2;
        const p = project(pointOnSurface(features, u, v, time), yaw, pitch, scale, cx, cy);
        linePoints.push(p);
        depth += p[2];
      }
      depth /= linePoints.length;
      const alpha = Math.min(0.84, (0.17 + (1.5 - depth) * 0.09) * opacity);
      ctx.beginPath();
      ctx.moveTo(linePoints[0][0], linePoints[0][1]);
      for (let s = 1; s < linePoints.length; s++) ctx.lineTo(linePoints[s][0], linePoints[s][1]);
      ctx.closePath();
      ctx.strokeStyle = "rgba(" + tone.join(",") + "," + Math.max(0.06, alpha) + ")";
      ctx.lineWidth = mode === 0 ? 1.1 : 0.78;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function renderScene(ctx, width, height, first, second, opts = {}) {
  const time = opts.time || 0;
  const yaw = opts.yaw ?? -0.15;
  const pitch = opts.pitch ?? 0.3;
  ctx.clearRect(0, 0, width, height);
  const background = ctx.createRadialGradient(width * 0.5, height * 0.53, 15, width * 0.5, height * 0.5, width * 0.65);
  background.addColorStop(0, "#101e32");
  background.addColorStop(0.44, "#0a1424");
  background.addColorStop(1, "#080d1a");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  const unit = Math.min(width, height) * 0.11;
  ctx.strokeStyle = "rgba(129,157,195,0.07)";
  ctx.lineWidth = 1;
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath();
    ctx.moveTo(width / 2 + i * unit, 0);
    ctx.lineTo(width / 2 + i * unit, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, height / 2 + i * unit);
    ctx.lineTo(width, height / 2 + i * unit);
    ctx.stroke();
  }
  for (let i = 0; i < 42; i++) {
    const px = ((i * 73.19) % 100) / 100 * width;
    const py = ((i * 37.71) % 100) / 100 * height;
    ctx.fillStyle = "rgba(192,216,252," + (0.07 + (i % 4) * 0.04) + ")";
    ctx.fillRect(px, py, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
  }
  ctx.strokeStyle = "rgba(129,214,243,0.12)";
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, width * 0.34, height * 0.29, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const scale = Math.min(width * 0.215, height * 0.29);
  const base = { time, yaw, pitch, scale, cx: width / 2, cy: height / 2 };
  if (first?.features) traceSurface(ctx, first.features, { ...base, tone: [67, 221, 243], opacity: 1 });
  if (second?.features && opts.overlay) {
    traceSurface(ctx, second.features, { ...base, time: time + 1.2, tone: [191, 137, 255], opacity: 0.92 });
  }
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(238,252,255,0.85)";
  ctx.fill();
}
