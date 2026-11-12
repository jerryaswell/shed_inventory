/**
 * The one big control. Tap to start listening, tap again to stop early. It
 * shrinks while an answer is showing, so the answer fits without scrolling.
 */
import { Mic, Square, Loader } from 'lucide-react';

const COPY = {
  idle: 'Tap to speak',
  answer: 'Tap to speak',
  listening: 'Listening… tap to stop',
  thinking: 'Looking…'
};

export default function MicButton({ phase, onTap, compact = false }) {
  const Icon = phase === 'listening' ? Square : phase === 'thinking' ? Loader : Mic;
  return (
    <div className="mic-wrap">
      <button
        type="button"
        className={`mic mic-${phase}${compact ? ' mic-compact' : ''}`}
        onClick={onTap}
        disabled={phase === 'thinking'}
        aria-label={COPY[phase]}
      >
        <Icon size={compact ? 64 : 96} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <p className="mic-label">{COPY[phase]}</p>
    </div>
  );
}
