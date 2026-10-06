import { useEffect, useState } from "react";

const POLL_MS = 30000;
const MIN_POLL_MS = 3000;
// simple-icons Spotify mark, 24x24 viewBox
const SPOTIFY = "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z";

function ago(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "a moment ago";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

// My current (or last played) Spotify track, pinned bottom-left on Home. Polls /api/now-playing every 30 s,
// and right when the current song should end so the next one shows up promptly; pauses while the tab is hidden.
export default function NowPlaying() {
  const [track, setTrack] = useState(null);

  useEffect(() => {
    let timer, stopped = false;
    async function load() {
      clearTimeout(timer);
      if (document.hidden) return; // picked up again by the visibilitychange listener
      let next = POLL_MS;
      try {
        const res = await fetch("/api/now-playing");
        const data = res.status === 200 ? await res.json() : null;
        if (stopped) return;
        setTrack(data);
        if (data?.playing && data.progressMs != null && data.durationMs) {
          next = Math.min(POLL_MS, data.durationMs - data.progressMs + 1500);
        }
      } catch (err) {
        console.error(err);
      }
      if (!stopped) timer = setTimeout(load, Math.max(next, MIN_POLL_MS));
    }
    const onVisibility = () => { if (!document.hidden) load(); };
    load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  if (!track) return null;
  const { playing, title, artists, image, url, progressMs, durationMs, playedAt } = track;
  // say whose listening this is, so it doesn't read like a player in the visitor's browser
  const label = playing ? "Simone is listening to" : playedAt ? `Simone listened ${ago(playedAt)}` : "Simone paused";
  const progress = progressMs != null && durationMs ? Math.min(1, progressMs / durationMs) : null;

  return (
    <a className="now-playing" href={url} target="_blank" rel="noopener noreferrer"
       aria-label={`${label} ${title} by ${artists} on Spotify`}>
      {image ? <img className="np-art" src={image} alt="" /> : <span className="np-art" />}
      <span className="np-text">
        <span className="np-label">
          {playing
            ? <span className="eq" aria-hidden="true"><span /><span /><span /></span>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={SPOTIFY} /></svg>}
          {label}
        </span>
        <span className="np-title">{title}</span>
        <span className="np-artist">{artists}</span>
      </span>
      {progress != null && (
        // the server's progress is a snapshot; animate from it to the end of the song in real time
        <span key={`${url}-${progressMs}`} className={`np-bar${playing ? " run" : ""}`}
              style={{ "--from": progress, animationDuration: `${durationMs - progressMs}ms` }} />
      )}
    </a>
  );
}
