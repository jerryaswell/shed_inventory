/**
 * The idle screen. The Note 10's OLED panel burns in a static image, so after
 * a minute and a half untouched the kiosk goes almost black, with a dim clock
 * that moves a little every minute. Any tap or key wakes it, and only wakes
 * it: the kiosk gives it focus and makes the page under it inert, and a key
 * press is consumed here. A key wakes it on release, not on press: waking
 * hands focus back to the page, and a press that is still going on (Enter's
 * keypress, Space's release) would then land on the control it went to.
 * Its clock reads the time once a minute, on the minute, as the status bar's.
 */
import { useNow } from './useNow.js';

export default function Screensaver({ clock = Date.now, onWake, buttonRef }) {
  const now = useNow(60_000, clock);
  const minute = Math.floor(now / 60000);
  const x = ((minute * 37) % 60) - 30;
  const y = ((minute * 53) % 120) - 60;
  const time = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <button
      type="button"
      className="saver"
      ref={buttonRef}
      onClick={onWake}
      onKeyDown={(event) => event.preventDefault()}
      onKeyUp={(event) => {
        event.preventDefault();
        onWake();
      }}
      aria-label="Wake the screen"
    >
      <span className="saver-clock" style={{ transform: `translate(${x}px, ${y}px)` }}>
        {time}
        <span className="saver-hint">Tap anywhere</span>
      </span>
    </button>
  );
}
