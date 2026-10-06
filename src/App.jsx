import { useEffect, useMemo, useRef } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Experience from "./pages/Experience.jsx";
import Projects from "./pages/Projects.jsx";
import Nav from "./components/Nav.jsx";
import SocialLinks from "./components/SocialLinks.jsx";
import ChibiStage from "./components/ChibiStage.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import { useChat } from "./hooks/useChat.js";

const PAGES = ["/experience", "/projects"]; // everything else falls through to Home
const TITLES = { "/experience": "Experience | Simone Wang", "/projects": "Projects | Simone Wang" }; // Home keeps index.html's
const NARROW = "(max-width: 899px), (max-height: 500px) and (orientation: landscape)"; // matches the phone layouts in styles.css

export default function App() {
  // chibi + chat live here so they persist across pages: full-size on Home, a small companion elsewhere
  const chibi = useRef(null);
  const chat = useChat(chibi);
  const { pathname } = useLocation();
  const page = pathname.replace(/\/+$/, "");
  const isHome = !PAGES.includes(page);
  // on phones the open chat would cover the chibi, so Home starts with it minimized too (read per navigation,
  // so resizing or rotating doesn't open/close it under the visitor)
  const narrow = useMemo(() => matchMedia(NARROW).matches, [page]);
  useEffect(() => {
    document.title = TITLES[page] ?? "Simone Wang | Software Developer";
  }, [page]);
  return (
    <>
      <Nav />
      <SocialLinks />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/experience" element={<Experience />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <ChibiStage controlsRef={chibi} mini={!isHome} />
      <ChatPanel {...chat} collapsed={!isHome || narrow} />
    </>
  );
}
