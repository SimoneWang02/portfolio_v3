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

// the "open to internships" badge hides itself from this date on
const STATUS_UNTIL = new Date(2028, 8, 1); // 1 Sep 2028

// The chibi and chat dock are rendered by App (they persist across pages); Home adds the intro behind them.
export default function Home() {
  return (
    <main className="home">
      <header className="hero">
        <h1 className="sr-only">Simone Wang</h1>
        <div className="blurb">
          <ul>
            <li><Icon name="code" />Full-Stack Developer</li>
            <li><Icon name="cap" />MSCS Student at NYU Tandon</li>
            <li><Icon name="globe" /><span>Native Italian &amp; Mandarin<br />Fluent English</span></li>
            <li><Icon name="pin" />Based in Brooklyn, NY</li>
          </ul>
          {new Date() < STATUS_UNTIL && (
            <p className="status"><span className="pulse" aria-hidden="true" />Open to Summer 2027 Internships</p>
          )}
        </div>
      </header>
    </main>
  );
}
