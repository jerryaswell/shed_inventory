/**
 * What the kiosk heard and what it answers: an item and where it is, a change
 * with its Undo, or a question back with the choices as buttons.
 */
import { MapPin, Undo2, AlertTriangle } from 'lucide-react';
import { describeStock, isLow } from '../core/inventory.js';

export default function Reply({ result, items, undoLeft, onUndo, onPick }) {
  if (!result) return null;
  const item = result.itemId ? items.find((i) => i.id === result.itemId) : null;
  return (
    <section className={`reply reply-${result.action}`} aria-live="polite">
      {result.heard && <p className="reply-heard">“{result.heard}”</p>}
      <p className="reply-text">{result.reply}</p>

      {item && (
        <div className="reply-item">
          <MapPin size={28} aria-hidden="true" />
          <div>
            <div className="reply-where">{item.location.area}</div>
            <div className="reply-spot">{item.location.spot}</div>
          </div>
          <div className={`reply-stock${isLow(item) ? ' low' : ''}`}>
            {isLow(item) && <AlertTriangle size={18} aria-hidden="true" />}
            {describeStock(item)}
          </div>
        </div>
      )}

      {result.options && (
        <div className="reply-options">
          {result.options.map((o) => (
            <button type="button" key={o.itemId} className="chip chip-big" onClick={() => onPick(o.itemId)}>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {undoLeft > 0 && (
        <button type="button" className="undo" onClick={onUndo}>
          <Undo2 size={26} aria-hidden="true" />
          Undo
          <span className="undo-left">{undoLeft}s</span>
        </button>
      )}
    </section>
  );
}
