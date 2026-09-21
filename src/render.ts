// Canvas 2D drawing: board, ghost, next/hold previews, and gentle particles.
import { COLS, ROWS, shapeOf, type Cell, type Game, type PieceType } from './engine';
import type { Palette } from './theme';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawBlock(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string, glow: number, alpha = 1) {
  const pad = Math.max(1, size * 0.06);
  const s = size - pad * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  const g = ctx.createLinearGradient(px, py, px, py + size);
  g.addColorStop(0, color);
  g.addColorStop(1, shade(color, -0.22));
  ctx.fillStyle = g;
  roundRect(ctx, px + pad, py + pad, s, s, size * 0.24);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  roundRect(ctx, px + pad + s * 0.14, py + pad + s * 0.1, s * 0.72, s * 0.22, size * 0.1);
  ctx.fill();
  ctx.restore();
}

export function drawBoard(ctx: CanvasRenderingContext2D, game: Game, cell: number, pal: Palette, showGhost = true) {
  const w = COLS * cell;
  const h = ROWS * cell;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = pal.boardBg;
  roundRect(ctx, 0, 0, w, h, cell * 0.3);
  ctx.fill();

  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, h);
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(w, y * cell + 0.5);
  }
  ctx.stroke();

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c: Cell = game.board[y][x];
      if (c) drawBlock(ctx, x * cell, y * cell, cell, pal.pieces[c], pal.glow * 0.5);
    }
  }
  if (game.over) return;

  const p = game.piece;
  const m = shapeOf(p.type, p.rot);
  if (showGhost) {
    const gy = game.ghostY();
    if (gy !== p.y) {
      ctx.save();
      ctx.strokeStyle = pal.ghost;
      ctx.lineWidth = Math.max(1.5, cell * 0.07);
      for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[y].length; x++) {
          if (!m[y][x] || gy + y < 0) continue;
          roundRect(ctx, (p.x + x) * cell + 3, (gy + y) * cell + 3, cell - 6, cell - 6, cell * 0.2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (!m[y][x] || p.y + y < 0) continue;
      drawBlock(ctx, (p.x + x) * cell, (p.y + y) * cell, cell, pal.pieces[p.type], pal.glow);
    }
  }
}

/** Draw a single piece centred in a small canvas (hold / next). */
export function drawMini(canvas: HTMLCanvasElement, type: PieceType | null, size: number, pal: Palette, dim = false) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = size * 4;
  const cssH = size * 3;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!type) return;
  const m = shapeOf(type);
  // trim to the occupied rows/cols so every piece centres nicely
  const rows = m.map((r, i) => (r.some(Boolean) ? i : -1)).filter((i) => i >= 0);
  const cols = m[0].map((_, i) => (m.some((r) => r[i]) ? i : -1)).filter((i) => i >= 0);
  const pw = (cols[cols.length - 1] - cols[0] + 1) * size;
  const ph = (rows[rows.length - 1] - rows[0] + 1) * size;
  const ox = (cssW - pw) / 2 - cols[0] * size;
  const oy = (cssH - ph) / 2 - rows[0] * size;
  for (const y of rows) {
    for (const x of cols) {
      if (m[y][x]) drawBlock(ctx, ox + x * size, oy + y * size, size, pal.pieces[type], pal.glow * 0.5, dim ? 0.35 : 1);
    }
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  heart: boolean;
}

export class Particles {
  private list: Particle[] = [];

  get active() {
    return this.list.length > 0;
  }

  burst(rows: number[], cell: number, pal: Palette, hearts: boolean, perRow: number) {
    for (const row of rows) {
      for (let i = 0; i < perRow; i++) {
        const heart = hearts && Math.random() < 0.45;
        this.list.push({
          x: Math.random() * COLS * cell,
          y: (row + 0.5) * cell,
          vx: (Math.random() - 0.5) * cell * 3,
          vy: -cell * (1 + Math.random() * 3),
          life: 0,
          max: 0.9 + Math.random() * 0.8,
          size: cell * (heart ? 0.5 + Math.random() * 0.4 : 0.12 + Math.random() * 0.18),
          color: pal.particles[Math.floor(Math.random() * pal.particles.length)],
          heart,
        });
      }
    }
  }

  update(dt: number) {
    for (const p of this.list) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 100 * dt; // gentle gravity
      p.vx *= 0.99;
    }
    this.list = this.list.filter((p) => p.life < p.max);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      if (p.heart) {
        ctx.font = `${p.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♥', p.x, p.y);
      } else {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 3);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
  }
}
