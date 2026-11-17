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
  function put(col, id, body) {
    var prev = state.docs[col][id];
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
    if (name === "db") { if (!ready) ready = pull().then(function () { poll(); return db; }); return ready; }
    if (name === "user") return Promise.resolve({ can: function () { return Promise.resolve(true); } });
    return Promise.reject(new Error("not available"));
  };
})();
