/**
 * The microphone is simulated until the voice route exists. Every label
 * identifies the sample flow even when the disclosure is off screen.
 */
import { Mic, ArrowRight, Loader } from 'lucide-react';

const COPY = {
  idle: 'Try a sample',
  answer: 'Next sample',
  listening: 'Run sample now',
  thinking: 'Finding sample items…'
};

export default function MicButton({ phase, onTap, compact = false }) {
  const Icon = phase === 'listening' ? ArrowRight : phase === 'thinking' ? Loader : Mic;
  return (
    <div className={`mic-wrap${compact ? ' mic-wrap-compact' : ''}`}>
      <button
        type="button"
        className={`mic mic-${phase}${compact ? ' mic-compact' : ''}`}
        onClick={onTap}
        disabled={phase === 'thinking'}
        aria-label={COPY[phase]}
      >
        <Icon size={compact ? 28 : 52} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className="mic-copy" role="status">
        <p className="mic-label">{COPY[phase]}</p>
        {phase === 'listening' && <p className="mic-hint">Preparing a scripted request…</p>}
      </div>
    </div>
  );
}
