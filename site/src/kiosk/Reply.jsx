/**
 * Item facts come from the current inventory, including after Undo. The full
 * assistant reply is retained for exceptions and disambiguation.
 */
import { MapPin, AlertTriangle } from 'lucide-react';
import { describeStock, isLow } from '../core/inventory.js';

const SUMMARY = {
  find: 'Found',
  take: 'Taken',
  return: 'Returned',
  adjust: 'Updated',
  undone: 'Change undone'
};

export default function Reply({ result, items, onPick }) {
  if (!result) return null;
  const item = result.itemId ? items.find((i) => i.id === result.itemId) : null;
  const showMessage = !item || result.action === 'unknown';
  return (
    <section className={`reply reply-${result.action}`} aria-live="polite" aria-atomic="true">
      {showMessage && (
        <>
          {result.heard && <p className="reply-heard">Sample: “{result.heard}”</p>}
          <p className="reply-text">{result.reply}</p>
        </>
      )}

      {item && (
        <>
          <div className="reply-heading">
            {!showMessage && <p className="reply-summary">{SUMMARY[result.action]}</p>}
            <h2 className="reply-name">{item.name}</h2>
          </div>
          <div className="reply-item">
            <div className="reply-location">
              <MapPin size={22} aria-hidden="true" />
              <div>
                <div className="reply-where">{item.location.area}</div>
                <div className="reply-spot">{item.location.spot}</div>
              </div>
            </div>
            <div className={`reply-stock${isLow(item) ? ' low' : ''}`}>
              <span>{describeStock(item)}</span>
              {isLow(item) && <span className="reply-low"><AlertTriangle size={18} aria-hidden="true" />Low stock</span>}
            </div>
          </div>
        </>
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
    </section>
  );
}
