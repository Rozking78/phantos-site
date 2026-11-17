/* Shared band storage for the hosted songbook. Provides window.claude.use("db") backed by the nlb-band Worker,
   so the page's existing shared-database code (dbBackend) works unchanged. Polls for other people's edits. */
(function () {
  var API = window.NLB_API || "https://nlb-band.rozking.workers.dev/api/nlb";
  var COLS = ["songs", "setlists", "charts"];
  var state = { version: -1, docs: { songs: {}, setlists: {}, charts: {} } };
  var subs = { songs: [], setlists: [], charts: [] };       // collection listeners
  var docSubs = {};                                         // "col/id" -> listeners
  var loaded = false, timer = null;
  var META = { fromCache: false, hasPendingWrites: false };
  function key() { try { return localStorage.getItem("nlb-edit-key") || ""; } catch (_) { return ""; } }
  function headers() { var h = { "content-type": "application/json" }, k = key(); if (k) h["x-nlb-key"] = k; return h; }
  function snap(col) {
    var ids = Object.keys(state.docs[col]);
    return { metadata: META, docs: ids.map(function (id) { return { id: id, data: function () { return state.docs[col][id]; } }; }) };
  }
  function docSnap(col, id) { var d = state.docs[col][id]; return { exists: !!d, data: function () { return d; }, metadata: META }; }
  function notify(col) {
    subs[col].forEach(function (f) { try { f(snap(col)); } catch (_) {} });
    Object.keys(docSubs).forEach(function (k) {
      if (k.indexOf(col + "/") === 0) docSubs[k].forEach(function (f) { try { f(docSnap(col, k.slice(col.length + 1))); } catch (_) {} });
    });
  }
  function pull() {
    return fetch(API + "/state?since=" + state.version, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("state " + r.status);
      return r.json();
    }).then(function (j) {
      if (j.unchanged) return;
      var first = !loaded;
      state.version = j.version; loaded = true;
      COLS.forEach(function (c) {
        var next = j.docs[c] || {};
        if (first || JSON.stringify(next) !== JSON.stringify(state.docs[c])) { state.docs[c] = next; notify(c); }
      });
    });
  }
  function poll() {
    clearTimeout(timer);
    timer = setTimeout(function () { (document.hidden ? Promise.resolve() : pull().catch(function () {})).then(poll); }, 4000);
  }
  /* ---------- undo / redo (this tab) ---------- */
  var undoStack = [], redoStack = [], replaying = false, lastAt = 0;
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function record(col, id, before, after) {
    if (replaying) return;
    var now = Date.now(), step = { col: col, id: id, before: clone(before), after: clone(after) };
    // One click can save several documents; writes within 600 ms are one step.
    if (undoStack.length && now - lastAt < 600) undoStack[undoStack.length - 1].push(step); else undoStack.push([step]);
    if (undoStack.length > 200) undoStack.shift();
    lastAt = now; redoStack = []; paint();
  }
  function apply(steps, useBefore) {
    replaying = true;
    var jobs = steps.slice().reverse().map(function (st) {
      var target = useBefore ? st.before : st.after;
      if (target === undefined || target === null) return del(st.col, st.id);
      var body = clone(target); if (body && typeof body === "object") body.updatedAt = Date.now();
      return put(st.col, st.id, body);
    });
    replaying = false;
    return Promise.all(jobs);
  }
  function undo() { var s = undoStack.pop(); if (!s) return; redoStack.push(s); paint(); apply(s, true).catch(function (e) { toast(e.message); }); }
  function redo() { var s = redoStack.pop(); if (!s) return; undoStack.push(s); paint(); apply(s, false).catch(function (e) { toast(e.message); }); }
  var bar = null;
  function toast(msg) { if (bar) { bar.title = msg; bar.querySelector(".nlb-msg").textContent = msg; setTimeout(function () { if (bar) bar.querySelector(".nlb-msg").textContent = ""; }, 4000); } }
  function paint() {
    if (!bar) return;
    bar.querySelector(".nlb-undo").disabled = !undoStack.length;
    bar.querySelector(".nlb-redo").disabled = !redoStack.length;
    bar.querySelector(".nlb-undo").textContent = "↶ Undo" + (undoStack.length ? " (" + undoStack.length + ")" : "");
  }
  function mountBar() {
    if (bar || !document.body) return;
    var css = document.createElement("style");
    css.textContent = ".nlb-ur{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147483000;display:flex;gap:6px;align-items:center;font:600 14px/1 -apple-system,system-ui,sans-serif}" +
      ".nlb-ur button{min-height:44px;padding:0 14px;border-radius:22px;border:1px solid #3a4250;background:#1b2029;color:#e8ebef;cursor:pointer}" +
      ".nlb-ur button:disabled{opacity:.35;cursor:default}.nlb-ur .nlb-msg{color:#f0bc60;max-width:50vw;font-weight:500}";
    document.head.appendChild(css);
    bar = document.createElement("div"); bar.className = "nlb-ur";
    bar.innerHTML = '<span class="nlb-msg"></span><button type="button" class="nlb-undo" title="Undo (Ctrl/⌘ Z)">↶ Undo</button><button type="button" class="nlb-redo" title="Redo (Ctrl/⌘ Shift Z)">↷ Redo</button>';
    bar.querySelector(".nlb-undo").onclick = undo; bar.querySelector(".nlb-redo").onclick = redo;
    document.body.appendChild(bar); paint();
    document.addEventListener("keydown", function (e) {
      var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing || !(e.metaKey || e.ctrlKey) || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    });
  }
  window.NLB_UNDO = { undo: undo, redo: redo, sizes: function () { return [undoStack.length, redoStack.length]; } };

  function put(col, id, body) {
    var prev = state.docs[col][id];
    record(col, id, prev, body);
    state.docs[col][id] = body; notify(col);                // show the edit at once
    return fetch(API + "/" + col + "/" + encodeURIComponent(id), { method: "PUT", headers: headers(), body: JSON.stringify(body) })
      .then(function (r) {
        if (r.ok) return r.json().then(function (j) { state.version = j.version; });
        if (prev === undefined) delete state.docs[col][id]; else state.docs[col][id] = prev; notify(col);
        var e = new Error(r.status === 401 ? "Editing needs the band password." : "The shared songbook could not save that change.");
        e.code = r.status === 401 ? "not_granted" : "write_failed"; throw e;
      });
  }
  function del(col, id) {
    var prev = state.docs[col][id];
    record(col, id, prev, undefined);
    delete state.docs[col][id]; notify(col);
    return fetch(API + "/" + col + "/" + encodeURIComponent(id), { method: "DELETE", headers: headers() }).then(function (r) {
      if (r.ok) return r.json().then(function (j) { state.version = j.version; });
      if (prev !== undefined) state.docs[col][id] = prev; notify(col);
      var e = new Error("The shared songbook could not remove that."); e.code = r.status === 401 ? "not_granted" : "write_failed"; throw e;
    });
  }
  function newId() { return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var db = {
    collection: function (col) {
      return {
        onSnapshot: function (cb) { subs[col].push(cb); setTimeout(function () { cb(snap(col)); }, 0); return function () { subs[col] = subs[col].filter(function (f) { return f !== cb; }); }; },
        doc: function (id) {
          id = id || newId();
          return {
            id: id,
            set: function (body) { return put(col, id, body); },
            delete: function () { return del(col, id); },
            onSnapshot: function (cb) { var k = col + "/" + id; (docSubs[k] = docSubs[k] || []).push(cb); setTimeout(function () { cb(docSnap(col, id)); }, 0); return function () { docSubs[k] = (docSubs[k] || []).filter(function (f) { return f !== cb; }); }; },
          };
        },
      };
    },
  };
  var ready = null;
  window.claude = window.claude || {};
  window.claude.use = function (name) {
    if (name === "db") { if (!ready) ready = pull().then(function () { poll(); if (document.body) mountBar(); else document.addEventListener("DOMContentLoaded", mountBar); return db; }); return ready; }
    if (name === "user") return Promise.resolve({ can: function () { return Promise.resolve(true); } });
    return Promise.reject(new Error("not available"));
  };
})();
