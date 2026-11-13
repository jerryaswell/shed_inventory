/**
 * Search and browse by hand, for when voice is not the easier way, or the
 * network is down. Big ± buttons for stock, In/Out for tools.
 */
import { useState } from 'react';
import { X, Minus, Plus, Search, Undo2 } from 'lucide-react';
import { byArea, describeStock, isLow, search } from '../core/inventory.js';

export default function SearchSheet({ items, onClose, onChange, notice, undoLeft = 0, onUndo }) {
  const [query, setQuery] = useState('');
  const groups = byArea(search(items, query));
  return (
    <div className="sheet" role="dialog" aria-label="Search the shed">
      <div className="sheet-head">
        <label className="sheet-search">
          <Search size={22} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search the shed"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close search">
          <X size={28} />
        </button>
      </div>
      <div className="sheet-list">
        {groups.length === 0 && <p className="sheet-empty">Nothing matches “{query}”.</p>}
        {groups.map((g) => (
          <section key={g.area}>
            <h2 className="sheet-area">{g.area}</h2>
            {g.items.map((item) => (
              <div className="row" key={item.id}>
                <div className="row-text">
                  <div className="row-name">{item.name}</div>
                  <div className="row-spot">{item.location.spot}</div>
                </div>
                {item.kind === 'stock' ? (
                  <div className="row-qty">
                    <button type="button" className="icon-btn" aria-label={`One fewer ${item.name}`} onClick={() => onChange({ itemId: item.id, delta: -1 })} disabled={item.quantity === 0}>
                      <Minus size={24} />
                    </button>
                    <span className={`row-count${isLow(item) ? ' low' : ''}`}>{item.quantity}</span>
                    <button type="button" className="icon-btn" aria-label={`One more ${item.name}`} onClick={() => onChange({ itemId: item.id, delta: 1 })}>
                      <Plus size={24} />
                    </button>
                  </div>
                ) : (
                  <button type="button" className={`tool-state${item.out ? ' out' : ''}`} onClick={() => onChange({ itemId: item.id, out: !item.out })} aria-label={`${item.name} is ${describeStock(item)}; tap to change`}>
                    {item.out ? 'Out' : 'In'}
                  </button>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
      {notice && (
        <div className="sheet-feedback">
          <p role="status">{notice}</p>
          {undoLeft > 0 && (
            <button type="button" className="undo" onClick={onUndo}>
              <Undo2 size={26} aria-hidden="true" />
              Undo
              <span className="undo-left" aria-hidden="true">{undoLeft}s</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
