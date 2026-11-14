/**
 * The kiosk shell. API health is available before inventory and voice routes;
 * a successful liveness check must not enable either of those capabilities.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { loadConfig } from './core/config.js';
import { checkHealth } from './core/api.js';
import TopBar from './kiosk/TopBar.jsx';
import StatusBar from './kiosk/StatusBar.jsx';
import MicButton from './kiosk/MicButton.jsx';
import SearchSheet from './kiosk/SearchSheet.jsx';
import Screensaver from './kiosk/Screensaver.jsx';
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
  clock = wallClock
}) {
  const [status, setStatus] = useState('checking');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastTouch, setLastTouch] = useState(clock);
  const [sleeping, setSleeping] = useState(false);
  const homeRef = useRef(null);
  const saverRef = useRef(null);
  const wakeFocus = useRef(null);
  const contentRef = useRef(null);
  const homeRequested = useRef(false);
  const onFocus = useFocusRescue(homeRef, {
    ignore: (element) => element.closest('dialog, .saver') != null,
    scrollerRef: contentRef
  });

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
        setStatus('unconfigured');
        return;
      }
      let ok;
      try {
        ok = await checkHealthImpl(config.apiBase);
      } catch {
        ok = false;
      }
      if (live) setStatus(ok ? 'online' : 'offline');
    })();
    return () => {
      live = false;
    };
  }, [loadConfigImpl, checkHealthImpl]);

  const touch = () => {
    setLastTouch(clock());
    setSleeping(false);
  };

  const focusHome = () => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    homeRef.current?.focus({ preventScroll: true });
  };

  const onHome = () => {
    touch();
    if (sheetOpen) {
      homeRequested.current = true;
      setSheetOpen(false);
    } else {
      focusHome();
    }
  };

  // The dialog must release the top layer before Home can receive focus.
  useEffect(() => {
    if (!sheetOpen && homeRequested.current) {
      homeRequested.current = false;
      focusHome();
    }
  }, [sheetOpen]);

  useDeadline(sleeping ? null : lastTouch + IDLE_MS, clock, () => setSleeping(true));
  const motion = useAmbientMotion();

  // Keys wake on release while the rest of the page is inert. Browse keeps
  // its own suspended focus; otherwise the saver returns to the last control.
  useLayoutEffect(() => {
    if (sleeping) {
      const active = document.activeElement;
      if (sheetOpen) wakeFocus.current = null;
      else wakeFocus.current = active && active !== document.body ? active : homeRef.current;
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
      data-sleeping={sleeping}
      // Keep the saver mounted through pointer-up and the compatibility click;
      // waking on pointer-down would let that click activate a revealed control.
      onPointerDownCapture={() => sleeping || touch()}
      // Asleep, a key is the saver's to handle: it wakes on the key's release.
      onKeyDownCapture={() => sleeping || touch()}
      onFocus={onFocus}
    >
      <AmbientBackground paused={motion.paused} />
      <div ref={contentRef} className="kiosk-content" inert={sleeping}>
        <TopBar onHome={onHome} homeRef={homeRef} motion={motion} />
        <main className="stage" aria-label="Inventory">
          <MicButton />
        </main>
      </div>

      <footer className="foot" inert={sleeping}>
        <button type="button" className="search-btn" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
          <Search size={24} aria-hidden="true" />
          Browse items
        </button>
        <StatusBar status={status} />
      </footer>

      {sheetOpen && (
        <SearchSheet
          onClose={() => setSheetOpen(false)}
          onHome={onHome}
          suspended={sleeping}
          status={status}
          motion={motion}
        />
      )}
      {sleeping && <Screensaver onWake={touch} buttonRef={saverRef} paused={motion.paused} />}
    </div>
  );
}
