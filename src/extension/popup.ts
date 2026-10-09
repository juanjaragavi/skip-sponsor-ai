import "@fontsource-variable/roboto";
import "./ui/tokens.css";
import "./popup.css";
import type { UserPolicy } from "../shared/types";
import { sameChannel } from "./policy";
import type { PageState } from "../shared/messages";
import { brandMark } from "./ui/brand";
import { icon, type IconName } from "./ui/icons";
import {
  activeRowId,
  formatTimecode,
  gatePosition,
  MODE_HELP,
  segmentRows,
  thresholdSummary,
  type SegmentRow,
} from "./view-model";
import {
  loadPolicy,
  onPolicyChange,
  setChannelAllowed,
  updatePolicy,
} from "./settings";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

const els = {
  popup: $("#popup"),
  enabled: $<HTMLButtonElement>("#enabled"),
  tc: $("#tc"),
  timeline: $("#timeline"),
  edits: $("#edits"),
  channel: $("#channel"),
  channelName: $("#channel-name"),
  channelToggle: $<HTMLButtonElement>("#channel-toggle"),
  tools: [...document.querySelectorAll<HTMLButtonElement>(".tool")],
  modeHelp: $("#mode-help"),
  thrValue: $("#thr-value"),
  threshold: $<HTMLInputElement>("#threshold"),
  gate: $("#gate"),
  ticks: $("#ticks"),
  dots: $("#dots"),
  thrHelp: $("#thr-help"),
  settings: $<HTMLButtonElement>("#settings"),
};

let policy: UserPolicy;
let state: PageState | null = null;
let tabId: number | null = null;

function div(className: string, text?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

function hydrateIcons(): void {
  $("#mark").append(brandMark(24));
  document.querySelectorAll<HTMLElement>("[data-icon]").forEach((node) => {
    const svg = icon(
      node.dataset["icon"] as IconName,
      Number(node.dataset["size"] ?? 16),
    );
    if (node.tagName === "BUTTON") node.prepend(svg);
    else node.replaceWith(svg);
  });
  for (let pct = 50; pct <= 95; pct += 5) {
    const tick = div("tick");
    tick.style.left = `calc(${gatePosition(pct / 100) * 100}% - ${pct === 95 ? 1 : 0}px)`;
    els.ticks.append(tick);
  }
}

/** Active tab (or ?tab=<id>, used by the end-to-end tests). */
async function findTab(): Promise<number | null> {
  const forced = Number(new URLSearchParams(location.search).get("tab"));
  if (forced) return forced;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

/** Tab URL (readable thanks to the youtube.com host permission). */
async function tabUrl(): Promise<string> {
  if (tabId === null) return "";
  return (await chrome.tabs.get(tabId).catch(() => null))?.url ?? "";
}

const isWatchUrl = (url: string): boolean =>
  /^https:\/\/www\.youtube\.com\/watch\?/.test(url);

/** Grace period for the content script to answer before suggesting a reload. */
const CONTENT_SCRIPT_GRACE_MS = 3000;
const openedAt = Date.now();
let currentTabUrl = "";

async function fetchState(): Promise<PageState | null> {
  if (tabId === null) return null;
  try {
    return ((await chrome.tabs.sendMessage(tabId, {
      type: "PAGE_STATE_GET",
    })) ?? null) as PageState | null;
  } catch {
    return null; // not a YouTube tab, or the content script isn't loaded yet
  }
}

function rows(): SegmentRow[] {
  if (!state) return [];
  return segmentRows(state.segments, policy, {
    channelId: state.channelId,
    currentTime: state.currentTime,
    skipped: new Set(state.skipped),
    overridden: new Set(state.overridden),
    blocked: new Set(state.blocked ?? []),
    paused: state.skippingPaused ?? false,
  });
}

function renderControls(): void {
  els.popup.classList.toggle("is-off", !policy.globalEnabled);
  els.enabled.setAttribute("aria-checked", String(policy.globalEnabled));
  for (const tool of els.tools) {
    const on = tool.dataset["mode"] === policy.mode;
    tool.setAttribute("aria-checked", String(on));
    tool.tabIndex = on ? 0 : -1;
  }
  els.modeHelp.textContent = MODE_HELP[policy.mode];
  renderThreshold(policy.confidenceThreshold);
}

function renderThreshold(value: number): void {
  const pct = Math.round(value * 100);
  const x = gatePosition(value) * 100;
  els.thrValue.textContent = `${pct}%`;
  els.threshold.value = String(pct);
  els.threshold.setAttribute("aria-valuetext", `${pct} percent`);
  els.gate.style.setProperty("--x", `${x}%`);
  $(".zone--keep").style.width = `${x}%`;
  $(".zone--cut").style.width = `${100 - x}%`;
  $(".gate__line").style.left = `${x}%`;
  $(".gate__handle").style.left = `${x}%`;
  const view = { ...policy, confidenceThreshold: value };
  els.dots.replaceChildren(
    ...(state?.segments ?? [])
      .filter((s) => s.category === "sponsor")
      .map((s) => {
        const over = s.confidence >= value;
        const tag =
          !over || !view.globalEnabled || view.mode === "off"
            ? ""
            : view.mode === "notify"
              ? "is-ask"
              : "is-cut";
        const dot = div(`dot ${tag}`);
        dot.style.left = `${gatePosition(s.confidence) * 100}%`;
        dot.title = `${Math.round(s.confidence * 100)}%`;
        return dot;
      }),
  );
  els.thrHelp.textContent = thresholdSummary(state?.segments ?? [], view);
}

function emptyRow(text: string, busy = false): HTMLDivElement {
  const row = div(`edit edit--empty${busy ? " is-busy" : ""}`, text);
  row.setAttribute("role", "listitem");
  return row;
}

function renderTimeline(list: SegmentRow[], activeId: string | null): void {
  const s = state!;
  const pct = (t: number): string =>
    `${Math.min(100, Math.max(0, (t / s.duration) * 100))}%`;
  const nodes: HTMLElement[] = [div("tl tl--cc")];
  for (const r of list) {
    const hit = div(`tl tl--hit${r.tag === "KEEP" ? " is-keep" : ""}`);
    hit.style.left = pct(r.startTime);
    hit.style.width = `calc(${pct(r.endTime)} - ${pct(r.startTime)})`;
    nodes.push(hit);
  }
  nodes.push(div("tl tl--track"));
  const played = div("tl tl--played");
  played.style.width = pct(s.currentTime);
  nodes.push(played);
  for (const r of list) {
    const range = div(`tl tl--range${r.tag === "KEEP" ? " is-keep" : ""}`);
    range.style.left = pct(r.startTime);
    range.style.width = `calc(${pct(r.endTime)} - ${pct(r.startTime)})`;
    nodes.push(range);
    if (r.id === activeId && r.tag !== "KEEP") {
      const inMark = div("tl tl--in");
      inMark.style.left = pct(r.startTime);
      const outMark = div("tl tl--out");
      outMark.style.left = pct(r.endTime);
      nodes.push(inMark, outMark);
    }
  }
  const head = div("tl tl--playhead");
  head.style.left = pct(s.currentTime);
  nodes.push(head);
  els.timeline.replaceChildren(...nodes);
}

/**
 * A YouTube tab opened before the extension was installed (or updated) has no
 * content script until it reloads: say so instead of "open a video".
 */
function reloadRow(): HTMLDivElement {
  const row = emptyRow("SkipSponsor AI isn’t running in this tab yet.");
  row.id = "reload-row";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link link--small";
  button.textContent = "Reload tab";
  button.addEventListener("click", () => {
    if (tabId !== null) void chrome.tabs.reload(tabId);
  });
  row.append(button);
  return row;
}

function renderMonitor(): void {
  const s = state;
  if (!s?.videoId) {
    els.tc.textContent = "";
    els.timeline.hidden = true;
    els.channel.hidden = true;
    const watching = isWatchUrl(currentTabUrl);
    const needsReload =
      watching && !s && Date.now() - openedAt >= CONTENT_SCRIPT_GRACE_MS;
    // Keep the existing button so a click isn't lost to the 500ms re-render.
    if (needsReload && els.edits.querySelector("#reload-row")) return;
    els.edits.replaceChildren(
      !watching
        ? emptyRow("Open a YouTube video to see its sponsor reads here.")
        : needsReload
          ? reloadRow()
          : emptyRow("Reading captions…", true),
    );
    return;
  }
  els.tc.textContent = s.adPlaying
    ? "YouTube ad playing"
    : s.duration > 0
      ? `${formatTimecode(s.currentTime)} / ${formatTimecode(s.duration)}`
      : "";
  const list = rows();
  const activeId = activeRowId(list, s.currentTime);
  els.timeline.hidden = !(s.duration > 0 && !s.adPlaying);
  if (!els.timeline.hidden) renderTimeline(list, activeId);

  if (s.phase === "analyzing" || s.phase === "idle") {
    els.edits.replaceChildren(emptyRow("Reading captions…", true));
  } else if (s.phase === "unavailable") {
    els.edits.replaceChildren(
      emptyRow("Couldn’t analyze this video — it plays normally."),
    );
  } else if (list.length === 0) {
    els.edits.replaceChildren(
      emptyRow(
        s.fallback
          ? "No captions, and no community-labelled sponsors — nothing to skip."
          : "No sponsor reads found in this video.",
      ),
    );
  } else {
    els.edits.replaceChildren(
      ...list.map((r) => {
        const row = div(`edit${r.id === activeId ? " is-active" : ""}`);
        row.setAttribute("role", "listitem");
        row.dataset["tag"] = r.tag;
        const main = div("edit__main");
        main.append(div("edit__range", r.range), div("edit__status", r.status));
        row.append(
          div("edit__no", r.index),
          div("edit__tag", r.tag),
          main,
          div("edit__conf", r.confidence),
        );
        row.setAttribute(
          "aria-label",
          `${r.index} ${r.tag} ${r.range}, ${r.status}, ${r.confidence} confidence`,
        );
        return row;
      }),
    );
  }

  els.channel.hidden = !s.channelId;
  if (s.channelId) {
    const allowed = policy.blockedChannels.some((c) =>
      sameChannel(c, s.channelId!),
    );
    const name = s.channelName ?? s.channelId;
    els.channelName.textContent = allowed ? `${name} · skipping off` : name;
    els.channelToggle.textContent = allowed
      ? "Skip on this channel"
      : "Don’t skip this channel";
  }
}

function render(): void {
  renderControls();
  renderMonitor();
}

let saveTimer = 0;
function bind(): void {
  els.enabled.addEventListener("click", () => {
    void updatePolicy({ globalEnabled: !policy.globalEnabled });
  });
  for (const tool of els.tools) {
    tool.addEventListener("click", () => {
      void updatePolicy({ mode: tool.dataset["mode"] as UserPolicy["mode"] });
    });
  }
  $(".tools").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const i = els.tools.findIndex((t) => t.dataset["mode"] === policy.mode);
    const next =
      els.tools[
        (i + (e.key === "ArrowRight" ? 1 : -1) + els.tools.length) %
          els.tools.length
      ]!;
    next.focus();
    next.click();
    e.preventDefault();
  });
  els.threshold.addEventListener("input", () => {
    const value = Number(els.threshold.value) / 100;
    renderThreshold(value);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(
      () => void updatePolicy({ confidenceThreshold: value }),
      150,
    );
  });
  els.channelToggle.addEventListener("click", () => {
    if (!state?.channelId) return;
    const allowed = policy.blockedChannels.some((c) =>
      sameChannel(c, state!.channelId!),
    );
    void setChannelAllowed(state.channelId, !allowed, state.channelName);
  });
  els.settings.addEventListener(
    "click",
    () => void chrome.runtime.openOptionsPage(),
  );
  onPolicyChange((p) => {
    policy = p;
    render();
  });
}

async function tick(): Promise<void> {
  [state, currentTabUrl] = await Promise.all([fetchState(), tabUrl()]);
  renderMonitor();
  renderThreshold(
    Number(els.threshold.value) / 100 || policy.confidenceThreshold,
  );
}

async function init(): Promise<void> {
  hydrateIcons();
  policy = await loadPolicy();
  bind();
  render();
  tabId = await findTab();
  await tick();
  window.setInterval(() => void tick(), 500);
}

void init();
