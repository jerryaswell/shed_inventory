/**
 * The top line: what this is, the time, and whether the backend answers.
 */
const LABELS = {
  checking: 'Checking API…',
  sample: 'API not configured',
  online: 'API connected',
  offline: 'API unavailable'
};

export default function StatusBar({ status, now, controls }) {
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
