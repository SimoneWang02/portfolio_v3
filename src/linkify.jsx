// Turns links in chat replies into <a> tags: markdown [text](url), full URLs,
// bare domains like linkedin.com/in/…, and email addresses.
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

export default function linkify(text) {
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
