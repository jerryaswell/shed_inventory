/**
 * The kiosk: one big mic button, the answer under it, a way to search by
 * hand, and a screensaver.
 *
 * This is the mockup. The mic records nothing: each tap "hears" the next line
 * of a script (mock/sampleInventory.js), and the stand-in assistant
 * (mock/assistant.js) answers against a sample inventory held in memory. The
 * flow, the screens and the shapes are the real ones; swapping the stand-in
 * for the backend's voice route is what makes it work.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pause, Play, Search } from 'lucide-react';
import { loadConfig } from './core/config.js';
import { checkHealth } from './core/api.js';
import { applyChange, inverseOf } from './core/inventory.js';
import { interpret, resolve } from './mock/assistant.js';
import { demoScript, sampleInventory } from './mock/sampleInventory.js';
import StatusBar from './kiosk/StatusBar.jsx';
import MicButton from './kiosk/MicButton.jsx';
import Reply from './kiosk/Reply.jsx';
import SearchSheet from './kiosk/SearchSheet.jsx';
import Screensaver from './kiosk/Screensaver.jsx';
import UndoButton, { UNDO_MS } from './kiosk/UndoButton.jsx';
import AmbientBackground from './kiosk/AmbientBackground.jsx';
import { useAmbientMotion } from './kiosk/useAmbientMotion.js';
import { useFocusRescue } from './kiosk/useFocusRescue.js';

const IDLE_MS = 90_000;
// Read in handlers only, never during render.
const wallClock = () => Date.now();

/**
 * Calls `onDue` once `clock` has passed `at`, or never while `at` is null. One
 * timeout, not a tick. A timer can run late, or not at all while the page is
 * hidden, so the clock is read again when it fires and when the page is shown.
 */
function useDeadline(at, clock, onDue) {
  const due = useRef(onDue);
  useEffect(() => {
    due.current = onDue;
  });
  useEffect(() => {
    if (at == null) return;
    let id;
    const check = () => {
      clearTimeout(id);
      const left = at - clock();
      if (left < 0) due.current();
      else id = setTimeout(check, left + 1);
    };
    const onVisibility = () => document.hidden || check();
    check();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [at, clock]);
}

export default function App({
  loadConfigImpl = loadConfig,
  checkHealthImpl = checkHealth,
  listenMs = 1800,
  thinkMs = 700,
  clock = wallClock
}) {
  const [status, setStatus] = useState('checking');
  const [items, setItems] = useState(sampleInventory);
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [undo, setUndo] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastTouch, setLastTouch] = useState(clock);
  const [idle, setIdle] = useState(false);

  const itemsRef = useRef(items);
  const timer = useRef(null);
  const heardNext = useRef(null);
  const scriptAt = useRef(0);
  const micRef = useRef(null);
  const replyRef = useRef(null);
  const saverRef = useRef(null);
  const wakeFocus = useRef(null);
  const contentRef = useRef(null);
  // The answer, or the mic when there is none, scrolled into view in the
  // content. The browse dialog keeps its own, and the saver hands focus back
  // itself (below).
  const fallbackRef = result ? replyRef : micRef;
  const onFocus = useFocusRescue(fallbackRef, {
    ignore: (el) => el.closest('dialog, .saver') != null,
    scrollerRef: contentRef
  });

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // API connectivity is separate from the simulated inventory and microphone.
  useEffect(() => {
    let live = true;
    (async () => {
      let config;
      try {
        config = await loadConfigImpl();
      } catch {
        if (live) setStatus('unavailable');
        return;
      }
      if (!live) return;
      if (!config) {
        setStatus('sample');
        return;
      }
      const ok = await checkHealthImpl(config.apiBase);
      if (live) setStatus(ok ? 'online' : 'offline');
    })();
    return () => {
      live = false;
    };
  }, [loadConfigImpl, checkHealthImpl]);

  const answer = (next) => {
    if (next.change) {
      const before = itemsRef.current.find((i) => i.id === next.change.itemId);
      const inverse = inverseOf(next.change, before);
      setItems((cur) => applyChange(cur, next.change));
      // A change that moved nothing has nothing to undo.
      setUndo(inverse.delta === 0 ? null : { change: inverse, until: clock() + UNDO_MS });
    } else {
      setUndo(null);
    }
    setResult(next);
    setPhase('answer');
  };

  const hear = (sentence) => {
    clearTimeout(timer.current);
    setPhase('thinking');
    timer.current = setTimeout(() => answer(interpret(sentence, itemsRef.current)), thinkMs);
  };

  const onMic = () => {
    if (phase === 'thinking') return;
    if (phase === 'listening') {
      hear(heardNext.current);
      return;
    }
    heardNext.current = demoScript[scriptAt.current % demoScript.length];
    scriptAt.current += 1;
    setResult(null);
    setUndo(null);
    setPhase('listening');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => hear(heardNext.current), listenMs);
  };

  const onPick = (itemId) => {
    const item = itemsRef.current.find((i) => i.id === itemId);
    answer(resolve(item, result.pending.action, result.pending.quantity, result.heard));
  };

  const onManualChange = (change) => {
    // A pending scripted answer must not replace the manual change's Undo.
    clearTimeout(timer.current);
    const item = itemsRef.current.find((i) => i.id === change.itemId);
    answer({ action: 'adjust', heard: null, itemId: item.id, change, reply: `Updated ${item.name}.` });
  };

  const onUndo = () => {
    if (!undo || clock() >= undo.until) {
      setUndo(null);
      return;
    }
    setItems((cur) => applyChange(cur, undo.change));
    setUndo(null);
    setResult({ action: 'undone', heard: null, itemId: undo.change.itemId, reply: 'Last change undone.' });
  };

  const touch = () => {
    setLastTouch(clock());
    setIdle(false);
  };

  // Nothing ticks here: Undo goes at its deadline, and the kiosk sleeps once a
  // minute and a half has passed untouched and not busy. The clocks and the
  // Undo countdown keep their own time, so they rerender only themselves.
  useDeadline(undo?.until ?? null, clock, () => setUndo(null));
  const busy = phase === 'listening' || phase === 'thinking';
  useDeadline(busy || idle ? null : lastTouch + IDLE_MS, clock, () => setIdle(true));
  const sleeping = !busy && idle;
  const motion = useAmbientMotion({ sleeping });
  const MotionIcon = motion.userPaused ? Play : Pause;

  // While asleep the saver holds focus and everything under it is inert, so a
  // wake key lands on the saver, not on the control that had focus. On waking,
  // focus goes back to that control, or to the answer or the mic when nothing
  // had it. Both run after the commit that sets or clears `inert`. An open
  // browse sheet is suspended while asleep and puts back its own focus.
  useLayoutEffect(() => {
    if (sleeping) {
      const active = document.activeElement;
      if (sheetOpen) wakeFocus.current = null;
      else wakeFocus.current = active && active !== document.body ? active : (replyRef.current ?? micRef.current);
      saverRef.current?.focus({ preventScroll: true });
      return;
    }
    const control = wakeFocus.current;
    wakeFocus.current = null;
    if (control?.isConnected) control.focus({ preventScroll: true });
  }, [sleeping, sheetOpen]);

  return (
    <div
      className="kiosk"
      onPointerDownCapture={touch}
      // Asleep, a key is the saver's to handle: it wakes on the key's release.
      onKeyDownCapture={() => sleeping || touch()}
      onFocus={onFocus}
    >
      <AmbientBackground paused={motion.paused} sleeping={sleeping} />
      <div ref={contentRef} className="kiosk-content" inert={sleeping}>
        <StatusBar status={status} clock={clock} controls={
          <button
            type="button"
            className="motion-toggle"
            onClick={motion.togglePause}
            disabled={motion.reducedMotion}
            aria-label={motion.reducedMotion ? 'Motion off: device prefers reduced motion' : undefined}
            title={motion.reducedMotion ? 'Your device prefers reduced motion' : undefined}
          >
            <MotionIcon size={18} aria-hidden="true" />
            {motion.reducedMotion ? 'Motion off' : motion.userPaused ? 'Resume motion' : 'Pause motion'}
          </button>
        } />
        <p className="banner">Sample inventory. Nothing is saved. No audio is recorded.</p>

        <main className={`stage${result ? ' stage-result' : ''}`} aria-label="Inventory demo">
          <MicButton phase={phase} onTap={onMic} compact={result != null} buttonRef={micRef} />
          {/* Always mounted, so an answer is announced: a live region that
              arrives together with its content often is not. */}
          <div className="reply-region" aria-live="polite" aria-atomic="true">
            {result && <Reply result={result} items={items} onPick={onPick} sectionRef={replyRef} />}
          </div>
          {!result && phase === 'idle' && (
            <section className="example" aria-label="Sample request">
              <p className="example-label">First sample</p>
              <p className="example-text">“{demoScript[0]}”</p>
            </section>
          )}
        </main>
      </div>

      <footer className="foot" inert={sleeping}>
        {undo && !sheetOpen && <UndoButton until={undo.until} clock={clock} onUndo={onUndo} />}
        <button type="button" className="search-btn" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
          <Search size={24} aria-hidden="true" />
          Browse items
        </button>
      </footer>

      {sheetOpen && (
        <SearchSheet
          items={items}
          onClose={() => setSheetOpen(false)}
          onChange={onManualChange}
          notice={result?.action === 'undone' ? 'Last change undone.' : result?.change ? result.reply : null}
          undoUntil={undo?.until ?? null}
          clock={clock}
          onUndo={onUndo}
          suspended={sleeping}
        />
      )}
      {sleeping && <Screensaver clock={clock} onWake={touch} buttonRef={saverRef} />}
    </div>
  );
}
