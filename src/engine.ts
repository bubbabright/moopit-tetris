// Pure game logic: no DOM, no audio. Emits events the UI reacts to.

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
export const COLS = 10;
export const ROWS = 20;

type Matrix = number[][];

const BASE: Record<PieceType, Matrix> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};

// SRS wall kicks, written with y up (as in the guideline); flipped when applied.
const KICKS_JLSTZ: Record<string, [number, number][]> = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I: Record<string, [number, number][]> = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

function rotateCW(m: Matrix): Matrix {
  const n = m.length;
  return m.map((_, y) => m[0].map((_, x) => m[n - 1 - x][y]));
}

const SHAPES: Record<PieceType, Matrix[]> = (() => {
  const out = {} as Record<PieceType, Matrix[]>;
  for (const t of PIECE_TYPES) {
    const states = [BASE[t]];
    for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1]));
    out[t] = states;
  }
  return out;
})();

export function shapeOf(type: PieceType, rot = 0): Matrix {
  return SHAPES[type][rot];
}

export interface Piece {
  type: PieceType;
  rot: number;
  x: number;
  y: number;
}

export type Cell = PieceType | null;

export type GameEvent =
  | { kind: 'move' }
  | { kind: 'rotate' }
  | { kind: 'hold' }
  | { kind: 'softdrop' }
  | { kind: 'harddrop' }
  | { kind: 'lock' }
  | { kind: 'clear'; rows: number[]; colors: Cell[][]; count: number }
  | { kind: 'levelup'; level: number }
  | { kind: 'gameover' };

const LOCK_DELAY = 0.5; // seconds
const MAX_LOCK_RESETS = 15;
const SOFT_DROP_FACTOR = 10; // holding Down falls this many times faster
const HOLD_TO_DROP = 1.0; // seconds of holding Down before the piece drops instantly
const DAS = 0.16;
const ARR = 0.04;
const LINE_POINTS = [0, 100, 300, 500, 800];

export class Game {
  board: Cell[][] = [];
  piece!: Piece;
  hold: PieceType | null = null;
  canHold = true;
  holdEnabled = true; // the UI turns this off when the Hold setting is off
  queue: PieceType[] = [];
  score = 0;
  lines = 0;
  level = 1;
  over = false;
  onEvent: (e: GameEvent) => void;

  private bag: PieceType[] = [];
  private fall = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private held = { left: false, right: false, down: false };
  private dasTimer = 0;
  private dasDir = 0;
  private downTime = 0; // how long Down has been held
  private downLatched = false; // true after a hold-to-drop, until Down is released

  constructor(onEvent: (e: GameEvent) => void) {
    this.onEvent = onEvent;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.over = false;
    this.bag = [];
    this.queue = [];
    this.releaseAll();
    while (this.queue.length < 6) this.queue.push(this.drawFromBag());
    this.spawn(this.queue.shift()!);
    this.queue.push(this.drawFromBag());
  }

  private drawFromBag(): PieceType {
    if (this.bag.length === 0) {
      this.bag = [...PIECE_TYPES];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  private spawn(type: PieceType) {
    const w = shapeOf(type).length;
    this.piece = { type, rot: 0, x: Math.floor((COLS - w) / 2), y: type === 'I' ? -1 : 0 };
    this.fall = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (this.collides(this.piece)) {
      this.over = true;
      this.onEvent({ kind: 'gameover' });
    }
  }

  private collides(p: Piece, dx = 0, dy = 0, rot = p.rot): boolean {
    const m = shapeOf(p.type, rot);
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const bx = p.x + x + dx;
        const by = p.y + y + dy;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && this.board[by][bx]) return true;
      }
    }
    return false;
  }

  private grounded(): boolean {
    return this.collides(this.piece, 0, 1);
  }

  private touchLockReset() {
    if (this.grounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  ghostY(): number {
    let dy = 0;
    while (!this.collides(this.piece, 0, dy + 1)) dy++;
    return this.piece.y + dy;
  }

  move(dx: number): boolean {
    if (this.over || this.collides(this.piece, dx, 0)) return false;
    this.piece.x += dx;
    this.touchLockReset();
    this.onEvent({ kind: 'move' });
    return true;
  }

  rotate(dir: 1 | -1): boolean {
    if (this.over || this.piece.type === 'O') return false;
    const from = this.piece.rot;
    const to = (from + dir + 4) % 4;
    const table = this.piece.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    for (const [kx, ky] of table[`${from}${to}`]) {
      if (!this.collides(this.piece, kx, -ky, to)) {
        this.piece.x += kx;
        this.piece.y += -ky;
        this.piece.rot = to;
        this.touchLockReset();
        this.onEvent({ kind: 'rotate' });
        return true;
      }
    }
    return false;
  }

  softDrop(): boolean {
    if (this.over || this.collides(this.piece, 0, 1)) return false;
    this.piece.y++;
    this.score += 1;
    this.fall = 0;
    this.onEvent({ kind: 'softdrop' });
    return true;
  }

  hardDrop() {
    if (this.over) return;
    const gy = this.ghostY();
    this.score += (gy - this.piece.y) * 2;
    this.piece.y = gy;
    this.onEvent({ kind: 'harddrop' });
    this.lock();
  }

  holdPiece() {
    if (this.over || !this.canHold || !this.holdEnabled) return;
    const cur = this.piece.type;
    if (this.hold) {
      const swap = this.hold;
      this.hold = cur;
      this.spawn(swap);
    } else {
      this.hold = cur;
      this.spawn(this.queue.shift()!);
      this.queue.push(this.drawFromBag());
    }
    this.canHold = false;
    this.onEvent({ kind: 'hold' });
  }

  private lock() {
    const m = shapeOf(this.piece.type, this.piece.rot);
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const by = this.piece.y + y;
        const bx = this.piece.x + x;
        if (by < 0) {
          this.over = true;
          this.onEvent({ kind: 'gameover' });
          return;
        }
        this.board[by][bx] = this.piece.type;
      }
    }
    this.onEvent({ kind: 'lock' });
    this.clearLines();
    this.canHold = true;
    this.spawn(this.queue.shift()!);
    this.queue.push(this.drawFromBag());
  }

  private clearLines() {
    const rows: number[] = [];
    for (let y = 0; y < ROWS; y++) if (this.board[y].every(Boolean)) rows.push(y);
    if (!rows.length) return;
    const colors = rows.map((y) => [...this.board[y]]);
    this.board = this.board.filter((_, y) => !rows.includes(y));
    while (this.board.length < ROWS) this.board.unshift(Array<Cell>(COLS).fill(null));
    const prevLevel = this.level;
    this.score += LINE_POINTS[rows.length] * this.level;
    this.lines += rows.length;
    this.level = Math.floor(this.lines / 10) + 1;
    this.onEvent({ kind: 'clear', rows, colors, count: rows.length });
    if (this.level > prevLevel) this.onEvent({ kind: 'levelup', level: this.level });
  }

  /** Seconds a piece takes to fall one row (guideline curve, floored so it never hits 0). */
  gravity(): number {
    return Math.max(0.02, Math.pow(Math.max(0.05, 0.8 - (this.level - 1) * 0.007), this.level - 1));
  }

  setHeld(key: 'left' | 'right' | 'down', down: boolean) {
    if (this.held[key] === down) return;
    this.held[key] = down;
    if (key === 'down') {
      this.downTime = 0;
      this.downLatched = false;
      return;
    }
    const dir = key === 'left' ? -1 : 1;
    if (down) {
      this.dasDir = dir;
      this.dasTimer = -DAS;
      this.move(dir);
    } else if (this.dasDir === dir) {
      const other = key === 'left' ? this.held.right : this.held.left;
      this.dasDir = other ? -dir : 0;
      this.dasTimer = -DAS;
    }
  }

  releaseAll() {
    this.held = { left: false, right: false, down: false };
    this.dasDir = 0;
    this.downTime = 0;
    this.downLatched = false;
  }

  update(dt: number) {
    if (this.over) return;
    if (this.dasDir !== 0) {
      this.dasTimer += dt;
      while (this.dasTimer >= ARR) {
        this.dasTimer -= ARR;
        if (!this.move(this.dasDir)) break;
      }
    }
    const soft = this.held.down && !this.downLatched;
    if (soft) {
      this.downTime += dt;
      if (this.downTime >= HOLD_TO_DROP) {
        this.downLatched = true; // one instant drop per press, then wait for release
        this.hardDrop();
        return;
      }
    }
    if (this.grounded()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lock();
      return;
    }
    const g = soft ? Math.min(this.gravity(), Math.max(0.04, this.gravity() / SOFT_DROP_FACTOR)) : this.gravity();
    this.fall += dt;
    while (this.fall >= g && !this.grounded()) {
      this.fall -= g;
      this.piece.y++;
      if (soft) this.score += 1;
    }
  }
}
