import { useEffect, useState } from 'react';

/**
 * The time from `clock`, read again at each `unitMs` boundary counted from
 * `origin`: the moments a display of it at that resolution changes, not a
 * fixed tick. A hidden page schedules nothing, and reads the clock afresh as
 * soon as it is shown again. Only the component that shows the time rerenders.
 */
export function useNow(unitMs, clock = Date.now, origin = 0) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    let id;
    const schedule = (t) => {
      clearTimeout(id);
      if (document.hidden) return;
      const into = (((t - origin) % unitMs) + unitMs) % unitMs;
      id = setTimeout(tick, unitMs - into);
    };
    function tick() {
      const t = clock();
      setNow(t);
      schedule(t);
    }
    const onVisibility = () => (document.hidden ? clearTimeout(id) : tick());
    schedule(clock());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [unitMs, clock, origin]);
  return now;
}
