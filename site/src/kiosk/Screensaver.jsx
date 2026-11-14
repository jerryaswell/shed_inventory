/**
 * The idle lock screen. After a minute and a half untouched, the controls
 * give way to the shared ambient background and a slowly drifting clock and
 * wake hint. Any tap or key only wakes the screen. The kiosk gives the saver
 * focus and makes the page underneath inert. Keys are consumed and wake on
 * release: handing focus back during Enter's keypress or Space's release
 * would otherwise activate an underlying control.
 * Its clock reads the time once a minute, on the minute, as the status bar's.
 */
import { useNow } from './useNow.js';

export default function Screensaver({ clock = Date.now, onWake, buttonRef, paused = false }) {
  const now = useNow(60_000, clock);
  const time = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <button
      type="button"
      className="saver"
      data-paused={paused}
      ref={buttonRef}
      onClick={onWake}
      onKeyDown={(event) => event.preventDefault()}
      onKeyUp={(event) => {
        event.preventDefault();
        onWake();
      }}
      aria-label="Wake the screen"
    >
      <span className="saver-clock">
        {time}
        <span className="saver-hint">Tap anywhere</span>
      </span>
    </button>
  );
}
