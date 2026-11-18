/* Copied from the songbook build by web/publish_web.py — edit the songbook, not this file. */
window.NLB_KIT = (function chartKit() {
  const esc = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CHORD_RE = /^([A-G])([#b]?)((?:maj|min|dim|aug|sus|add|no|m|M|\d+|\+|-|°|ø|\(|\)|#|b|\/(?=\d))*)(?:\/([A-G])([#b]?))?$/;
  const IDX = { C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11 };
  const NICE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const normChord = c => c.replace(/♯/g, "#").replace(/♭/g, "b");
  const isChord = c => CHORD_RE.test(normChord(c));
  const mod12 = n => ((n % 12) + 12) % 12;
  // Spell transposed chords the way the new key is written: G#m and D#m in sharp keys, Eb and Bb in flat keys.
  function namesFor(key, tr) {
    const m = normChord(String(key || "")).match(CHORD_RE);
    if (!m || IDX[m[1] + m[2]] == null) return NICE;
    const i = mod12(IDX[m[1] + m[2]] + tr), minor = /^m(?!aj)/.test(m[3]);
    const sharp = minor ? [4, 11, 6, 1, 8] : [7, 2, 9, 4, 11, 6], flat = minor ? [2, 7, 0, 5, 10, 3] : [5, 10, 3, 8, 1];
    return sharp.includes(i) ? SHARPS : flat.includes(i) ? FLATS : NICE;
  }
  const tn = (n, tr, names) => (IDX[n] == null ? n : names[mod12(IDX[n] + tr)]);
  function transposeChord(c, tr, names) {
    if (!tr) return c;
    const m = normChord(c).match(CHORD_RE); if (!m) return c;
    names = names || namesFor(c, tr);
    return tn(m[1] + m[2], tr, names) + m[3] + (m[4] ? "/" + tn(m[4] + (m[5] || ""), tr, names) : "");
  }
  // Non-chord marks allowed on a chord line: bar lines, repeat counts (x3, 2x, 2x:, (x2)), N.C., slashes, dashes.
  const EXTRA_TOKENS = /^(\||\|\||x\d+:?|\d+x:?|\(x\d+\)|\(\d+x\)|N\.?C\.?|\/|-|–|\.\.\.?|%|\(|\))$/i;
  function isChordLine(line) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return false;
    let chords = 0;
    for (const t of toks) {
      const bare = t.replace(/^[(|]+|[)|]+$/g, "");
      if (bare && isChord(bare)) chords++;
      else if (!EXTRA_TOKENS.test(t)) return false;
    }
    return chords > 0;
  }
  function transposeLine(line, tr, names) {
    if (!tr) return line;
    let out = ""; const re = /\S+/g; let m;
    while ((m = re.exec(line))) {
      const t = m[0];
      const mm = t.match(/^([(|]*)(.*?)([)|]*)$/);
      const tok = mm && mm[2] && isChord(mm[2]) ? mm[1] + transposeChord(mm[2], tr, names) + mm[3] : t;
      if (out.length && out.length >= m.index) out += " "; else out += " ".repeat(m.index - out.length);
      out += tok;
    }
    return out;
  }
  const SECTION_WORD = /^(intro|verse|chorus|pre-?chorus|bridge|solo|sax solo|guitar solo|outro|coda|interlude|instrumental|tag|break|ending|refrain|middle 8)\b[\w\s#\d.:()-]*:?$/i;
  // A chord's degree in the key, by letter name: in G, C is 4, Bb is 3 (bIII) and F is 7 (bVII).
  const LETTERS = "CDEFGAB";
  const rootOf = c => { const m = normChord(String(c || "").trim()).match(CHORD_RE); return m ? m[1] + m[2] : ""; };
  const degreeOf = (c, tonic) => { const r = rootOf(c); return r && tonic ? (LETTERS.indexOf(r[0]) - LETTERS.indexOf(tonic[0]) + 7) % 7 + 1 : 0; };
  // Guitar tab lines (e|--3--|) are never coloured.
  const TAB_LINE = /^\s*[A-Ga-g]?[#b]?\s*\|?[-0-9|hpbrx\/\\~^()=.: ]{6,}\|?\s*$/;
  function renderChartHTML(text, tr, key) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    // Bracket mode only when a bracket holds a real chord: [Chorus], [Bridge], [Ending] are section labels, not chords.
    const bracketMode = (String(text || "").match(/\[[^\]\n]+\]/g) || []).some(b => isChord(b.slice(1, -1).trim()));
    const chordsOf = line => bracketMode ? (line.match(/\[([^\]]+)\]/g) || []).map(b => b.slice(1, -1).trim()).filter(isChord)
      : isChordLine(line) ? line.trim().split(/\s+/).map(t => t.replace(/^[(|]+|[)|]+$/g, "")).filter(t => t && isChord(t)) : [];
    const all = lines.flatMap(chordsOf);
    // The song's key decides sharp or flat spelling; without one, the chart's first chord stands in for it.
    if (!key || !isChord(String(key).trim())) key = all[0] || "";
    const names = namesFor(String(key).trim(), tr);
    // Colours count from the song's key when the chart is written in it; a capo chart written in other shapes
    // (key Eb played as C shapes) counts from its own first chord instead.
    const keyRoot = rootOf(key), roots = new Set(all.map(rootOf));
    const tonic = keyRoot && roots.has(keyRoot) ? keyRoot : rootOf(all[0]);
    const span = (d, t) => (d ? '<span class="d' + d + '">' + esc(t) + "</span>" : esc(t));
    let cur = 0, pending = null;
    // Lyric text takes the colour of the chord above it, from the start of the word the chord lands on.
    function colorLyric(line, marks) {
      let out = "", from = 0, color = cur;
      for (const m of marks || []) {
        let b = Math.min(m.pos, line.length);
        while (b > from && b < line.length && /\S/.test(line[b]) && /\S/.test(line[b - 1])) b--;
        if (b > from) out += span(color, line.slice(from, b));
        from = Math.max(from, b); color = m.d;
      }
      if (from < line.length) out += span(color, line.slice(from));
      cur = color;
      return out;
    }
    const label = t => '<div class="sec">' + esc(t) + "</div>";
    const out = lines.map(line => {
      const above = pending; pending = null;
      const dir = line.match(/^\s*\{(\w+)(?::\s*(.*?))?\}\s*$/);
      if (dir) {
        const k = dir[1].toLowerCase(), v = dir[2] || "";
        if (["c", "comment", "ci", "comment_italic", "cb", "comment_box", "section"].includes(k)) return label(v);
        if (k === "soc" || k === "start_of_chorus") return label(v || "Chorus");
        if (k === "sov" || k === "start_of_verse") return label(v || "Verse");
        if (k === "sob" || k === "start_of_bridge") return label(v || "Bridge");
        return "";
      }
      const only = line.trim().match(/^\[([^\]]+)\]$/);
      if (only && !isChord(only[1])) return label(only[1]);
      if (!line.trim()) return '<div class="blank"></div>';
      if (bracketMode && /\[[^\]]+\]/.test(line)) {
        const re = /\[([^\]]*)\]/g; let m, last = 0, chord = "", orig = ""; const segs = [];
        while ((m = re.exec(line))) {
          const t = line.slice(last, m.index);
          if (t || chord) segs.push([chord, t, orig]);
          if (isChord(m[1])) { chord = transposeChord(m[1], tr, names); orig = m[1]; } else { segs.push(["", "[" + m[1] + "]", ""]); chord = ""; orig = ""; }
          last = re.lastIndex;
        }
        segs.push([chord, line.slice(last), orig]);
        let color = cur;
        const html = segs.map(([c, t, o]) => {
          const d = o ? degreeOf(o, tonic) : 0; if (d) color = d;
          return '<span class="seg"><span class="ch">' + span(d, c) + '</span><span class="ly">' + (t ? span(color, t) : " ") + "</span></span>";
        }).join("");
        cur = color;
        return '<div class="cl">' + html + "</div>";
      }
      if (isChordLine(line)) {
        // Colour each chord name; remember where each one sits for the lyric line underneath.
        const shown = transposeLine(line, tr, names), orig = line.match(/\S+/g) || [], marks = [];
        let html = "", last = 0, k = 0, m; const re = /\S+/g;
        while ((m = re.exec(shown))) {
          const o = orig[k++] || m[0], bare = o.replace(/^[(|]+|[)|]+$/g, "");
          const d = bare && isChord(bare) ? degreeOf(bare, tonic) : 0;
          html += esc(shown.slice(last, m.index)) + span(d, m[0]);
          last = m.index + m[0].length;
          if (d) marks.push({ pos: m.index + (m[0].length - m[0].replace(/^[(|]+/, "").length), d });
        }
        html += esc(shown.slice(last));
        pending = { marks, before: cur };
        if (marks.length) cur = marks[marks.length - 1].d;
        return '<div class="chordline">' + html + "</div>";
      }
      if (SECTION_WORD.test(line.trim()) && line.trim().length < 32) return label(line.trim().replace(/:$/, ""));
      if (TAB_LINE.test(line) || /^\s*\([^)]*\):?\s*$/.test(line)) return '<div class="lyric">' + esc(line) + "</div>";
      if (above) cur = above.before;
      return '<div class="lyric">' + colorLyric(line, above ? above.marks : null) + "</div>";
    });
    return { html: out.join(""), mono: !bracketMode, colored: !!tonic, tonic: tonic ? transposeChord(tonic, tr, names) : "" };
  }
  // Tidy a chart pasted from a chord site. A whole Ultimate Guitar page (select all, copy, paste) brings the
  // page title, chord-diagram list, strumming counter and page markers along; keep the chart itself plus the
  // capo, key and any non-standard tuning. Also drops [ch]/[tab] markup, Markdown, HTML entities and
  // contributor email addresses.
  function cleanPaste(text) {
    const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
    const ent = (m, n, base) => { const c = parseInt(n, base); return c > 0 && c <= 0x10FFFF ? String.fromCodePoint(c) : m; };
    const t = String(text || "").replace(/\r\n?/g, "\n")
      .replace(/&#x([0-9a-f]+);/gi, (m, h) => ent(m, h, 16)).replace(/&#(\d+);/g, (m, d) => ent(m, d, 10))
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
      .replace(/\[\/?(ch|tab)\]/gi, "").replace(/\*\*/g, "")
      .replace(/\[([^\]\n]*)\]\((?:[^()\s]|\([^()\s]*\))*\)/g, "$1")
      .replace(/^.*$/gm, line => TAB_LINE.test(line) ? line : line.replace(/\\([[\]()#*_&\\-])/g, "$1"));
    let lines = t.split("\n").map(l => (TAB_LINE.test(l) ? l.replace(/\t/g, "    ") : l.replace(/\t/g, "    ").replace(/\s*\\$/, "").replace(/^#{1,6}\s+/, "")).replace(/\s+$/, ""))
      .filter(l => !/^\s*(`{3}.*|canvas|svg|Page \d+\s*\/\s*\d+)\s*$/i.test(l))
      .flatMap(l => {
        if (!/@/.test(l) || !EMAIL.test(l)) return [l];
        EMAIL.lastIndex = 0;
        const rest = l.replace(EMAIL, "").replace(/\s+$/, "");
        // Drop a short solicitation line; from a longer line (chart text) remove only the address.
        return /\[[^\]]+\]/.test(rest) || isChordLine(rest) || rest.length > 160 ? [rest] : [];
      });
    // Strip the page header only when the paste really starts with one.
    if (lines.slice(0, 60).some(l => /^\s*(Difficulty|Tuning)\s*:|^\s*Strumming pattern\s*$/i.test(l))) {
      const nextText = i => { for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim(); return ""; };
      const furniture = s => !s || /^(x|chords|strumming pattern|canvas|svg|\d+ of \d+|\d{1,2}|&)$/i.test(s) || /\bbpm$/i.test(s) || /^(capo|key|tuning)\b/i.test(s) || isChord(s);
      const meta = [], listed = new Set();
      let i = 0, seen = 0, inList = false;
      for (; i < lines.length; i++) {
        const s = lines[i].trim();
        if (!s) continue;
        seen++;
        const m = s.match(/^(Capo|Key|Tuning)\s*:\s*(.+)$/i) || s.match(/^(Capo)\s+(\d+|\w+ fret)$/i);
        if (m) {
          if (/^capo$/i.test(m[1]) && meta.some(x => x.startsWith("Capo:"))) continue;
          if (!(/^tuning$/i.test(m[1]) && /^E\s*A\s*D\s*G\s*B\s*E$/i.test(m[2].trim()))) meta.push(m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ": " + m[2].trim());
          continue;
        }
        if (seen <= 3 && /\b(chords|tabs?)(\s+by\s+.+)?$/i.test(s) && !isChordLine(s)) continue; // page title
        if (/^x$/i.test(s) || /^by\s+\S/i.test(s) || /^(difficulty|author|last update|description)\s*:/i.test(s)) continue;
        if (/^chords$/i.test(s)) { inList = true; continue; }
        if (/^strumming pattern$/i.test(s)) { inList = false; continue; }
        if (/^(canvas|svg)$/i.test(s) || /^\d+ of \d+$/i.test(s) || /^(\d{1,2}|&)$/.test(s) || /\bbpm$/i.test(s)) continue;
        // The chord-diagram list names each chord once, so a repeated chord is the chart's first line.
        if (isChord(s) && inList) { if (listed.has(s)) break; listed.add(s); continue; }
        if (isChord(s) && furniture(nextText(i))) continue;
        if (/\bbpm$/i.test(nextText(i)) && s.length < 40 && !isChordLine(s)) continue; // a strumming pattern's name
        break;
      }
      lines = (meta.length ? meta.concat("") : []).concat(lines.slice(i));
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\s+$/g, "");
  }
  // Titles compare without case, accents, apostrophes, dots or brackets: "Im On Fire" finds "I'm On Fire".
  const normTitle = t => String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/['’`.]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  // Split a paste of several chord-site pages into one piece per song, at each page's title line
  // ("Song Chords by Artist", or "Song Chords" then "by Artist"). Returns [{ title, artist, text }].
  function splitPastes(text) {
    const all = String(text || "").replace(/\r\n?/g, "\n"), lines = all.split("\n");
    const plain = l => l.replace(/\*\*/g, "").replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1").replace(/^#{1,6}\s+/, "").trim();
    const TITLE = /^(.+?)\s+(?:Chords|Tabs?|Bass Tabs?|Ukulele Chords)(?:\s+by\s+(.+))?$/i;
    const starts = [];
    lines.forEach((l, i) => {
      const p = plain(l), m = p.match(TITLE);
      if (!m || isChordLine(p)) return;
      const near = lines.slice(i + 1, i + 6).map(plain);
      if (!near.some(x => /^(by\s+\S|Difficulty\s*:|Tuning\s*:|Description\s*:|Capo\s*:|Key\s*:)/i.test(x))) return;
      const by = m[2] || (near.find(x => /^by\s+\S/i.test(x)) || "").replace(/^by\s+/i, "");
      starts.push({ start: i > 0 && /^x$/i.test(plain(lines[i - 1])) ? i - 1 : i, title: m[1].trim(), artist: by.trim() });
    });
    if (!starts.length) return all.trim() ? [{ title: "", artist: "", text: all }] : [];
    const out = [], pre = lines.slice(0, starts[0].start).join("\n");
    if (pre.trim()) out.push({ title: "", artist: "", text: pre });
    starts.forEach((s, k) => out.push({ title: s.title, artist: s.artist, text: lines.slice(s.start, k + 1 < starts.length ? starts[k + 1].start : lines.length).join("\n") }));
    return out;
  }
  // True when a chart's line breaks were lost (a chat app squashes a pasted page into a few very long lines).
  const squashed = t => String(t || "").split("\n").some(l => l.length > 300);
  return { isChord, transposeChord, renderChartHTML, cleanPaste, splitPastes, normTitle, squashed };
  })();
