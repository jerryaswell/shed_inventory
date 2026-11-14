/**
 * Undo, with the seconds it has left. The countdown is its own: it rerenders
 * this button once a second, not the kiosk or the list around it. The kiosk
 * takes Undo away at the deadline, and checks the deadline again on a click.
 */
import { Undo2 } from 'lucide-react';
import { useNow } from './useNow.js';

/** How long a change can be undone. */
export const UNDO_MS = 10_000;

export default function UndoButton({ until, clock = Date.now, onUndo, iconSize = 24 }) {
  const now = useNow(1000, clock, until);
  // `now` was read at the last second boundary, so it can trail the moment
  // Undo was set; the cap keeps that from showing an eleventh second.
  const left = Math.min(UNDO_MS / 1000, Math.max(0, Math.ceil((until - now) / 1000)));
  if (left === 0) return null;
  return (
    <button type="button" className="undo" onClick={onUndo}>
      <Undo2 size={iconSize} aria-hidden="true" />
      Undo
      <span className="undo-left" aria-hidden="true">{left}s</span>
    </button>
  );
}
