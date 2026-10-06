import { useCallback, useRef, useState } from "react";
import { OOPS } from "../content.js";

const OOPS_MARK = "\x1e"; // the server ends a failed reply with this plus "credit" or "glitch" (see ChatController)

// Chat history + streaming /api/chat. Drives the chibi's moods through chibiRef as the reply arrives.
export function useChat(chibiRef) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const history = useRef([]); // the chat as shown; the server keeps its own copy, so only the new question is sent
  const conversationId = useRef(crypto.randomUUID()); // one logged conversation per page load

  // `preset`: a chip question, which the server answers from its cache
  const ask = useCallback(async (raw, { preset = false } = {}) => {
    const q = raw.trim();
    if (!q || busy) return;
    setBusy(true);
    history.current = [...history.current, { role: "user", content: q }];
    setMessages([...history.current, { role: "assistant", content: "", pending: true }]);
    chibiRef.current?.think();

    let answer = "";
    let oops = null; // failure kind the server sent after OOPS_MARK, or "glitch" when the request itself failed
    let started = false;
    const say = (text) => {
      if (!started) { started = true; chibiRef.current?.startTalking(); }
      answer += text;
      chibiRef.current?.speakChunk(text);
      setMessages([...history.current, { role: "assistant", content: answer, pending: true }]);
    };
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId.current, message: q, preset }),
      });
      if (res.status === 429 || res.status === 503) throw Object.assign(new Error(`HTTP ${res.status}`), { oops: res.status === 429 ? "slow" : "resting" });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let chunk = dec.decode(value, { stream: true });
        if (oops !== null) { oops += chunk; continue; }
        const at = chunk.indexOf(OOPS_MARK);
        if (at >= 0) { oops = chunk.slice(at + 1); chunk = chunk.slice(0, at); }
        if (chunk) say(chunk);
      }
    } catch (err) {
      oops = err.oops ?? "glitch";
      if (!err.oops) console.error(err);
    }
    if (oops !== null) {
      // a lost reply can be picked up again, an empty wallet can't, so the credit lines win even mid-reply
      const pool = OOPS[oops] && oops !== "glitch" ? OOPS[oops] : answer.trim() ? OOPS.midReply : OOPS.glitch;
      say((answer ? " " : "") + pool[Math.floor(Math.random() * pool.length)]);
    }
    history.current = [...history.current, { role: "assistant", content: answer }];
    setMessages(history.current);
    chibiRef.current?.done();
    setBusy(false);
  }, [busy, chibiRef]);

  return { messages, busy, ask };
}
