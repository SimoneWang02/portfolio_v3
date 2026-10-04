import { useRef } from "react";
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

export default function App() {
  // chibi + chat live here so they persist across pages: full-size on Home, a small companion elsewhere
  const chibi = useRef(null);
  const chat = useChat(chibi);
  const { pathname } = useLocation();
  const isHome = !PAGES.includes(pathname.replace(/\/+$/, ""));
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
      <ChatPanel {...chat} collapsed={!isHome} />
    </>
  );
}
