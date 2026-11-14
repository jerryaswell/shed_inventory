import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export const AMBIENT_PAUSE_KEY = 'shed-ambient-motion-paused';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readPaused() {
  try {
    return window.localStorage.getItem(AMBIENT_PAUSE_KEY) === 'true';
  } catch {
    return false;
  }
}

// One MediaQueryList serves every snapshot read and subscription; it is created
// on first use and again only if window.matchMedia itself is replaced.
let mediaFactory;
let mediaQuery = null;

function reducedMotionQuery() {
  const matchMedia = window.matchMedia;
  if (matchMedia !== mediaFactory) {
    mediaFactory = matchMedia;
    mediaQuery = matchMedia ? matchMedia.call(window, REDUCED_MOTION_QUERY) : null;
  }
  return mediaQuery;
}

const getReducedMotion = () => reducedMotionQuery()?.matches ?? false;
const getHidden = () => document.hidden;
const getServerSnapshot = () => false;

function subscribeReducedMotion(onChange) {
  const query = reducedMotionQuery();
  if (!query) return () => {};
  if (query.addEventListener) {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  // Older Android WebViews expose the MediaQueryList listener methods only.
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

function subscribeVisibility(onChange) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/**
 * Pass paused and sleeping to AmbientBackground. Only userPaused is stored,
 * under AMBIENT_PAUSE_KEY; forced stops never replace the explicit preference.
 * Storage restrictions leave the current session's toggle usable.
 *
 * A pause control uses togglePause and userPaused. Disable it while
 * reducedMotion is true and explain that the device preference stops motion.
 */
export function useAmbientMotion({ sleeping = false } = {}) {
  const [userPaused, setUserPaused] = useState(readPaused);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerSnapshot);
  const hidden = useSyncExternalStore(subscribeVisibility, getHidden, getServerSnapshot);

  useEffect(() => {
    try {
      window.localStorage.setItem(AMBIENT_PAUSE_KEY, String(userPaused));
    } catch {
      // Kiosk privacy settings can deny storage without disabling the control.
    }
  }, [userPaused]);

  const togglePause = useCallback(() => setUserPaused((paused) => !paused), []);

  return {
    paused: userPaused || reducedMotion || hidden || sleeping,
    userPaused,
    reducedMotion,
    hidden,
    togglePause
  };
}
