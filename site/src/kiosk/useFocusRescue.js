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
 *
 * The fallback is focused without the browser's own scroll, which would also
 * scroll the page or a modal's backdrop. Pass `scrollerRef`, the fallback's
 * nearest scroll container, to bring it into view there instead: an answer
 * below the fold of a small screen is otherwise focused out of sight.
 */
export function useFocusRescue(fallbackRef, { ignore, scrollerRef } = {}) {
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
      if (scrollerRef?.current) revealIn(scrollerRef.current, fallback);
      last.current = fallback;
    }
  });

  return (event) => {
    if (ignore?.(event.target)) return;
    last.current = event.target;
  };
}

/**
 * Scroll `scroller` the least it takes to show `element` inside it, clear of
 * the edges by the gutter the stylesheet scroll-pads with (--focus-gutter).
 * An element taller than the viewport shows its top.
 */
export function revealIn(scroller, element) {
  const gutter = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
  const box = element.getBoundingClientRect();
  const viewport = scroller.getBoundingClientRect();
  const above = viewport.top + gutter - box.top;
  const below = box.bottom - (viewport.bottom - gutter);
  if (above > 0) scroller.scrollTop -= above;
  else if (below > 0) scroller.scrollTop += Math.min(below, -above);
}
