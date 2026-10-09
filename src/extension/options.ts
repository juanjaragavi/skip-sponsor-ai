import "@fontsource-variable/roboto";
import "./ui/tokens.css";
import "./options.css";
import type { UserPolicy } from "../shared/types";
import { brandMark } from "./ui/brand";
import { icon, type IconName } from "./ui/icons";
import { gatePosition } from "./view-model";
import {
  loadChannelLabels,
  loadPolicy,
  onPolicyChange,
  setChannelAllowed,
  updatePolicy,
  type ChannelLabels,
} from "./settings";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

const els = {
  root: $(".options"),
  enabled: $<HTMLButtonElement>("#enabled"),
  modes: [...document.querySelectorAll<HTMLButtonElement>(".mode-card")],
  threshold: $<HTMLInputElement>("#threshold"),
  thrValue: $("#thr-value"),
  thrHint: $("#thr-hint"),
  channelList: $("#channel-list"),
  channelEmpty: $("#channel-empty"),
};

let policy: UserPolicy;
let labels: ChannelLabels = {};

/** Avatar tints from the design's channel rows (blue, mint, amber, violet). */
const TINTS = [
  ["rgba(59,130,246,.18)", "#7FB0FF"],
  ["rgba(61,220,151,.18)", "#3DDC97"],
  ["rgba(255,181,71,.18)", "#FFB547"],
  ["rgba(123,97,255,.18)", "#9B87FF"],
] as const;

function hydrateIcons(): void {
  $("#mark").append(brandMark(28));
  $("#about-mark").append(brandMark(32));
  document.querySelectorAll<HTMLElement>("[data-icon]").forEach((node) => {
    node.prepend(
      icon(
        node.dataset["icon"] as IconName,
        Number(node.dataset["size"] ?? 16),
      ),
    );
  });
  $("#version").textContent = `Version ${chrome.runtime.getManifest().version}`;
}

function initials(name: string): string {
  const words = name
    .replace(/^@/, "")
    .split(/[\s_\-.]+/)
    .filter(Boolean);
  const chars =
    words.length > 1
      ? words[0]![0]! + words[1]![0]!
      : (words[0] ?? "?").slice(0, 2);
  return chars.toUpperCase();
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function renderChannels(): void {
  const ids = policy.blockedChannels;
  els.channelList.hidden = ids.length === 0;
  els.channelEmpty.hidden = ids.length > 0;
  els.channelList.replaceChildren(
    ...ids.map((id) => {
      const handle = id.startsWith("@") ? id : id.replace(/^channel\//, "");
      const name = labels[id] ?? handle;
      const [bg, fg] = TINTS[hash(id) % TINTS.length]!;
      const row = document.createElement("div");
      row.className = "channel";
      row.setAttribute("role", "listitem");
      const avatar = document.createElement("span");
      avatar.className = "avatar";
      avatar.style.background = bg;
      avatar.style.color = fg;
      avatar.textContent = initials(name);
      const text = document.createElement("span");
      text.className = "channel__text";
      const n = document.createElement("span");
      n.className = "channel__name";
      n.textContent = name;
      const h = document.createElement("span");
      h.className = "channel__handle";
      h.textContent = handle;
      text.append(n, h);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.append(icon("x", 14), "Remove");
      remove.setAttribute(
        "aria-label",
        `Remove ${name} — skip sponsor reads on this channel again`,
      );
      remove.addEventListener("click", () => void setChannelAllowed(id, false));
      row.append(avatar, text, remove);
      return row;
    }),
  );
}

function renderThreshold(value: number): void {
  const pct = Math.round(value * 100);
  els.threshold.value = String(pct);
  els.threshold.style.setProperty("--fill", `${gatePosition(value) * 100}%`);
  els.threshold.setAttribute("aria-valuetext", `${pct} percent`);
  els.thrValue.textContent = `${pct}%`;
  els.thrHint.textContent = `Skip only when the AI is at least ${pct}% sure the segment is a sponsor read.`;
}

function render(): void {
  els.root.classList.toggle("is-off", !policy.globalEnabled);
  els.enabled.setAttribute("aria-checked", String(policy.globalEnabled));
  for (const card of els.modes) {
    const on = card.dataset["mode"] === policy.mode;
    card.setAttribute("aria-checked", String(on));
    card.tabIndex = on ? 0 : -1;
  }
  renderThreshold(policy.confidenceThreshold);
  renderChannels();
}

/** Highlight the nav item for the section in view. */
function trackSections(): void {
  const items = [...document.querySelectorAll<HTMLAnchorElement>(".nav__item")];
  const mark = (id: string): void =>
    items.forEach((a) =>
      a.setAttribute("aria-current", String(a.hash === `#${id}`)),
    );
  mark(location.hash.slice(1) || "general");
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible[0]) mark(visible[0].target.id);
    },
    { rootMargin: "-20% 0px -70% 0px" },
  );
  document.querySelectorAll("section[id]").forEach((s) => observer.observe(s));
  items.forEach((a) =>
    a.addEventListener("click", () => mark(a.hash.slice(1))),
  );
}

let saveTimer = 0;
function bind(): void {
  els.enabled.addEventListener(
    "click",
    () => void updatePolicy({ globalEnabled: !policy.globalEnabled }),
  );
  for (const card of els.modes) {
    card.addEventListener(
      "click",
      () =>
        void updatePolicy({ mode: card.dataset["mode"] as UserPolicy["mode"] }),
    );
  }
  $(".modes").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      return;
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const i = els.modes.findIndex((m) => m.dataset["mode"] === policy.mode);
    const next = els.modes[(i + step + els.modes.length) % els.modes.length]!;
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
  onPolicyChange((p) => {
    policy = p;
    void loadChannelLabels().then((l) => {
      labels = l;
      render();
    });
  });
}

async function init(): Promise<void> {
  hydrateIcons();
  [policy, labels] = await Promise.all([loadPolicy(), loadChannelLabels()]);
  bind();
  render();
  trackSections();
}

void init();
