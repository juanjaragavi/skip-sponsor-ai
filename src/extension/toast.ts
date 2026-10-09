import type { SponsorSegment } from "../shared/types";
import { UNDO_TOAST_MS } from "../shared/constants";

export interface ToastCallbacks {
  onUndo: () => void;
  onShowSkipped?: () => void;
}

const STYLE = `:host{all:initial;font-family:Roboto,Arial,sans-serif}
.wrap{position:fixed;right:16px;bottom:72px;z-index:2147483647;background:#0f0f0f;color:#fff;
border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:center;
box-shadow:0 4px 24px rgba(0,0,0,.45);font-size:13px;max-width:360px}
button{all:initial;cursor:pointer;font:600 13px Roboto,Arial,sans-serif;padding:6px 12px;border-radius:8px}
.undo,.skip{background:#3ea6ff;color:#000}.dismiss{background:transparent;color:#aaa}
.meta{color:#aaa;font-size:11px}`;

interface ToastSpec {
  hostId: string;
  label: string;
  action: { className: string; text: string; run: () => void };
  durationMs: number;
}

/** Shadow-DOM toast: isolates from YouTube CSS (spec §6). */
function showToast(spec: ToastSpec): () => void {
  const host = document.createElement("div");
  host.id = spec.hostId;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const label = document.createElement("div");
  // textContent only — no HTML injection (OWASP A07)
  label.textContent = spec.label;

  const action = document.createElement("button");
  action.className = spec.action.className;
  action.textContent = spec.action.text;
  action.onclick = () => {
    spec.action.run();
    dismiss();
  };

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "dismiss";
  dismissBtn.textContent = "✕";
  dismissBtn.onclick = () => dismiss();

  wrap.append(label, action, dismissBtn);
  shadow.append(style, wrap);
  document.body.appendChild(host);

  const timer = window.setTimeout(dismiss, spec.durationMs);
  function dismiss(): void {
    window.clearTimeout(timer);
    host.remove();
  }
  return dismiss;
}

const seconds = (s: SponsorSegment): string =>
  (s.endTime - s.startTime).toFixed(0);

export function showSkipToast(
  segment: SponsorSegment,
  cb: ToastCallbacks,
): () => void {
  return showToast({
    hostId: "skipsponsor-toast-host",
    label: `Skipped ${segment.category} (${seconds(segment)}s)`,
    action: { className: "undo", text: "Undo", run: cb.onUndo },
    durationMs: UNDO_TOAST_MS,
  });
}

/**
 * Notify mode: announce the segment and let the user skip it. Stays up for
 * `durationMs` (callers pass the time left in the segment).
 */
export function showNotifyBanner(
  segment: SponsorSegment,
  onSkip: () => void,
  durationMs = UNDO_TOAST_MS,
): () => void {
  return showToast({
    hostId: "skipsponsor-notify-host",
    label: `${segment.category === "sponsor" ? "Sponsor" : segment.category} segment (${seconds(segment)}s)`,
    action: { className: "skip", text: "Skip", run: onSkip },
    durationMs,
  });
}
