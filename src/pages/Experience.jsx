import { useEffect, useRef } from "react";
import { EXPERIENCE } from "../content.js";

const external = { target: "_blank", rel: "noopener noreferrer" };

// timeline marker icons (Lucide shapes)
const ICONS = {
  school: <><path d="M22 10 12 5 2 10l10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /><path d="M22 10v6" /></>,
  work: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
};

// fade/slide each block in the first time it scrolls into view (CSS skips the motion for reduced-motion users)
function useReveal() {
  const root = useRef(null);
  useEffect(() => {
    const items = root.current.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -10% 0px" });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return root;
}

function Project({ p }) {
  return (
    <article className="tl-card reveal">
      <p className="tl-dates">{p.dates}</p>
      <h3><a href={p.url} {...external}>{p.name}</a></h3>
      <p className="tl-about">{p.about}</p>
      <p className="tl-role">{p.role}<span className="tl-hours">{p.hours}</span></p>
      <ul className="tl-tags" aria-label="Stack">
        {p.tags.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <ul className="tl-points">
        {p.points.map((pt) => <li key={pt}>{pt}</li>)}
      </ul>
    </article>
  );
}

// Vertical timeline, newest first: each stop is a school or a job; the job lists its client projects.
export default function Experience() {
  const root = useReveal();
  return (
    <main className="page experience" ref={root}>
      <h1 className="sr-only">Experience</h1>
      <ol className="timeline">
        {EXPERIENCE.map((e) => (
          <li key={e.title} className="tl-item">
            <span className="tl-marker" aria-hidden="true">
              <svg viewBox="0 0 24 24">{ICONS[e.kind]}</svg>
            </span>
            <header className="tl-head reveal">
              <p className="tl-dates">{e.dates}</p>
              <h2>{e.title}</h2>
              {e.about.map((line) => <p key={line} className="tl-about">{line}</p>)}
              {e.ladder && (
                <ol className="ladder" aria-label="Role progression">
                  {e.ladder.map((r) => <li key={r}>{r}</li>)}
                </ol>
              )}
            </header>
            {e.grade && (
              <div className="tl-card reveal">
                <p className="tl-role">{e.grade}</p>
                <p className="tl-label">Coursework</p>
                <ul className="tl-tags">
                  {e.coursework.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}
            {e.projects && (
              <div className="tl-projects">
                {e.projects.map((p) => <Project key={p.name} p={p} />)}
              </div>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
