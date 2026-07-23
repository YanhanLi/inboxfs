export default function LoadError() {
  return <div className="async-error" role="alert"><div><strong>Panel unavailable</strong><button type="button" onClick={() => window.location.reload()}>Reload workspace</button></div></div>;
}
