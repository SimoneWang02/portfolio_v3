import { useEffect, useRef, useState } from "react";

// Hosts the three.js chibi; hands its controls (think/startTalking/speakChunk/done) to the parent via controlsRef.
// Full-bleed on Home; `mini` shrinks it (animated) into a small bottom-left companion for the other pages.
// three.js is most of the bundle, so it loads as its own chunk: the page and chat show up without waiting for it.
export default function ChibiStage({ controlsRef, mini }) {
  const stage = useRef(null);
  const chibi = useRef(null);
  const miniNow = useRef(mini); // read when the chibi is created, which can be after a navigation
  const [error, setError] = useState(null);

  useEffect(() => {
    let c = null, cancelled = false;
    import("../chibi/createChibi.js").then(({ createChibi }) => {
      if (cancelled) return;
      c = createChibi(stage.current, {
        mini: miniNow.current,
        onError: setError,
      });
      chibi.current = controlsRef.current = c;
    }, (err) => {
      console.error(err);
      if (!cancelled) setError("Couldn't load the chibi");
    });
    return () => {
      cancelled = true;
      if (!c) return;
      c.dispose();
      if (controlsRef.current === c) controlsRef.current = null;
    };
  }, [controlsRef]);

  useEffect(() => { miniNow.current = mini; chibi.current?.setMini(mini); }, [mini]);

  return (
    <div className={`stage${mini ? " mini" : ""}`} ref={stage}>
      {/* nothing while the model loads: the chibi makes its own entrance, peeking in from the side */}
      {error && <div className="loading">{error}</div>}
    </div>
  );
}
