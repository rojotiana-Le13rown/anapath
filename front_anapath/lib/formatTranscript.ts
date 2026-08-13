export function capitalizeFirst(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ensureEndsWithPunctuation(s: string) {
  if (!s) return s;
  const trimmed = s.trimEnd();
  if (/[.?!]$/.test(trimmed)) return trimmed;
  return trimmed + ".";
}

// Append a new final segment to existing text, applying punctuation and capitalization
export function appendFinalSegment(prevText: string, newSegment: string, startsAfterPause: boolean) {
  const seg = newSegment.trim();
  if (!seg) return prevText || "";

  let base = prevText || "";
  base = base.trimEnd();

  // if prev is empty => start of dictation
  if (!base) {
    return capitalizeFirst(seg);
  }

  // avoid duplicate
  if (base.endsWith(seg)) return prevText;

  if (startsAfterPause) {
    // ensure previous ends with punctuation
    base = ensureEndsWithPunctuation(base);
    // add newline then capitalize new segment
    return `${base}\n${capitalizeFirst(seg)}`;
  }

  // continuation in same paragraph: just space + possibly capitalize if previous ended with punctuation
  if (/[.?!]$/.test(base)) {
    return `${base} ${capitalizeFirst(seg)}`;
  }

  return `${base} ${seg}`;
}

// Build final combined display from parts and break flags
export function buildFinalDisplay(parts: string[], breaks: boolean[]) {
  if (!parts || parts.length === 0) return "";
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!p) continue;
    if (!out) {
      out = capitalizeFirst(p);
    } else {
      if (breaks[i]) {
        out = ensureEndsWithPunctuation(out);
        out = `${out}\n${capitalizeFirst(p)}`;
      } else if (/[.?!]$/.test(out)) {
        out = `${out} ${capitalizeFirst(p)}`;
      } else {
        out = `${out} ${p}`;
      }
    }
  }
  return out;
}

export function truncateText(text: string, length = 50) {
  if (!text) return text;
  return text.length > length ? text.substring(0, length) + "..." : text;
}

export function handleManualPause(text: string) {
  if (!text) return "";

  // Normalize trailing spaces/newlines before applying a single manual break
  let base = text.replace(/[ \t]+$/g, "").replace(/\n+$/g, "");
  if (!base) return "";

  if (!/[.?!]$/.test(base)) {
    base += ".";
  }

  return `${base}\n`;
}
