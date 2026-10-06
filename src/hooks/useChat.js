import { useCallback, useRef, useState } from "react";
import { OOPS } from "../content.js";

const OOPS_MARK = "\x1e"; // the server ends a failed reply with this plus "credit" or "glitch" (see ChatController)

// Chat history + streaming /api/chat. Drives the chibi's moods through chibiRef as the reply arrives.
export function useChat(chibiRef) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const history = useRef([]); // source of truth for what we send; `messages` mirrors it for rendering
  const conversationId = useRef(crypto.randomUUID()); // one logged conversation per page load

  const ask = useCallback(async (raw) => {
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
        body: JSON.stringify({ conversationId: conversationId.current, messages: history.current }),
      });
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
      oops = "glitch";
      console.error(err);
    }
    if (oops !== null) {
      // a lost reply can be picked up again, an empty wallet can't, so the credit lines win even mid-reply
      const pool = oops === "credit" ? OOPS.credit : answer.trim() ? OOPS.midReply : OOPS.glitch;
      say((answer ? " " : "") + pool[Math.floor(Math.random() * pool.length)]);
    }
    history.current = [...history.current, { role: "assistant", content: answer }];
    setMessages(history.current);
    chibiRef.current?.done();
    setBusy(false);
  }, [busy, chibiRef]);

  return { messages, busy, ask };
}
