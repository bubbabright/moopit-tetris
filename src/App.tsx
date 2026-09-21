import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { COLS, ROWS, Game, type GameEvent, type PieceType } from './engine';
import { audio, loadPrefs, savePrefs, type Prefs } from './audio';
import { drawBoard, drawMini, Particles } from './render';
import { paletteFor } from './theme';
import {
  END_NOTE, LEVEL_MESSAGES, LINE_MESSAGES, PAUSE_MESSAGE, RANDOM_MESSAGES,
  START_NOTE, TETRIS_MESSAGES, WATERMARK, pick,
} from './messages';

declare const __APP_VERSION__: string; // injected from package.json by vite.config.ts

type Screen = 'start' | 'play' | 'paused' | 'over';

interface Hud {
  score: number;
  level: number;
  lines: number;
  hold: PieceType | null;
  queue: PieceType[];
  canHold: boolean;
}

const snapshot = (g: Game): Hud => ({
  score: g.score,
  level: g.level,
  lines: g.lines,
  hold: g.hold,
  queue: g.queue.slice(0, 5),
  canHold: g.canHold,
});

const hudKey = (h: Hud) => `${h.score}|${h.level}|${h.lines}|${h.hold}|${h.queue.join('')}|${h.canHold}`;

const isCompact = () => window.matchMedia('(max-width: 720px)').matches;

/** Picks the biggest cell size that fits the window. */
function fitCell(compact: boolean): number {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const touch = compact || window.matchMedia('(pointer: coarse)').matches;
  const chrome = compact ? 44 + 76 + (touch ? 72 : 0) + 8 : 48 + (touch ? 72 : 0) + 56;
  const availH = vh - chrome;
  if (compact) return Math.max(14, Math.min(Math.floor((vw - 16) / COLS), Math.floor(availH / ROWS), 60));
  for (let c = 40; c >= 14; c--) {
    const mini = Math.round(c * 0.62);
    const side = mini * 4 + 36;
    if (COLS * c + side * 2 + 48 <= vw && ROWS * c <= availH) return c;
  }
  return 14;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [compact, setCompact] = useState(isCompact);
  const [cell, setCell] = useState(() => fitCell(isCompact()));
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);

  const pal = useMemo(() => paletteFor(prefs.theme, prefs.contrast), [prefs.theme, prefs.contrast]);
  const nextShown = Math.min(prefs.nextCount, compact ? 3 : 5);
  const mini = compact ? (window.innerWidth < 400 ? 10 : 12) : Math.round(cell * 0.62);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLCanvasElement>(null);
  const nextRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const particles = useRef(new Particles());
  const toastId = useRef(0);

  // Latest values, readable from the animation loop and event handlers.
  const live = useRef({ screen, cell, pal, hudKey: '' });
  live.current.screen = screen;
  live.current.cell = cell;
  live.current.pal = pal;

  const say = useCallback((text: string) => {
    toastId.current++;
    setToast({ text, id: toastId.current });
  }, []);

  const game = useRef<Game>(null as unknown as Game);
  if (!game.current) {
    game.current = new Game((e: GameEvent) => {
      switch (e.kind) {
        case 'move': audio.sfx('move'); break;
        case 'rotate': audio.sfx('rotate'); break;
        case 'hold': audio.sfx('hold'); break;
        case 'harddrop': audio.sfx('harddrop'); break;
        case 'lock': audio.sfx('lock'); break;
        case 'clear': {
          const { cell: c, pal: p } = live.current;
          if (e.count >= 4) {
            audio.sfx('tetris');
            particles.current.burst(e.rows, c, p, true, 26);
            say(pick(TETRIS_MESSAGES));
          } else {
            audio.sfx(e.count === 1 ? 'clear1' : e.count === 2 ? 'clear2' : 'clear3');
            particles.current.burst(e.rows, c, p, e.count >= 2, 10);
            say(pick(LINE_MESSAGES));
          }
          break;
        }
        case 'levelup':
          audio.sfx('levelup');
          window.setTimeout(() => say(pick(LEVEL_MESSAGES)), 900);
          break;
        case 'gameover':
          audio.sfx('gameover');
          setScreen('over');
          break;
      }
    });
  }
  const g = game.current;

  // ---- prefs: persist, apply audio + theme ----
  useEffect(() => {
    savePrefs(prefs);
    audio.setSettings({ music: prefs.music, sfx: prefs.sfx, musicVol: prefs.musicVol, sfxVol: prefs.sfxVol });
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.contrast = prefs.contrast ? 'high' : 'normal';
    g.holdEnabled = prefs.hold;
    const bar = prefs.theme === 'light' ? '#fbf3ee' : prefs.theme === 'indigo' ? '#0b0d26' : '#14101f';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar);
  }, [prefs, g]);

  // ---- responsive sizing: measure the real free space, don't guess from the window ----
  const stageRef = useRef<HTMLElement>(null);
  const measure = useCallback(() => {
    const st = stageRef.current;
    if (!st) return;
    const c = isCompact();
    setCompact(c);
    const H = st.clientHeight;
    const W = st.clientWidth;
    let next = 14;
    if (c) {
      const strip = Math.max(0, ...Array.from(st.querySelectorAll<HTMLElement>('.hold-panel, .stats-panel, .next-panel')).map((el) => el.offsetHeight));
      next = Math.max(14, Math.min(Math.floor((W - 16) / COLS), Math.floor((H - 24 - strip) / ROWS), 60));
    } else {
      for (let n = 40; n >= 14; n--) {
        const side = Math.round(n * 0.62) * 4 + 36;
        if (COLS * n + side * 2 + 48 <= W && ROWS * n <= H - 16) {
          next = n;
          break;
        }
      }
    }
    setCell(next);
  }, []);

  useLayoutEffect(() => {
    measure();
    const st = stageRef.current;
    const ro = st ? new ResizeObserver(measure) : null;
    if (st) ro?.observe(st);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [measure]);

  // panels appearing/disappearing changes how much height the board can have
  useLayoutEffect(() => {
    measure();
  }, [measure, prefs.hold, nextShown]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = COLS * cell * dpr;
    cv.height = ROWS * cell * dpr;
    cv.style.width = `${COLS * cell}px`;
    cv.style.height = `${ROWS * cell}px`;
  }, [cell]);

  // ---- main loop ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { screen: sc, cell: c, pal: p } = live.current;
      if (sc === 'play') g.update(dt);
      particles.current.update(dt);
      const cv = canvasRef.current;
      if (cv) {
        const ctx = cv.getContext('2d')!;
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawBoard(ctx, g, c, p, true);
        particles.current.draw(ctx);
      }
      const h = snapshot(g);
      const k = hudKey(h);
      if (k !== live.current.hudKey) {
        live.current.hudKey = k;
        setHud(h);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [g]);

  // ---- previews ----
  useEffect(() => {
    if (holdRef.current) drawMini(holdRef.current, hud?.hold ?? null, mini, pal, hud ? !hud.canHold : false);
    nextRefs.current.forEach((cv, i) => cv && drawMini(cv, hud?.queue[i] ?? null, mini, pal));
  }, [hud, mini, pal, prefs.hold, nextShown]);

  // ---- toast lifetime ----
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ---- gentle random encouragement ----
  useEffect(() => {
    if (screen !== 'play') return;
    const t = window.setInterval(() => say(pick(RANDOM_MESSAGES)), 32000);
    return () => window.clearInterval(t);
  }, [screen, say]);

  // ---- actions ----
  const start = useCallback(() => {
    audio.start();
    audio.setPaused(false);
    audio.sfx('click');
    g.reset();
    particles.current = new Particles();
    live.current.hudKey = '';
    setScreen('play');
    say(pick(RANDOM_MESSAGES));
  }, [g, say]);

  const pause = useCallback(() => {
    if (live.current.screen !== 'play') return;
    g.releaseAll();
    audio.setPaused(true);
    setScreen('paused');
  }, [g]);

  const resume = useCallback(() => {
    audio.setPaused(false);
    audio.sfx('click');
    setScreen('play');
  }, []);

  // pause automatically if the tab/app is hidden
  useEffect(() => {
    const onHide = () => document.hidden && pause();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [pause]);

  // ---- keyboard ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const sc = live.current.screen;
      const k = e.key;
      if (sc === 'start' || sc === 'over') {
        if (k === 'Enter' || k === ' ') { e.preventDefault(); start(); }
        return;
      }
      if (k === 'p' || k === 'P' || k === 'Escape') {
        e.preventDefault();
        if (sc === 'play') pause(); else resume();
        return;
      }
      if (k === 'm' || k === 'M') { setPrefs((p) => ({ ...p, music: !p.music })); return; }
      if (sc === 'paused') {
        if (k === 'Enter' || k === ' ') { e.preventDefault(); resume(); }
        return;
      }
      switch (k) {
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); g.setHeld('left', true); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); g.setHeld('right', true); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); g.setHeld('down', true); break;
        case 'ArrowUp': case 'x': case 'X': e.preventDefault(); if (!e.repeat) g.rotate(1); break;
        case 'z': case 'Z': e.preventDefault(); if (!e.repeat) g.rotate(-1); break;
        case ' ': e.preventDefault(); if (!e.repeat) g.hardDrop(); break;
        case 'c': case 'C': case 'Shift': e.preventDefault(); if (!e.repeat) g.holdPiece(); break;
      }
    };
    const up = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': g.setHeld('left', false); break;
        case 'ArrowRight': case 'd': case 'D': g.setHeld('right', false); break;
        case 'ArrowDown': case 's': case 'S': g.setHeld('down', false); break;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [g, start, pause, resume]);

  // best score
  useEffect(() => {
    if (screen === 'over' && g.score > prefs.best) setPrefs((p) => ({ ...p, best: g.score }));
  }, [screen, g, prefs.best]);

  const holdKey = (k: 'left' | 'right' | 'down') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); if (live.current.screen === 'play') g.setHeld(k, true); },
    onPointerUp: () => g.setHeld(k, false),
    onPointerLeave: () => g.setHeld(k, false),
    onPointerCancel: () => g.setHeld(k, false),
  });
  const tap = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); if (live.current.screen === 'play') fn(); },
  });

  const playing = screen === 'play' || screen === 'paused';
  const score = hud?.score ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-heart">♥</span> Moopit Tetris
        </div>
        <div className="top-actions">
          <button className="icon-btn" aria-label="Sound and display settings" onClick={() => setShowSettings(true)}>⚙</button>
          {playing && (
            <button className="icon-btn" aria-label={screen === 'play' ? 'Pause' : 'Resume'} onClick={screen === 'play' ? pause : resume}>
              {screen === 'play' ? '❚❚' : '▶'}
            </button>
          )}
        </div>
      </header>

      <main className="stage" ref={stageRef} data-compact={compact} data-hold={prefs.hold ? 'on' : 'off'} data-next={nextShown > 0 ? 'on' : 'off'}>
        {prefs.hold && (
          <section className="panel hold-panel" aria-label="Hold piece">
            <h2>Hold</h2>
            <canvas ref={holdRef} />
          </section>
        )}

        <section className="panel stats-panel" aria-label="Score">
          <dl>
            <div><dt>Score</dt><dd>{score.toLocaleString()}</dd></div>
            <div><dt>Level</dt><dd>{hud?.level ?? 1}</dd></div>
            <div><dt>Lines</dt><dd>{hud?.lines ?? 0}</dd></div>
          </dl>
        </section>

        <div className="board-wrap">
          <canvas ref={canvasRef} className="board" aria-label="Tetris board" />
          {toast && <div key={toast.id} className="toast" role="status">{toast.text}</div>}
        </div>

        {nextShown > 0 && (
          <section className="panel next-panel" aria-label="Next pieces">
            <h2>Next</h2>
            {Array.from({ length: nextShown }, (_, i) => (
              <canvas key={i} ref={(el) => { nextRefs.current[i] = el; }} />
            ))}
          </section>
        )}
      </main>

      <div className="touch" aria-label="Touch controls">
        <button className="tbtn" {...holdKey('left')} aria-label="Move left">◀</button>
        {prefs.hold && <button className="tbtn hold" {...tap(() => g.holdPiece())} aria-label="Hold piece">HOLD</button>}
        <button className="tbtn" {...holdKey('down')} aria-label="Soft drop">▼</button>
        <button className="tbtn accent" {...tap(() => g.hardDrop())} aria-label="Hard drop">⤓</button>
        <button className="tbtn accent" {...tap(() => g.rotate(1))} aria-label="Rotate">↻</button>
        <button className="tbtn" {...holdKey('right')} aria-label="Move right">▶</button>
      </div>

      <div className="watermark" aria-hidden="true">{WATERMARK}</div>

      {screen === 'start' && (
        <div className="overlay">
          <div className="card">
            <h1 className="title">Moopit Tetris</h1>
            <p className="subtitle">{START_NOTE.title}</p>
            <blockquote className="note">
              <p>{START_NOTE.body}</p>
              <footer>{START_NOTE.signoff}</footer>
            </blockquote>
            <button className="primary" onClick={start} autoFocus>Play</button>
            <Controls />
            <Settings prefs={prefs} setPrefs={setPrefs} maxNext={compact ? 3 : 5} />
          </div>
        </div>
      )}

      {screen === 'paused' && (
        <div className="overlay">
          <div className="card small">
            <h2 className="rest">{PAUSE_MESSAGE}</h2>
            <button className="primary" onClick={resume} autoFocus>Resume</button>
          </div>
        </div>
      )}

      {screen === 'over' && (
        <div className="overlay">
          <div className="card">
            <h2 className="title small-title">Beautifully played</h2>
            <p className="final">{score.toLocaleString()}</p>
            <p className="subtitle">{hud?.lines ?? 0} lines · level {hud?.level ?? 1} · best {prefs.best.toLocaleString()}</p>
            <blockquote className="note">
              <p>{END_NOTE.body}</p>
              <footer>{END_NOTE.signoff}</footer>
            </blockquote>
            <button className="primary" onClick={start} autoFocus>Play Again</button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="card small" onClick={(e) => e.stopPropagation()}>
            <Settings prefs={prefs} setPrefs={setPrefs} maxNext={compact ? 3 : 5} />
            <button className="primary" onClick={() => setShowSettings(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Controls() {
  return (
    <details className="controls">
      <summary>Controls</summary>
      <ul>
        <li><kbd>←</kbd> <kbd>→</kbd> move</li>
        <li><kbd>↑</kbd> / <kbd>X</kbd> rotate · <kbd>Z</kbd> rotate back</li>
        <li><kbd>↓</kbd> soft drop · <kbd>Space</kbd> hard drop</li>
        <li><kbd>C</kbd> / <kbd>Shift</kbd> hold</li>
        <li><kbd>P</kbd> / <kbd>Esc</kbd> pause · <kbd>M</kbd> music</li>
        <li>On a phone or tablet, use the buttons under the board.</li>
      </ul>
    </details>
  );
}

function Settings({ prefs, setPrefs, maxNext }: { prefs: Prefs; setPrefs: React.Dispatch<React.SetStateAction<Prefs>>; maxNext: number }) {
  const set = (p: Partial<Prefs>) => setPrefs((cur) => ({ ...cur, ...p }));
  return (
    <div className="settings">
      <label className="row">
        <span><input type="checkbox" checked={prefs.music} onChange={(e) => set({ music: e.target.checked })} /> Music</span>
        <input type="range" min={0} max={1} step={0.05} value={prefs.musicVol} onChange={(e) => set({ musicVol: +e.target.value })} aria-label="Music volume" />
      </label>
      <label className="row">
        <span><input type="checkbox" checked={prefs.sfx} onChange={(e) => set({ sfx: e.target.checked })} /> Sound effects</span>
        <input type="range" min={0} max={1} step={0.05} value={prefs.sfxVol} onChange={(e) => set({ sfxVol: +e.target.value })} aria-label="Effects volume" />
      </label>
      <label className="row">
        <span>Theme</span>
        <select value={prefs.theme} onChange={(e) => set({ theme: e.target.value as Prefs['theme'] })}>
          <option value="dark">Dark</option>
          <option value="indigo">Dark indigo</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label className="row">
        <span><input type="checkbox" checked={prefs.hold} onChange={(e) => set({ hold: e.target.checked })} /> Hold piece</span>
      </label>
      <label className="row">
        <span>Next pieces shown</span>
        <select value={Math.min(prefs.nextCount, maxNext)} onChange={(e) => set({ nextCount: +e.target.value })}>
          {Array.from({ length: maxNext + 1 }, (_, n) => (
            <option key={n} value={n}>{n === 0 ? 'None' : n}</option>
          ))}
        </select>
      </label>
      <label className="row">
        <span><input type="checkbox" checked={prefs.contrast} onChange={(e) => set({ contrast: e.target.checked })} /> High contrast</span>
      </label>
      <p className="version">Moopit Tetris v{__APP_VERSION__}</p>
    </div>
  );
}
