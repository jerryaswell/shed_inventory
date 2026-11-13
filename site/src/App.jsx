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
import { Search } from 'lucide-react';
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

  const onTry = (sentence) => {
    setResult(null);
    hear(sentence);
  };

  const onPick = (itemId) => {
    const item = itemsRef.current.find((i) => i.id === itemId);
    answer(resolve(item, result.pending.action, result.pending.quantity, result.heard));
  };

  const onUndo = () => {
    setItems((cur) => applyChange(cur, undo.change));
    setUndo(null);
    setResult({ action: 'undone', heard: null, reply: 'Undone. The count is back to what it was.' });
  };

  // The clock ticks every half second, so it can trail the moment Undo was set.
  const undoLeft = undo ? Math.min(UNDO_MS / 1000, Math.max(0, Math.ceil((undo.until - now) / 1000))) : 0;
  const busy = phase === 'listening' || phase === 'thinking';
  const sleeping = !sheetOpen && !busy && now - lastTouch > IDLE_MS;

  return (
    <div className="kiosk" onPointerDownCapture={() => setLastTouch(clock())}>
      <StatusBar status={status} now={now} />
      <p className="banner">Mockup: sample inventory, nothing is saved, and the mic plays a script.</p>

      <main className="stage">
        <MicButton phase={phase} onTap={onMic} compact={result != null} />
        {result ? (
          <Reply result={result} items={items} undoLeft={undoLeft} onUndo={onUndo} onPick={onPick} />
        ) : (
          phase === 'idle' && (
            <section className="try">
              <p className="try-label">Try saying</p>
              <div className="try-list">
                {demoScript.map((s) => (
                  <button type="button" key={s} className="chip" onClick={() => onTry(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </section>
          )
        )}
      </main>

      <footer className="foot">
        <button type="button" className="search-btn" onClick={() => setSheetOpen(true)}>
          <Search size={24} aria-hidden="true" />
          Search or browse
        </button>
      </footer>

      {sheetOpen && (
        <SearchSheet
          items={items}
          onClose={() => setSheetOpen(false)}
          onChange={(change) => setItems((cur) => applyChange(cur, change))}
        />
      )}
      {sleeping && <Screensaver now={now} onWake={() => setLastTouch(clock())} />}
    </div>
  );
}
