// In-page flight recorder — the capture half of the proposed state-recorder feature,
// written against tldraw 5.3.2's PUBLIC seams only (editor.on, store.listen, getPath,
// menus). The spike journey (docs/recorder_spike.mjs) injects it into the live app over
// CDP; the product version is this same code as a module installed from onMount.
//
// One row per fact, five lanes on ONE clock (performance.now() since t0):
//   input   every event the state chart sees        editor.on('event')
//   state   every state-chart transition            editor.getPath()
//   menu    every open/close of a tldraw menu       editor.menus.getOpenMenus()
//   store   every record diff, document + session   editor.store.listen({scope:'all'})
//   console every console.* call, uncaught error,   console patch + window 'error'
//           unhandled rejection, editor crash        + editor.on('crash')
//   mark    a note typed by the person recording    recorder.mark(text)
(function installRecorder(getEditor) {
  const editor = getEditor();
  if (!editor) throw new Error("no editor handle");
  const t0 = performance.now();
  const wall0 = Date.now();
  const rows = [];
  let costMs = 0; // time spent inside recorder callbacks — the overhead the app pays
  const now = () => +(performance.now() - t0).toFixed(1);
  const push = (lane, data) => rows.push(Object.assign({ t: now(), lane }, data));
  const timed = (fn) => (...args) => {
    const start = performance.now();
    try { return fn(...args); } finally { costMs += performance.now() - start; }
  };

  // ---- header: everything an agent needs to place the recording in the world
  const inst = editor.getInstanceState();
  const header = {
    startedAt: new Date(wall0).toISOString(),
    url: location.href,
    userAgent: navigator.userAgent,
    devicePixelRatio: devicePixelRatio,
    viewport: { w: innerWidth, h: innerHeight },
    screenBounds: inst.screenBounds,
    camera: editor.getCamera(),
    pageId: editor.getCurrentPageId(),
    shapeCount: editor.getCurrentPageShapeIds().size,
    pathAtStart: editor.getPath(),
    selectedAtStart: editor.getSelectedShapeIds(),
  };

  // ---- t=0 snapshot: document + session records, so the run can be REPLAYED onto a
  //      fresh store (loadStoreSnapshot, then applyDiff per row) — time travel, not a picture.
  const snapshot = editor.store.getStoreSnapshot("all");

  // ---- lane: input — every event the state chart sees, straight from the editor's bus
  const compactEvent = (info) => {
    const out = { name: info.name, type: info.type };
    if (info.point) out.screen = [Math.round(info.point.x), Math.round(info.point.y)];
    if (info.name && info.name.startsWith("pointer")) {
      const page = editor.inputs.currentPagePoint;
      out.page = [Math.round(page.x), Math.round(page.y)];
    }
    if (info.target) out.target = info.target;
    if (info.shape) out.shape = { id: info.shape.id, type: info.shape.type };
    if (info.handle) out.handle = info.handle.id;
    if (typeof info.button === "number") out.button = info.button;
    if (info.key) out.key = info.key;
    if (info.code) out.code = info.code;
    const mods = ["shiftKey", "altKey", "ctrlKey", "metaKey"].filter((k) => info[k]);
    if (mods.length) out.mods = mods;
    if (info.isPen) out.pen = true;
    return out;
  };

  let lastPath = editor.getPath();
  let lastMenus = editor.menus.getOpenMenus().join(",");
  const checkDerived = (trigger) => {
    const path = editor.getPath();
    if (path !== lastPath) {
      push("state", { from: lastPath, to: path, trigger });
      lastPath = path;
    }
    const menus = editor.menus.getOpenMenus().join(",");
    if (menus !== lastMenus) {
      push("menu", { open: menus ? menus.split(",") : [], trigger });
      lastMenus = menus;
    }
  };
  const onEvent = timed((info) => {
    if (info.name === "tick") return; // 60 Hz heartbeat; carries nothing
    push("input", compactEvent(info));
    checkDerived(info.name);
  });
  editor.on("event", onEvent);

  // ---- lane: store — every record diff, any scope (document AND session: selection,
  //      hover, editing, camera all live here as ordinary records)
  const summarise = (changes) => {
    const ops = [];
    for (const rec of Object.values(changes.added)) ops.push({ op: "add", id: rec.id, type: rec.type || rec.typeName });
    for (const rec of Object.values(changes.removed)) ops.push({ op: "remove", id: rec.id, type: rec.type || rec.typeName });
    for (const [before, after] of Object.values(changes.updated)) {
      if (after.typeName === "pointer") continue; // 60 Hz duplicate of the input lane
      const keys = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      const delta = {};
      for (const k of keys) {
        const a = JSON.stringify(after[k]);
        delta[k] = a.length <= 120 ? after[k] : `<${a.length} chars>`;
      }
      ops.push({ op: "update", id: after.id, type: after.type || after.typeName, delta });
    }
    return ops;
  };
  const offStore = editor.store.listen(
    timed((entry) => {
      const ops = summarise(entry.changes);
      if (ops.length) push("store", { source: entry.source, ops });
      checkDerived("store");
    }),
    { scope: "all", source: "all" }
  );

  // ---- lane: console + errors
  const original = {};
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    original[level] = console[level];
    console[level] = (...args) => {
      try {
        push("console", { level, args: args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).slice(0, 8) });
      } catch (_) {}
      original[level].apply(console, args);
    };
  }
  const onError = (e) => push("console", { level: "error", args: [String(e.message || e.reason || e)], uncaught: true });
  addEventListener("error", onError);
  addEventListener("unhandledrejection", onError);
  const onCrash = ({ error }) => push("console", { level: "error", args: ["editor crash: " + String(error)] });
  editor.on("crash", onCrash);

  // ---- user marks (the product's "what went wrong?" note lands here too)
  const mark = (text) => push("mark", { text });

  const stop = () => {
    editor.off("event", onEvent); editor.off("crash", onCrash); offStore();
    for (const level of Object.keys(original)) console[level] = original[level];
    removeEventListener("error", onError);
    removeEventListener("unhandledrejection", onError);
    return {
      header: Object.assign(header, {
        durationMs: now(),
        recorderCostMs: +costMs.toFixed(1),
        pathAtEnd: editor.getPath(),
        selectedAtEnd: editor.getSelectedShapeIds(),
      }),
      rows,
      snapshot,
    };
  };
  window.__ssRecorder = { stop, mark, rows, t0Wall: wall0 };
  return header;
})
