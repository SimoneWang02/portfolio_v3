import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/experience", label: "Experience" },
  { to: "/projects", label: "Projects" },
];

// Top-left pill nav; the highlight slides to whichever link is active.
export default function Nav() {
  const navRef = useRef(null);
  const { pathname } = useLocation();
  const [pill, setPill] = useState(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = () => {
      const a = nav.querySelector("a.active");
      setPill(a ? { left: a.offsetLeft, width: a.offsetWidth } : null);
    };
    measure();
    // re-measure when link widths change (font load, breakpoint)
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [pathname]);

  // place the pill without sliding on first paint, animate after that
  useLayoutEffect(() => {
    if (pill && !animate) requestAnimationFrame(() => setAnimate(true));
  }, [pill, animate]);

  return (
    <nav className="nav" ref={navRef}>
      <span
        className={`nav-pill${animate ? " animate" : ""}`}
        style={pill ? { transform: `translateX(${pill.left}px)`, width: pill.width } : { opacity: 0 }}
        aria-hidden="true"
      />
      {LINKS.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={end}>{label}</NavLink>
      ))}
    </nav>
  );
}
