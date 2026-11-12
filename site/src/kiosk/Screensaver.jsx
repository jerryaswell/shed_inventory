/**
 * The idle screen. The Note 10's OLED panel burns in a static image, so after
 * a minute and a half untouched the kiosk goes almost black, with a dim clock
 * that moves a little every minute. Any tap wakes it, and only wakes it.
 */
export default function Screensaver({ now, onWake }) {
  const minute = Math.floor(now / 60000);
  const x = ((minute * 37) % 60) - 30;
  const y = ((minute * 53) % 120) - 60;
  const time = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <button type="button" className="saver" onClick={onWake} aria-label="Wake the screen">
      <span className="saver-clock" style={{ transform: `translate(${x}px, ${y}px)` }}>
        {time}
        <span className="saver-hint">Tap anywhere</span>
      </span>
    </button>
  );
}
