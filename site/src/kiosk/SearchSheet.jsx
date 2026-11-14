/**
 * Search and browse by hand, for when voice is not the easier way, or the
 * network is down. Big ± buttons for stock, In/Out for tools.
 *
 * While the kiosk sleeps the sheet is `suspended`: a modal dialog sits in the
 * top layer, above anything the page can stack over it, so the screensaver
 * cannot cover it. The dialog is closed instead, and stays mounted, so the
 * search and the list are as they were when it opens again on waking.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { X, Minus, Plus, Search, Undo2 } from 'lucide-react';
import { byArea, describeStock, isLow, search } from '../core/inventory.js';
import { useFocusRescue } from './useFocusRescue.js';
import './SearchSheet.css';

export default function SearchSheet({ items, onClose, onChange, notice, undoLeft = 0, onUndo, suspended = false }) {
  const [query, setQuery] = useState('');
  const dialogRef = useRef(null);
  const contentRef = useRef(null);
  const titleRef = useRef(null);
  const resume = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const searchId = useId();
  const groups = byArea(search(items, query));
  const hasUndo = undoLeft > 0;
  // When Undo is used or runs out while focused, focus returns to the title.
  const onFocus = useFocusRescue(titleRef);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog.showModal();
    // The title, not the search field: focusing a field raises the on-screen
    // keyboard on the kiosk's touchscreen and hides half the list.
    titleRef.current.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Closing the dialog hands focus back to the page and drops the list's
  // scroll position, so both are kept here and put back when it reopens.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (suspended) {
      const active = document.activeElement;
      resume.current = { focus: dialog.contains(active) ? active : null, scroll: contentRef.current.scrollTop };
      dialog.close();
      return;
    }
    if (!resume.current) return;
    const { focus, scroll } = resume.current;
    resume.current = null;
    dialog.showModal();
    contentRef.current.scrollTop = scroll;
    // A control that went away meanwhile (Undo running out) leaves the title.
    (focus?.isConnected ? focus : titleRef.current).focus({ preventScroll: true });
  }, [suspended]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const focused = document.activeElement;
    if (!content.contains(focused)) return;
    const control = focused.getBoundingClientRect();
    const viewport = content.getBoundingClientRect();
    if (control.bottom > viewport.bottom - 4) content.scrollTop += control.bottom - viewport.bottom + 4;
    else if (control.top < viewport.top + 4) content.scrollTop -= viewport.top - control.top + 4;
  }, [notice, hasUndo]);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onFocus={onFocus}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        // Every Tab stop, in order. A notice too long for its box scrolls, and
        // the browser makes that scroller a Tab stop of its own.
        const stops = [...event.currentTarget.querySelectorAll('button:enabled, input:enabled, .sheet-feedback p')]
          .filter((stop) => stop.localName !== 'p' || stop.scrollHeight > stop.clientHeight);
        const active = document.activeElement;
        const at = stops.indexOf(active);
        // From the title (not a stop) Shift+Tab would leave the page. Anything
        // else that is not in the list is left to the browser.
        if (event.shiftKey && (at === 0 || active === titleRef.current)) {
          event.preventDefault();
          stops.at(-1).focus();
        } else if (!event.shiftKey && at === stops.length - 1) {
          event.preventDefault();
          stops[0].focus();
        }
      }}
    >
      <p id={descriptionId} className="sheet-disclosure">Sample inventory. Not saved.</p>
      <div ref={contentRef} className="sheet-content">
        <div className="sheet-head">
          <div className="sheet-title-row">
            <h1 id={titleId} ref={titleRef} tabIndex={-1} className="sheet-title">Browse items</h1>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close search">
              <X size={28} aria-hidden="true" />
            </button>
          </div>
          <div className="sheet-search-field">
            <label htmlFor={searchId}>Search items</label>
            <div className="sheet-search">
              <Search size={22} aria-hidden="true" />
              <input
                id={searchId}
                type="search"
                placeholder="Name or location"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
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
                      <button type="button" className="icon-btn" aria-label={`Remove one ${item.unit} from ${item.name}`} onClick={() => onChange({ itemId: item.id, delta: -1 })} disabled={item.quantity === 0}>
                        <Minus size={24} aria-hidden="true" />
                      </button>
                      <span className={`row-count${isLow(item) ? ' low' : ''}`}>{describeStock(item)}</span>
                      <button type="button" className="icon-btn" aria-label={`Add one ${item.unit} to ${item.name}`} onClick={() => onChange({ itemId: item.id, delta: 1 })}>
                        <Plus size={24} aria-hidden="true" />
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
      </div>
      {(notice || undoLeft > 0) && (
        <div className="sheet-feedback">
          {notice && <p role="status">{notice}</p>}
          {undoLeft > 0 && (
            <button type="button" className="undo" onClick={onUndo}>
              <Undo2 size={26} aria-hidden="true" />
              Undo
              <span className="undo-left" aria-hidden="true">{undoLeft}s</span>
            </button>
          )}
        </div>
      )}
    </dialog>
  );
}
