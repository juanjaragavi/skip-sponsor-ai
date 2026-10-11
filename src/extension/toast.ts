import type { SponsorSegment } from "../shared/types";
import { UNDO_TOAST_MS } from "../shared/constants";
import { categoryLabel, formatRange } from "./view-model";
import { icon, type IconName } from "./ui/icons";

export interface ToastCallbacks {
  onUndo: () => void;
  onShowSkipped?: () => void;
}

export interface NotifyHandle {
  dismiss: () => void;
  /** Feed playback time so the countdown and strip track the sponsor read. */
  update: (currentTime: number) => void;
}

/*
 * "Toast V2 / Cut" and "Toast V2 / Ask" from the Editor's Cut design:
 * 360px, radius 10, 36px buttons, bottom strip = the cut range. Self-contained
 * CSS inside a Shadow DOM so YouTube's styles can't leak in (or out).
 */
const STYLE = `
:host{all:initial}
.toast{position:absolute;right:16px;bottom:72px;z-index:2147483647;width:360px;max-width:calc(100% - 32px);
  display:flex;flex-direction:column;overflow:hidden;color:#F5F7FA;
  font-family:Roboto,"Roboto Variable",Arial,sans-serif;-webkit-font-smoothing:antialiased;
  background:rgba(14,17,22,.9);border:1px solid rgba(255,255,255,.12);border-radius:10px;
  -webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);box-shadow:0 8px 24px rgba(0,0,0,.4);
  animation:enter .18s ease-out}
:host(.fixed) .toast{position:fixed}
.row{display:flex;align-items:center;gap:10px;padding:8px 6px 8px 10px}
.tag{display:flex;align-items:center;gap:5px;padding:4px 7px;border-radius:4px;flex:none;
  font-size:10.5px;font-weight:700;letter-spacing:.7px;line-height:1}
.cut .tag{background:rgba(61,220,151,.16);color:#3DDC97}
.ask .tag{background:rgba(255,181,71,.16);color:#FFB547}
.main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.tc{font-size:14px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.sub{font-size:11.5px;color:#AEB6C2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button{font-family:inherit;border:0;margin:0;cursor:pointer}
.action{height:36px;display:flex;align-items:center;gap:6px;padding:0 12px;border-radius:7px;flex:none;
  font-size:13px;font-weight:600;color:#F5F7FA}
.undo{background:rgba(255,255,255,.12)}.undo:hover{background:rgba(255,255,255,.2)}
.skip{background:#6A4FF5}.skip:hover{background:#7B61FF}
.close{width:32px;height:32px;display:grid;place-items:center;flex:none;border-radius:6px;
  color:#9AA3B2;background:transparent}.close:hover{color:#F5F7FA;background:rgba(255,255,255,.08)}
button:focus-visible{outline:2px solid #9B87FF;outline-offset:2px}
.strip{position:relative;height:14px}
.base{position:absolute;left:0;right:0;top:10px;height:4px;background:rgba(255,255,255,.08)}
.range{position:absolute;left:0;top:10px;height:4px;width:var(--p,100%)}
.head{position:absolute;top:4px;width:2px;height:10px;background:#FFFFFF;left:calc(var(--p,100%) - 2px)}
.cut .range{background:#3DDC97;animation:drain var(--ms) linear forwards}
.cut .head{animation:drain-head var(--ms) linear forwards}
.ask .range{background:#FFB547}
.note .tag{background:rgba(155,135,255,.16);color:#9B87FF}
.note .tc{font-size:13px}
.note .strip{display:none}
.ok{background:rgba(255,255,255,.12)}.ok:hover{background:rgba(255,255,255,.2)}
@keyframes drain{from{width:100%}to{width:0}}
@keyframes drain-head{from{left:calc(100% - 2px)}to{left:0}}
@keyframes enter{from{opacity:0;transform:translateY(6px)}}
@media (prefers-reduced-motion:reduce){.toast,.range,.head{animation:none}}
`;

interface Spec {
  hostId: string;
  kind: "cut" | "ask" | "note";
  tag: string;
  glyph: IconName;
  range: string;
  sub: string;
  action: { className: string; text: string; icon: IconName; run: () => void };
  durationMs: number;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children); // strings become text nodes: no HTML injection (OWASP A07)
  return node;
}

function render(spec: Spec): {
  dismiss: () => void;
  sub: HTMLElement;
  strip: HTMLElement;
} {
  document.getElementById(spec.hostId)?.remove();
  const host = document.createElement("div");
  host.id = spec.hostId;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;

  const sub = el("div", "sub", spec.sub);
  const action = el(
    "button",
    `action ${spec.action.className}`,
    icon(spec.action.icon, 15),
    spec.action.text,
  );
  action.type = "button";
  const close = el("button", "close", icon("x", 15));
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");

  const strip = el(
    "div",
    "strip",
    el("div", "base"),
    el("div", "range"),
    el("div", "head"),
  );
  strip.style.setProperty("--ms", `${spec.durationMs}ms`);
  const toast = el(
    "div",
    `toast ${spec.kind}`,
    el(
      "div",
      "row",
      el("div", "tag", icon(spec.glyph, 12, 2.5), spec.tag),
      el("div", "main", el("div", "tc", spec.range), sub),
      action,
      close,
    ),
    strip,
  );
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  shadow.append(style, toast);

  const player = document.querySelector<HTMLElement>(".html5-video-player");
  if (player) {
    player.appendChild(host); // inside the player: stays visible in fullscreen
  } else {
    host.classList.add("fixed");
    document.body.appendChild(host);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") dismiss();
  };
  document.addEventListener("keydown", onKey, true);
  const timer = window.setTimeout(dismiss, spec.durationMs);
  function dismiss(): void {
    window.clearTimeout(timer);
    document.removeEventListener("keydown", onKey, true);
    host.remove();
  }
  action.onclick = () => {
    spec.action.run();
    dismiss();
  };
  close.onclick = dismiss;
  return { dismiss, sub, strip };
}

const seconds = (s: SponsorSegment): number =>
  Math.round(s.endTime - s.startTime);

/** After an automatic cut: "CUT 03:42 → 04:22 · Sponsor · 40s skipped [Undo]". */
export function showSkipToast(
  segment: SponsorSegment,
  cb: ToastCallbacks,
): () => void {
  return render({
    hostId: "skipsponsor-toast-host",
    kind: "cut",
    tag: "CUT",
    glyph: "scissors",
    range: formatRange(segment.startTime, segment.endTime),
    sub: `${categoryLabel(segment.category)} · ${seconds(segment)}s skipped`,
    action: { className: "undo", text: "Undo", icon: "undo-2", run: cb.onUndo },
    durationMs: UNDO_TOAST_MS,
  }).dismiss;
}

/** Informational note, e.g. "LIMIT Daily AI analysis limit reached [OK]". */
export function showNoticeToast(title: string, sub: string): () => void {
  return render({
    hostId: "skipsponsor-notice-host",
    kind: "note",
    tag: "LIMIT",
    glyph: "info",
    range: title,
    sub,
    action: {
      className: "ok",
      text: "OK",
      icon: "check",
      run: () => undefined,
    },
    durationMs: 8000,
  }).dismiss;
}

/** Notify mode: "ASK 03:42 → 04:22 · Sponsor · ends in 32s [Skip]". */
export function showNotifyBanner(
  segment: SponsorSegment,
  onSkip: () => void,
  durationMs = UNDO_TOAST_MS,
): NotifyHandle {
  const endsIn = (t: number): string =>
    `${categoryLabel(segment.category)} · ends in ${Math.max(0, Math.ceil(segment.endTime - t))}s`;
  const { dismiss, sub, strip } = render({
    hostId: "skipsponsor-notify-host",
    kind: "ask",
    tag: "ASK",
    glyph: "hand",
    range: formatRange(segment.startTime, segment.endTime),
    sub: endsIn(segment.startTime),
    action: {
      className: "skip",
      text: "Skip",
      icon: "chevrons-right",
      run: onSkip,
    },
    durationMs,
  });
  const update = (t: number): void => {
    sub.textContent = endsIn(t);
    const span = segment.endTime - segment.startTime;
    const p =
      span > 0 ? Math.min(1, Math.max(0, (t - segment.startTime) / span)) : 0;
    strip.style.setProperty("--p", `${(p * 100).toFixed(1)}%`);
  };
  update(segment.startTime);
  return { dismiss, update };
}
