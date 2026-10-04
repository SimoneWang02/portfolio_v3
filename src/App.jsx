import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Experience from "./pages/Experience.jsx";
import Projects from "./pages/Projects.jsx";
import Nav from "./components/Nav.jsx";
import SocialLinks from "./components/SocialLinks.jsx";

export default function App() {
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
    </>
  );
}
