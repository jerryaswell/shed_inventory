/**
 * The idle lock screen. After a minute and a half untouched, the controls
 * give way to the shared ambient background and a slowly drifting wake hint.
 * Any tap or key only wakes the screen. The kiosk gives the saver
 * focus and makes the page underneath inert. Keys are consumed and wake on
 * release: handing focus back during Enter's keypress or Space's release
 * would otherwise activate an underlying control.
 */
export default function Screensaver({ onWake, buttonRef, paused = false }) {
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
      <span className="saver-content">
        <span className="saver-hint">Tap anywhere</span>
      </span>
    </button>
  );
}
