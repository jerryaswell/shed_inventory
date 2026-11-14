/**
 * The top line: what this is, the time, and whether the backend answers. The
 * clock shows minutes, so it reads the time once a minute, on the minute.
 */
import { useNow } from './useNow.js';

const LABELS = {
  checking: 'Checking API…',
  sample: 'API not configured',
  unavailable: 'API configuration unavailable',
  online: 'API connected',
  offline: 'API unavailable'
};

export default function StatusBar({ status, clock = Date.now, controls }) {
  const now = useNow(60_000, clock);
  const time = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <header className="status">
      <div className="status-heading">
        <h1 className="status-title">Shed <span className="status-demo">Demo</span></h1>
        {controls && <div className="status-controls">{controls}</div>}
      </div>
      <div className="status-details">
        <span className={`status-conn status-${status}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {LABELS[status]}
        </span>
        <span className="status-time">{time}</span>
      </div>
    </header>
  );
}
