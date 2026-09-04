const BEATS = [
  { id: "main", label: "On Main", caption: "Zach is on Main of robot-arm. Planner still feeds Controller." },
  { id: "create", label: "Create Draft", caption: "New draft from Main. Name it “try a second planner”." },
  { id: "edit", label: "Edit in draft", caption: "Planner becomes Planner v2. A Safety check Block appears. Main is untouched." },
  { id: "return", label: "Back on Main", caption: "Leave the draft. Main still shows Planner, not Planner v2." },
  { id: "resume", label: "Back in Draft 1", caption: "Switch back. The draft still has Planner v2 and Safety check." },
  { id: "review", label: "Review changes", caption: "Two changes: Planner renamed, Safety check added. Keep or Discard, then Merge." },
  { id: "merged", label: "Merged", caption: "Main now shows Planner v2. The draft is gone. Version v0.8 exists." },
];

function currentIndex() {
  const raw = new URLSearchParams(location.search).get("beat");
  if (raw == null || raw === "") return 0;
  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber < BEATS.length) return asNumber;
  const asId = BEATS.findIndex((beat) => beat.id === raw);
  return asId >= 0 ? asId : 0;
}

function applyShow(beatId) {
  document.querySelectorAll("[data-show]").forEach((node) => {
    const ids = node.getAttribute("data-show").split(/\s+/).filter(Boolean);
    node.hidden = !ids.includes(beatId) && !ids.includes("all");
  });
  document.querySelectorAll("[data-hide]").forEach((node) => {
    const ids = node.getAttribute("data-hide").split(/\s+/).filter(Boolean);
    if (ids.includes(beatId)) node.hidden = true;
  });
  document.documentElement.dataset.beat = beatId;
  document.querySelectorAll("[data-beat-class]").forEach((node) => {
    const map = JSON.parse(node.getAttribute("data-beat-class"));
    node.className = node.dataset.baseClass + " " + (map[beatId] || "");
  });
}

function renderWalk(index) {
  const walk = document.querySelector("[data-walk]");
  if (!walk) return;
  const beat = BEATS[index];
  walk.querySelector("[data-cap]").textContent = `${index + 1} / ${BEATS.length} · ${beat.caption}`;
  walk.querySelector("[data-back]").disabled = index === 0;
  walk.querySelector("[data-next]").disabled = index === BEATS.length - 1;
  walk.querySelectorAll("[data-jump]").forEach((button) => {
    button.classList.toggle("is-on", Number(button.dataset.jump) === index);
  });
}

function go(index) {
  const next = Math.max(0, Math.min(index, BEATS.length - 1));
  const url = new URL(location.href);
  url.searchParams.set("beat", BEATS[next].id);
  history.replaceState(null, "", url);
  applyShow(BEATS[next].id);
  renderWalk(next);
}

function boot() {
  if (new URLSearchParams(location.search).has("embed")) {
    document.documentElement.classList.add("embed");
  }
  document.querySelectorAll("[data-beat-class]").forEach((node) => {
    node.dataset.baseClass = node.className;
  });
  const walk = document.querySelector("[data-walk]");
  if (walk) {
    const chips = walk.querySelector("[data-chips]");
    BEATS.forEach((beat, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.jump = String(index);
      button.textContent = `${index + 1} ${beat.label}`;
      button.addEventListener("click", () => go(index));
      chips.append(button);
    });
    walk.querySelector("[data-back]").addEventListener("click", () => go(currentIndex() - 1));
    walk.querySelector("[data-next]").addEventListener("click", () => go(currentIndex() + 1));
  }
  document.addEventListener("click", (event) => {
    const to = event.target.closest("[data-to]");
    if (!to) return;
    const index = BEATS.findIndex((beat) => beat.id === to.dataset.to);
    if (index >= 0) go(index);
  });
  go(currentIndex());
}

document.addEventListener("DOMContentLoaded", boot);
