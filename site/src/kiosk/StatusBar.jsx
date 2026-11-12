/**
 * The top line: what this is, the time, and whether the backend answers.
 */
const LABELS = {
  checking: 'Connecting…',
  sample: 'Sample data',
  online: 'Online',
  offline: 'Offline'
};

export default function StatusBar({ status, now }) {
  const time = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <header className="status">
      <span className="status-title">Shed</span>
      <span className="status-time">{time}</span>
      <span className={`status-conn status-${status}`} role="status">
        <span className="status-dot" aria-hidden="true" />
        {LABELS[status]}
      </span>
    </header>
  );
}
