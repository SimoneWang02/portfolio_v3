import { useEffect, useRef, useState } from "react";
import { createChibi } from "../chibi/createChibi.js";

// Hosts the three.js chibi; hands its controls (think/startTalking/speakChunk/done) to the parent via controlsRef.
export default function ChibiStage({ controlsRef }) {
  const stage = useRef(null);
  const [status, setStatus] = useState("waking up…");

  useEffect(() => {
    const chibi = createChibi(stage.current, {
      onProgress: (f) => setStatus(`waking up… ${Math.round(f * 100)}%`),
      onLoaded: () => setStatus(null),
      onError: setStatus,
    });
    controlsRef.current = chibi;
    return () => {
      chibi.dispose();
      if (controlsRef.current === chibi) controlsRef.current = null;
    };
  }, [controlsRef]);

  return (
    <div className="stage" ref={stage}>
      {status && <div className="loading">{status}</div>}
    </div>
  );
}
