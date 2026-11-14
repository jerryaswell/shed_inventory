import './AmbientBackground.css';

/**
 * Mount inside a positioned parent with isolation: isolate. Its negative
 * stacking level then stays above the parent background and below controls.
 * Pass the effective paused state from useAmbientMotion and the kiosk's real
 * sleeping state; sleep also hides every colour field behind the black saver.
 */
export default function AmbientBackground({ paused = false, sleeping = false }) {
  return (
    <div
      className="ambient-background"
      data-paused={paused || sleeping}
      data-sleeping={sleeping}
      aria-hidden="true"
    >
      <div className="ambient-field ambient-field-blue" />
      <div className="ambient-field ambient-field-indigo" />
      <div className="ambient-field ambient-field-teal" />
    </div>
  );
}
