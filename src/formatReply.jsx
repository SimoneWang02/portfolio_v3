// Renders a chat reply: "- " / "1. " lines become lists, **bold** becomes <strong>, and links
// (markdown [text](url), full URLs, bare domains like linkedin.com/in/…, emails) become <a> tags.
const TLDS = "com|dev|io|org|net|edu|ai|app|me|co|gg|so|xyz";
const LINK = new RegExp(
  [
    String.raw`\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)`,                 // 1,2: markdown
    String.raw`([\w.+-]+@[\w-]+(?:\.[\w-]+)+)`,                          // 3: email
    String.raw`(https?:\/\/[^\s<]+)`,                                    // 4: full URL
    String.raw`(?<![\w@./-])((?:[a-z0-9-]+\.)+(?:${TLDS})(?![\w-])(?:\/[^\s<]*)?)`, // 5: bare domain
  ].join("|"),
  "gi",
);

// "github.com/x." → "github.com/x" + "."; keep a ")" only if the URL opened one
function trimTrailing(url) {
  let end = url.length;
  while (end > 0) {
    const c = url[end - 1];
    if (".,;:!?'\"".includes(c)) end--;
    else if (c === ")" && !url.slice(0, end).includes("(")) end--;
    else break;
  }
  return [url.slice(0, end), url.slice(end)];
}

function anchor(href, label, key) {
  const external = !href.startsWith("mailto:");
  return (
    <a key={key} href={href} {...(external && { target: "_blank", rel: "noopener noreferrer" })}>
      {label}
    </a>
  );
}

function linkify(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const [whole, mdText, mdUrl, email, url, domain] = m;
    out.push(text.slice(last, m.index));
    last = m.index + whole.length;
    if (mdUrl) out.push(anchor(mdUrl, mdText, m.index));
    else if (email) {
      const [addr, rest] = trimTrailing(email);
      out.push(anchor(`mailto:${addr}`, addr, m.index), rest);
    } else {
      const [link, rest] = trimTrailing(url || domain);
      out.push(anchor(url ? link : `https://${link}`, link, m.index), rest);
    }
  }
  out.push(text.slice(last));
  return out;
}

function inline(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 ? <strong key={i}>{linkify(part)}</strong> : linkify(part));
}

const ITEM = /^\s*(?:([-*•])|\d+[.)])\s+(.*)$/;

export default function formatReply(text) {
  const blocks = [];
  for (const line of text.split("\n")) {
    const m = line.match(ITEM);
    if (!line.trim() && blocks.at(-1)?.type !== "text") continue; // blank line inside a list
    const type = m ? (m[1] ? "ul" : "ol") : "text";
    const prev = blocks.at(-1);
    if (prev?.type === type) prev.lines.push(m ? m[2] : line);
    else blocks.push({ type, lines: [m ? m[2] : line] });
  }
  return blocks.map((b, i) => {
    if (b.type === "text") {
      const t = b.lines.join("\n").trim();
      return t && <p key={i}>{inline(t)}</p>;
    }
    const List = b.type;
    return <List key={i}>{b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}</List>;
  });
}
