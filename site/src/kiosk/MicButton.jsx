/** A health response cannot enable voice before its authenticated route exists. */
import { Mic } from 'lucide-react';

export default function MicButton() {
  return (
    <div className="mic-wrap">
      <button
        type="button"
        className="mic mic-unavailable"
        disabled
        aria-label="Voice input unavailable"
      >
        <Mic size={52} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className="mic-copy">
        <p className="mic-label">Voice input unavailable</p>
      </div>
    </div>
  );
}
