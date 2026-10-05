import { useEffect, useRef, useState } from "react";
import { createChibi } from "../chibi/createChibi.js";

// Hosts the three.js chibi; hands its controls (think/startTalking/speakChunk/done) to the parent via controlsRef.
// Full-bleed on Home; `mini` shrinks it (animated) into a small bottom-left companion for the other pages.
export default function ChibiStage({ controlsRef, mini }) {
  const stage = useRef(null);
  const chibi = useRef(null);
  const startMini = useRef(mini); // only read on mount; later changes go through setMini
  const [error, setError] = useState(null);

  useEffect(() => {
    const c = createChibi(stage.current, {
      mini: startMini.current,
      onError: setError,
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
      {/* nothing while the model loads: the chibi makes its own entrance, peeking in from the side */}
      {error && <div className="loading">{error}</div>}
    </div>
  );
}
