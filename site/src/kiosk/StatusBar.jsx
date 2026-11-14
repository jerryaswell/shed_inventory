const LABELS = {
  checking: 'Checking API…',
  unconfigured: 'API not configured',
  unavailable: 'API configuration unavailable',
  online: 'API connected',
  offline: 'API unavailable'
};

export default function StatusBar({ status }) {
  return (
    <div className="status">
      <div className={`status-conn status-${status}`} role="status">
        <span className="status-dot" aria-hidden="true" />
        <span>{LABELS[status]}</span>
      </div>
    </div>
  );
}
