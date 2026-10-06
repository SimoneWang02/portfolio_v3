import { useEffect, useRef, useState } from "react";
import { CHIPS, GREETING } from "../content.js";
import formatReply from "../formatReply.jsx";

// LinkedIn-messaging-style dock pinned bottom-right; the header bar minimizes/expands it.
// `collapsed`: page-driven default (open on Home, minimized elsewhere so it doesn't cover the content).
export default function ChatPanel({ messages, busy, ask, collapsed }) {
  const [text, setText] = useState("");
  const [minimized, setMinimized] = useState(collapsed);
  useEffect(() => setMinimized(collapsed), [collapsed]);
  const input = useRef(null);
  const log = useRef(null);
  const all = [{ role: "assistant", content: GREETING }, ...messages];

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages, minimized]);

  // refocus after a reply so a follow-up can be typed straight away; not on touch screens, where it would
  // pop the keyboard back over the answer
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy && !matchMedia("(pointer: coarse)").matches) input.current?.focus({ preventScroll: true });
    wasBusy.current = busy;
  }, [busy]);

  function submit(e) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    ask(text);
    setText("");
  }

  return (
    <aside className={`chat dock${minimized ? " minimized" : ""}`}>
      <button type="button" className="dock-header" onClick={() => setMinimized((x) => !x)}
              aria-expanded={!minimized} aria-controls="dock-body">
        <svg className="msg-icon" viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id="sparkle-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: "var(--accent)" }} />
              <stop offset="1" style={{ stopColor: "var(--accent2)" }} />
            </linearGradient>
          </defs>
          <path fill="url(#sparkle-grad)"
                d="M10 1.5Q12.6 7.4 18.5 10 12.6 12.6 10 18.5 7.4 12.6 1.5 10 7.4 7.4 10 1.5z" />
          <path fill="url(#sparkle-grad)"
                d="M18.5 14Q19.9 17.1 23 18.5 19.9 19.9 18.5 23 17.1 19.9 14 18.5 17.1 17.1 18.5 14z" />
        </svg>
        <span className="dock-title"><strong>Ask Me Anything!</strong></span>
        <svg className="chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 15l6-6 6 6" />
        </svg>
      </button>
      {/* stays mounted so the height can animate; inert keeps it out of tab order while closed */}
      <div className="dock-body" id="dock-body" inert={minimized}>
        <div className="chat-log" ref={log} aria-live="polite">
          {all.map((m, i) => (
            <div key={i} className={`msg-row ${m.role}`}>
              <div className={`msg ${m.role}`}>
                {m.pending && !m.content
                  ? <span className="dots"><span>•</span><span>•</span><span>•</span></span>
                  : m.role === "assistant" ? formatReply(m.content) : m.content}
              </div>
            </div>
          ))}
        </div>
        <div className="chips">
          {CHIPS.map((c) => (
            <button key={c} type="button" className="chip" disabled={busy} onClick={() => ask(c, { preset: true })}>{c}</button>
          ))}
        </div>
        <form className="ask" onSubmit={submit} autoComplete="off">
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)}
                 placeholder="Write a message…" maxLength={500} aria-label="Your question" />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    strokeLinejoin="round" d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
            </svg>
          </button>
        </form>
        <p className="chat-note">Chats are saved so I can improve my answers.</p>
      </div>
    </aside>
  );
}
