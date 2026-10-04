import { useEffect, useRef, useState } from "react";
import { createChibi } from "../chibi/createChibi.js";

// Hosts the three.js chibi; hands its controls (think/startTalking/speakChunk/done) to the parent via controlsRef.
// Full-bleed on Home; `mini` shrinks it (animated) into a small bottom-left companion for the other pages.
export default function ChibiStage({ controlsRef, mini }) {
  const stage = useRef(null);
  const chibi = useRef(null);
  const startMini = useRef(mini); // only read on mount; later changes go through setMini
  const [status, setStatus] = useState("waking up…");

  useEffect(() => {
    const c = createChibi(stage.current, {
      mini: startMini.current,
      onProgress: (f) => setStatus(`waking up… ${Math.round(f * 100)}%`),
      onLoaded: () => setStatus(null),
      onError: setStatus,
    });
    chibi.current = controlsRef.current = c;
    return () => {
      c.dispose();
      if (controlsRef.current === c) controlsRef.current = null;
    };
  }, [controlsRef]);

  useEffect(() => { chibi.current?.setMini(mini); }, [mini]);

  return (
    <div className={`stage${mini ? " mini" : ""}`} ref={stage}>
      {status && <div className="loading">{status}</div>}
    </div>
  );
}
