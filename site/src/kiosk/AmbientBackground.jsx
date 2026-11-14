import './AmbientBackground.css';

/**
 * Mount inside a positioned parent with isolation: isolate. Its negative
 * stacking level then stays above the parent background and below controls.
 * Share this mounted layer between the kiosk and its lock screen so the
 * composition keeps moving continuously when the controls are hidden.
 */
export default function AmbientBackground({ paused = false }) {
  return (
    <div
      className="ambient-background"
      data-paused={paused}
      aria-hidden="true"
    >
      <div className="ambient-field ambient-field-blue" />
      <div className="ambient-field ambient-field-indigo" />
      <div className="ambient-field ambient-field-teal" />
    </div>
  );
}
