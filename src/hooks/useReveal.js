import { useEffect, useRef } from "react";

// fade/slide each .reveal block in the first time it scrolls into view (CSS skips the motion for reduced-motion users)
export function useReveal() {
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
