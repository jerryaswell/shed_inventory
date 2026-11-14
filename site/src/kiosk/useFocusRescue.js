import { useLayoutEffect, useRef } from 'react';

/**
 * Keep keyboard and screen-reader focus from falling to <body> when the
 * focused control goes away: Undo when it is used or runs out, a "which one"
 * choice once picked, the mic button while it is busy. Spread the returned
 * handler as `onFocus` on the region to watch (React's onFocus bubbles). After
 * every render, if the last focused control in that region is gone or disabled
 * and nothing else has focus, focus moves to `fallbackRef`.
 *
 * Focus that the person moves elsewhere is left alone: the control they left
 * is still connected and enabled.
 */
export function useFocusRescue(fallbackRef, { ignore } = {}) {
  const last = useRef(null);

  useLayoutEffect(() => {
    const control = last.current;
    if (!control) return;
    const lost = !control.isConnected || control.disabled;
    const active = document.activeElement;
    if (!lost || (active && active !== document.body && active !== control)) return;
    const fallback = fallbackRef.current;
    if (fallback?.isConnected) {
      fallback.focus({ preventScroll: true });
      last.current = fallback;
    }
  });

  return (event) => {
    if (ignore?.(event.target)) return;
    last.current = event.target;
  };
}
