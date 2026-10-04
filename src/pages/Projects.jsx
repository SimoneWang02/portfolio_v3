import { PROJECTS } from "../content.js";
import { useReveal } from "../hooks/useReveal.js";

const external = { target: "_blank", rel: "noopener noreferrer" };

// photo on top, then the headline facts; the photo falls back to a tinted tile with the project's initial
function ProjectCard({ p }) {
  return (
    <article className="pj-card reveal">
      <div className="pj-media">
        {p.image
          ? <img src={p.image} alt={`Screenshot of ${p.name}`} loading="lazy" />
          : <span className="pj-placeholder" aria-hidden="true">{p.name[0]}</span>}
      </div>
      <div className="pj-body">
        <p className="tl-dates">{p.year}</p>
        <h2>{p.name}</h2>
        <p className="tl-about">{p.about}</p>
        <p className="tl-summary">{p.summary}</p>
        <ul className="tl-tags" aria-label="Stack">
          {p.tags.map((t) => <li key={t}>{t}</li>)}
        </ul>
        {(p.url || p.repo) && (
          <p className="pj-links">
            {p.url && <a href={p.url} {...external}>Live ↗</a>}
            {p.repo && <a href={p.repo} {...external}>Code ↗</a>}
          </p>
        )}
      </div>
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
