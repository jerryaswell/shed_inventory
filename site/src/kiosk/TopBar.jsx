import { Home, Pause, Play } from 'lucide-react';

export default function TopBar({ onHome, homeRef, motion }) {
  const MotionIcon = motion.userPaused ? Play : Pause;
  return (
    <header className="top-bar" aria-label="App controls">
      <button type="button" className="top-control home-button" onClick={onHome} ref={homeRef}>
        <Home size={18} aria-hidden="true" />
        <span>Home</span>
      </button>
      <button
        type="button"
        className="top-control motion-toggle"
        onClick={motion.togglePause}
        disabled={motion.reducedMotion}
        aria-label={motion.reducedMotion ? 'Motion off: device prefers reduced motion' : undefined}
        title={motion.reducedMotion ? 'Your device prefers reduced motion' : undefined}
      >
        <MotionIcon size={18} aria-hidden="true" />
        <span>{motion.reducedMotion ? 'Motion off' : motion.userPaused ? 'Resume motion' : 'Pause motion'}</span>
      </button>
    </header>
  );
}
