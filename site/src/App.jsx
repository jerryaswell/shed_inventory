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
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Search, Undo2 } from 'lucide-react';
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
import { useNow } from './kiosk/useNow.js';
import AmbientBackground from './kiosk/AmbientBackground.jsx';
import { useAmbientMotion } from './kiosk/useAmbientMotion.js';

const UNDO_MS = 10_000;
const IDLE_MS = 90_000;
// Read in handlers only, never during render.
const wallClock = () => Date.now();

export default function App({
  loadConfigImpl = loadConfig,
  checkHealthImpl = checkHealth,
  listenMs = 1800,
  thinkMs = 700,
  clock = wallClock
}) {
  const now = useNow(500, clock);
  const [status, setStatus] = useState('checking');
  const [items, setItems] = useState(sampleInventory);
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [undo, setUndo] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastTouch, setLastTouch] = useState(clock);

  const itemsRef = useRef(items);
  const timer = useRef(null);
  const heardNext = useRef(null);
  const scriptAt = useRef(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // API connectivity is separate from the simulated inventory and microphone.
  useEffect(() => {
    let live = true;
    (async () => {
      const config = await loadConfigImpl();
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
      setItems((cur) => applyChange(cur, next.change));
      setUndo({ change: inverseOf(next.change, before), until: clock() + UNDO_MS });
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

  // The clock ticks every half second, so it can trail the moment Undo was set.
  const undoLeft = undo ? Math.min(UNDO_MS / 1000, Math.max(0, Math.ceil((undo.until - now) / 1000))) : 0;
  const busy = phase === 'listening' || phase === 'thinking';
  const sleeping = !sheetOpen && !busy && now - lastTouch > IDLE_MS;
  const motion = useAmbientMotion({ sleeping });
  const MotionIcon = motion.userPaused ? Play : Pause;

  return (
    <div className="kiosk" onPointerDownCapture={() => setLastTouch(clock())} onKeyDownCapture={() => setLastTouch(clock())}>
      <AmbientBackground paused={motion.paused} sleeping={sleeping} />
      <div className="kiosk-content">
        <StatusBar status={status} now={now} controls={
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
          <MicButton phase={phase} onTap={onMic} compact={result != null} />
          {result ? (
            <Reply result={result} items={items} onPick={onPick} />
          ) : (
            phase === 'idle' && (
              <section className="example" aria-label="Sample request">
                <p className="example-label">First sample</p>
                <p className="example-text">“{demoScript[0]}”</p>
              </section>
            )
          )}
        </main>
      </div>

      <footer className="foot">
        {undoLeft > 0 && !sheetOpen && (
          <button type="button" className="undo" onClick={onUndo}>
            <Undo2 size={24} aria-hidden="true" />
            Undo
            <span className="undo-left" aria-hidden="true">{undoLeft}s</span>
          </button>
        )}
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
          undoLeft={undoLeft}
          onUndo={onUndo}
        />
      )}
      {sleeping && <Screensaver now={now} onWake={() => setLastTouch(clock())} />}
    </div>
  );
}
