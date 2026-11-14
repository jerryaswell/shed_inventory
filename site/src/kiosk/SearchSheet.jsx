/**
 * A null inventory means that no inventory service is connected. An empty
 * array is a loaded inventory with no items; a successful health check alone
 * cannot establish either its contents or permission to change them.
 *
 * Native modal dialogs live above the screensaver. Suspend the dialog while
 * asleep, keeping its search, scroll and focused control for waking.
 */
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { byArea, describeStock, isLow, search } from '../core/inventory.js';
import { useFocusRescue } from './useFocusRescue.js';
import TopBar from './TopBar.jsx';
import StatusBar from './StatusBar.jsx';
import './SearchSheet.css';

export default function SearchSheet({ items = null, onClose, onHome, suspended = false, status, motion }) {
  const [query, setQuery] = useState('');
  const dialogRef = useRef(null);
  const contentRef = useRef(null);
  const titleRef = useRef(null);
  const resume = useRef(null);
  const restoreOpener = useRef(true);
  const titleId = useId();
  const descriptionId = useId();
  const searchId = useId();
  const groups = items == null ? [] : byArea(search(items, query));
  const onFocus = useFocusRescue(titleRef, { scrollerRef: contentRef });

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    return () => {
      dialog.close();
      // Home owns the destination focus; Escape restores the Browse opener.
      if (restoreOpener.current && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (suspended) {
      if (dialog.open) {
        const active = document.activeElement;
        resume.current = { focus: dialog.contains(active) ? active : null, scroll: contentRef.current.scrollTop };
        dialog.close();
      }
      return;
    }
    dialog.showModal();
    const previous = resume.current;
    resume.current = null;
    contentRef.current.scrollTop = previous?.scroll ?? 0;
    const control = previous?.focus;
    // The title keeps the on-screen keyboard closed on first entry. A search
    // field removed while asleep also falls back to that stable destination.
    (control?.isConnected && !control.disabled ? control : titleRef.current).focus({ preventScroll: true });
  }, [suspended]);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      aria-describedby={items == null ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onFocus={onFocus}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const stops = [...event.currentTarget.querySelectorAll('button:enabled, input:enabled')];
        const active = document.activeElement;
        const at = stops.indexOf(active);
        if (event.shiftKey && (at === 0 || active === titleRef.current)) {
          event.preventDefault();
          stops.at(-1).focus();
        } else if (!event.shiftKey && (at === stops.length - 1 || (active === titleRef.current && !event.currentTarget.querySelector('input:enabled')))) {
          event.preventDefault();
          stops[0].focus();
        }
      }}
    >
      <TopBar
        motion={motion}
        onHome={() => {
          restoreOpener.current = false;
          onHome();
        }}
      />
      <div ref={contentRef} className="sheet-content">
        <div className="sheet-head">
          <h1 id={titleId} ref={titleRef} tabIndex={-1} className="sheet-title">Browse items</h1>
          {items?.length > 0 && (
            <div className="sheet-search-field">
              <label htmlFor={searchId}>Search items</label>
              <div className="sheet-search">
                <Search size={22} aria-hidden="true" />
                <input
                  id={searchId}
                  type="search"
                  placeholder="Name or location"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <div className="sheet-list">
          {items == null ? (
            <section className="sheet-unavailable">
              <h2>Inventory unavailable</h2>
              <p id={descriptionId}>Items will appear here when inventory is connected.</p>
            </section>
          ) : items.length === 0 ? (
            <p className="sheet-empty">No items yet.</p>
          ) : groups.length === 0 ? (
            <p className="sheet-empty">Nothing matches “{query}”.</p>
          ) : groups.map((group) => (
            <section key={group.area}>
              <h2 className="sheet-area">{group.area}</h2>
              {group.items.map((item) => (
                <div className="row" key={item.id}>
                  <div className="row-text">
                    <div className="row-name">{item.name}</div>
                    <div className="row-spot">{item.location.spot}</div>
                  </div>
                  <span className={`row-stock${isLow(item) ? ' low' : ''}`}>{describeStock(item)}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
      <StatusBar status={status} />
    </dialog>
  );
}
