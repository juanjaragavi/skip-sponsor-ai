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
.undo{background:#3ea6ff;color:#000}.dismiss{background:transparent;color:#aaa}
.meta{color:#aaa;font-size:11px}`;

/** Shadow-DOM toast: isolates from YouTube CSS (spec §6). */
export function showSkipToast(
  segment: SponsorSegment,
  cb: ToastCallbacks,
): () => void {
  const host = document.createElement("div");
  host.id = "skipsponsor-toast-host";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  const dur = (segment.endTime - segment.startTime).toFixed(0);

  const label = document.createElement("div");
  // textContent only — no HTML injection (OWASP A07)
  label.textContent = `Skipped ${segment.category} (${dur}s)`;

  const undo = document.createElement("button");
  undo.className = "undo";
  undo.textContent = "Undo";
  undo.onclick = () => {
    cb.onUndo();
    dismiss();
  };

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "dismiss";
  dismissBtn.textContent = "✕";
  dismissBtn.onclick = () => dismiss();

  wrap.append(label, undo, dismissBtn);
  shadow.append(style, wrap);
  document.documentElement.append(wrap.getRootNode() as unknown as Node);
  document.body.appendChild(host);

  const timer = window.setTimeout(dismiss, UNDO_TOAST_MS);
  function dismiss(): void {
    window.clearTimeout(timer);
    host.remove();
  }
  return dismiss;
}

export function showNotifyBanner(
  segment: SponsorSegment,
  onSkip: () => void,
): () => void {
  return showSkipToast(segment, { onUndo: onSkip });
}
