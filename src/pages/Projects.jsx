import { useId, useState } from "react";
import { PROJECTS } from "../content.js";
import { useReveal } from "../hooks/useReveal.js";
import { DetailsPanel, DetailsToggle } from "../components/Details.jsx";

const external = { target: "_blank", rel: "noopener noreferrer" };

// photo beside the headline facts (falls back to a tinted tile with the project's initial);
// "Show details" opens the full points in a panel spanning the whole card
function ProjectCard({ p }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <article className="pj-card reveal">
      <div className="pj-media">
        {p.image
          ? <img src={p.image} alt={`Screenshot of ${p.name}`} loading="lazy" />
          : <span className="pj-placeholder" aria-hidden="true">{p.name[0]}</span>}
      </div>
      <div className="pj-body">
        <p className="pj-meta"><span className="tl-dates">{p.dates}</span><span className="pj-type">{p.type}</span></p>
        <h2>{p.name}</h2>
        <p className="tl-about">{p.about}</p>
        <p className="tl-summary">{p.summary}</p>
        <ul className="tl-tags" aria-label="Stack">
          {p.tags.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <div className="pj-actions">
          {p.points?.length > 0 && <DetailsToggle open={open} onToggle={() => setOpen((x) => !x)} controls={id} />}
          {p.url && <a href={p.url} {...external}>Live ↗</a>}
          {p.repo && <a href={p.repo} {...external}>Code ↗</a>}
        </div>
      </div>
      {p.points?.length > 0 && <DetailsPanel open={open} id={id} points={p.points} />}
    </article>
  );
}

export default function Projects() {
  const root = useReveal();
  return (
    <main className="page projects" ref={root}>
      <h1 className="sr-only">Projects</h1>
      <div className="pj-grid">
        {PROJECTS.map((p) => <ProjectCard key={p.name} p={p} />)}
      </div>
    </main>
  );
}
