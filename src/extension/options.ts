import "@fontsource-variable/roboto";
import "./ui/tokens.css";
import "./options.css";
import type { UserPolicy } from "../shared/types";
import { brandMark } from "./ui/brand";
import { icon, type IconName } from "./ui/icons";
import { sameChannel } from "./policy";
import {
  displayChannelId,
  gatePosition,
  parseChannelInput,
} from "./view-model";
import {
  loadChannelLabels,
  loadPolicy,
  loadTelemetryEnabled,
  onPolicyChange,
  resetAll,
  setChannelAllowed,
  setTelemetryEnabled,
  updatePolicy,
  type ChannelLabels,
} from "./settings";
import { USER_MESSAGES } from "./user-messages";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

const els = {
  root: $(".options"),
  enabled: $<HTMLButtonElement>("#enabled"),
  modes: [...document.querySelectorAll<HTMLButtonElement>(".mode-card")],
  threshold: $<HTMLInputElement>("#threshold"),
  thrValue: $("#thr-value"),
  thrHint: $("#thr-hint"),
  channelForm: $<HTMLFormElement>("#channel-form"),
  channelInput: $<HTMLInputElement>("#channel-input"),
  channelHint: $("#channel-hint"),
  channelList: $("#channel-list"),
  channelEmpty: $("#channel-empty"),
  telemetry: $<HTMLButtonElement>("#telemetry"),
  reset: $<HTMLButtonElement>("#reset"),
  serviceStatus: $("#service-status"),
  serviceHost: $("#service-host"),
  serviceRetry: $<HTMLButtonElement>("#service-retry"),
};

const TABS = ["general", "channels", "privacy", "about"] as const;
type Tab = (typeof TABS)[number];
const CHANNEL_HINT = USER_MESSAGES.options.channelHint;

let policy: UserPolicy;
let labels: ChannelLabels = {};
let telemetryOn = true;

/** Avatar tints from the design's channel rows (blue, mint, amber, violet). */
const TINTS = [
  ["rgba(59,130,246,.18)", "#7FB0FF"],
  ["rgba(61,220,151,.18)", "#3DDC97"],
  ["rgba(255,181,71,.18)", "#FFB547"],
  ["rgba(123,97,255,.18)", "#9B87FF"],
] as const;

function hydrateIcons(): void {
  $("#mark").append(brandMark(28));
  $("#about-mark").append(brandMark(36));
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

/* ---------- Tabs: one section at a time, deep-linkable (#channels) ---------- */

function currentTab(): Tab {
  const h = location.hash.slice(1);
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : "general";
}

function showTab(tab: Tab): void {
  for (const id of TABS) $(`#${id}`).hidden = id !== tab;
  document.querySelectorAll<HTMLAnchorElement>(".nav__item").forEach((a) => {
    if (a.hash === `#${tab}`) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = `SkipSponsor AI — ${tab[0]!.toUpperCase()}${tab.slice(1)}`;
  window.scrollTo(0, 0);
  if (tab === "about") void checkService();
}

/* ---------- Channels ---------- */

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
      const handle = displayChannelId(id);
      const name = labels[id] ?? handle;
      // No display name known (added by hand): show the channel link instead
      // of repeating the handle.
      const sub = labels[id]
        ? handle
        : `youtube.com/${id.startsWith("@") ? handle : `channel/${handle}`}`;
      const [bg, fg] = TINTS[hash(id.toLowerCase()) % TINTS.length]!;
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
      h.textContent = sub;
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

function channelHint(text: string, kind: "error" | "ok" | "" = ""): void {
  els.channelHint.textContent = text;
  els.channelHint.className = `hint${kind ? ` is-${kind}` : ""}`;
  els.channelInput.setAttribute("aria-invalid", String(kind === "error"));
}

async function addChannel(): Promise<void> {
  const raw = els.channelInput.value;
  if (!raw.trim()) return channelHint(CHANNEL_HINT);
  const id = parseChannelInput(raw);
  if (!id) return channelHint(USER_MESSAGES.options.invalidChannel, "error");
  if (policy.blockedChannels.some((c) => sameChannel(c, id)))
    return channelHint(
      `${displayChannelId(id)} is already in the list.`,
      "error",
    );
  await setChannelAllowed(id, true);
  els.channelInput.value = "";
  channelHint(
    `Added ${displayChannelId(id)}. Its sponsor reads will play normally.`,
    "ok",
  );
}

/* ---------- General ---------- */

function renderThreshold(value: number): void {
  const pct = Math.round(value * 100);
  els.threshold.value = String(pct);
  els.threshold.style.setProperty("--fill", `${gatePosition(value) * 100}%`);
  els.threshold.setAttribute("aria-valuetext", `${pct} percent`);
  els.thrValue.textContent = `${pct}%`;
  els.thrHint.textContent = `Skip only when the AI is at least ${pct}% sure the segment is a sponsor read.`;
}

/* ---------- Privacy ---------- */

let resetTimer = 0;
async function onReset(): Promise<void> {
  if (!els.reset.classList.contains("is-armed")) {
    // Two-step confirm: no modal, no accidental wipe.
    els.reset.classList.add("is-armed");
    els.reset.lastChild!.textContent = USER_MESSAGES.options.resetConfirm;
    resetTimer = window.setTimeout(disarmReset, 4000);
    return;
  }
  disarmReset();
  await resetAll();
  [policy, labels, telemetryOn] = await Promise.all([
    loadPolicy(),
    loadChannelLabels(),
    loadTelemetryEnabled(),
  ]);
  render();
  els.reset.lastChild!.textContent = USER_MESSAGES.options.resetDone;
  window.setTimeout(() => (els.reset.lastChild!.textContent = "Reset"), 2500);
}

function disarmReset(): void {
  window.clearTimeout(resetTimer);
  els.reset.classList.remove("is-armed");
  els.reset.lastChild!.textContent = "Reset";
}

/* ---------- About ---------- */

async function checkService(): Promise<void> {
  els.serviceStatus.dataset["state"] = "checking";
  els.serviceStatus.textContent = USER_MESSAGES.options.statusChecking;
  const res = (await chrome.runtime
    .sendMessage({ type: "HEALTH_GET" })
    .catch(() => null)) as { ok: boolean; host: string } | null;
  els.serviceStatus.dataset["state"] = res?.ok ? "online" : "offline";
  els.serviceStatus.textContent = res?.ok
    ? USER_MESSAGES.options.statusOnline
    : USER_MESSAGES.options.statusUnreachable;
  els.serviceHost.textContent = res?.host
    ? res.ok
      ? USER_MESSAGES.options.connectedTo(res.host)
      : USER_MESSAGES.options.cantReach(res.host)
    : USER_MESSAGES.options.statusUnavailable;
}

/* ---------- Render + bind ---------- */

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
  els.telemetry.setAttribute("aria-checked", String(telemetryOn));
}

let saveTimer = 0;
function bind(): void {
  window.addEventListener("hashchange", () => showTab(currentTab()));
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
  els.channelForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void addChannel();
  });
  els.channelInput.addEventListener("input", () => {
    if (els.channelInput.getAttribute("aria-invalid") === "true")
      channelHint(CHANNEL_HINT);
  });
  els.telemetry.addEventListener("click", () => {
    telemetryOn = !telemetryOn;
    els.telemetry.setAttribute("aria-checked", String(telemetryOn));
    void setTelemetryEnabled(telemetryOn);
  });
  els.reset.addEventListener("click", () => void onReset());
  els.serviceRetry.addEventListener("click", () => void checkService());
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
  [policy, labels, telemetryOn] = await Promise.all([
    loadPolicy(),
    loadChannelLabels(),
    loadTelemetryEnabled(),
  ]);
  bind();
  render();
  showTab(currentTab());
}

void init();
