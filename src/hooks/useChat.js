import { useCallback, useRef, useState } from "react";

// Chat history + streaming /api/chat. Drives the chibi's moods through chibiRef as the reply arrives.
export function useChat(chibiRef) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const history = useRef([]); // source of truth for what we send; `messages` mirrors it for rendering

  const ask = useCallback(async (raw) => {
    const q = raw.trim();
    if (!q || busy) return;
    setBusy(true);
    history.current = [...history.current, { role: "user", content: q }];
    setMessages([...history.current, { role: "assistant", content: "", pending: true }]);
    chibiRef.current?.think();

    let answer = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.current }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let started = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        if (!started) { started = true; chibiRef.current?.startTalking(); }
        answer += chunk;
        chibiRef.current?.speakChunk(chunk);
        setMessages([...history.current, { role: "assistant", content: answer, pending: true }]);
      }
    } catch (err) {
      answer = "Oops, my brain glitched. Try again in a sec?";
      console.error(err);
    }
    history.current = [...history.current, { role: "assistant", content: answer }];
    setMessages(history.current);
    chibiRef.current?.done();
    setBusy(false);
  }, [busy, chibiRef]);

  return { messages, busy, ask };
}
