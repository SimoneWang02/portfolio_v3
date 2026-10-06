import { useLayoutEffect, useRef } from "react";
import NowPlaying from "../components/NowPlaying.jsx";

// line icons for the blurb list (Lucide shapes)
const ICONS = {
  code: <><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>,
  cap: <><path d="M22 10 12 5 2 10l10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /><path d="M22 10v6" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" /></>,
  pin: <><path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>,
};
const Icon = ({ name }) => (
  <svg className="blurb-icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>
);

// small flags for the languages (simplified: drawn at ~20px, the details wouldn't show)
const star = (cx, cy, r, rot = 0) => Array.from({ length: 10 }, (_, i) => {
  const a = rot + (i * Math.PI) / 5 - Math.PI / 2, d = i % 2 ? r * 0.38 : r;
  return `${(cx + d * Math.cos(a)).toFixed(2)},${(cy + d * Math.sin(a)).toFixed(2)}`;
}).join(" ");
const FLAGS = {
  it: <><rect width="10" height="20" fill="#009246" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#ce2b37" /></>,
  us: <>
    <rect width="30" height="20" fill="#fff" />
    {Array.from({ length: 7 }, (_, i) => <rect key={i} y={(i * 2 * 20) / 13} width="30" height={20 / 13} fill="#b22234" />)}
    <rect width="12" height={(7 * 20) / 13} fill="#3c3b6e" />
  </>,
  cn: <>
    <rect width="30" height="20" fill="#de2910" />
    <polygon points={star(5, 5, 3)} fill="#ffde00" />
    {[[10, 2], [12, 4], [12, 7], [10, 9]].map(([x, y]) => <polygon key={x * 10 + y} points={star(x, y, 1)} fill="#ffde00" />)}
  </>,
};
const Flag = ({ code }) => <svg className="flag" viewBox="0 0 30 20" aria-hidden="true">{FLAGS[code]}</svg>;

// the intro facts; phones show the short wording, in a 2x2 grid
const FACTS = [
  { icon: "code", long: "Full-Stack Developer", short: "Full-Stack Dev" },
  { icon: "cap", long: "MSCS Student at NYU Tandon", short: "MSCS @ NYU Tandon" },
  { icon: "globe", long: <>Native Italian &amp; Mandarin<br />Fluent English</>,
    short: <span className="flags" role="img" aria-label="Italian, English and Mandarin"><Flag code="it" /><Flag code="us" /><Flag code="cn" /></span> },
  { icon: "pin", long: "Based in Brooklyn, NY", short: "Based in Brooklyn, NY" },
];

// the "open to internships" badge hides itself from this date on
const STATUS_UNTIL = new Date(2028, 8, 1); // 1 Sep 2028

// The chibi and chat dock are rendered by App (they persist across pages); Home adds the intro behind them.
export default function Home() {
  // publish where the intro ends (--intro-bottom), so on phones the chibi is framed below it however the facts wrap
  const blurb = useRef(null);
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    const ro = new ResizeObserver(() => root.setProperty("--intro-bottom", `${blurb.current.getBoundingClientRect().bottom}px`));
    ro.observe(blurb.current);
    return () => { ro.disconnect(); root.removeProperty("--intro-bottom"); };
  }, []);
  return (
    <main className="home">
      <header className="hero">
        <h1 className="sr-only">Simone Wang</h1>
        <div className="blurb" ref={blurb}>
          <ul>
            {FACTS.map(({ icon, long, short }) => (
              <li key={icon}><Icon name={icon} /><span className="long">{long}</span><span className="short">{short}</span></li>
            ))}
          </ul>
          {new Date() < STATUS_UNTIL && (
            <p className="status"><span className="pulse" aria-hidden="true" />Open to Summer 2027 Internships</p>
          )}
        </div>
      </header>
      <NowPlaying />
    </main>
  );
}
