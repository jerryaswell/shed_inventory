import { useEffect, useState } from 'react';

/** The time from `clock`, updated every `everyMs`. */
export function useNow(everyMs = 1000, clock = Date.now) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), everyMs);
    return () => clearInterval(id);
  }, [everyMs, clock]);
  return now;
}
