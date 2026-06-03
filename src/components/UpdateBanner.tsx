import { useStore } from "../store/useStore";

// Toast shown when the GitHub repo has a newer release than the running build.
// Offers a one-click in-place update (git pull + npm install) and a link to the
// release notes. Dismissible for the session.
export function UpdateBanner() {
  const update = useStore((s) => s.update);
  const apply = useStore((s) => s.applyUpdate);
  const dismiss = useStore((s) => s.dismissUpdate);
  const info = update.info;

  if (!info || !info.hasUpdate || update.dismissed) return null;

  return (
    <div className="update-banner" role="status">
      <span className="update-dot" />
      <div className="update-text">
        <div className="update-title">
          Update available <span className="mono">{info.latest}</span>
        </div>
        <div className="update-sub">
          {update.error ? (
            <span className="down">{update.error}</span>
          ) : update.applying ? (
            "Pulling the latest code…"
          ) : (
            <>You are on <span className="mono">v{info.current}</span></>
          )}
        </div>
      </div>
      {info.url && (
        <a className="btn sm ghost" href={info.url} target="_blank" rel="noreferrer">
          What's new
        </a>
      )}
      <button className="btn sm update-go" onClick={() => apply()} disabled={update.applying}>
        {update.applying ? "Updating…" : "Update now"}
      </button>
      <button className="iconbtn" onClick={dismiss} aria-label="Dismiss" title="Dismiss">
        ×
      </button>
    </div>
  );
}
