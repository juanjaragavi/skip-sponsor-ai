import { DEFAULT_POLICY } from "./policy";
import type { UserPolicy } from "../shared/types";

const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const mode = document.querySelector<HTMLSelectElement>("#mode")!;
const thr = document.querySelector<HTMLInputElement>("#thr")!;

async function init(): Promise<void> {
  const stored = await chrome.storage.sync.get(["policy"]);
  const p = (stored["policy"] ?? DEFAULT_POLICY) as UserPolicy;
  enabled.checked = p.globalEnabled;
  mode.value = p.mode;
  thr.value = String(p.confidenceThreshold);

  document.querySelector("#save")!.addEventListener("click", async () => {
    const next: UserPolicy = {
      ...p,
      globalEnabled: enabled.checked,
      mode: mode.value as UserPolicy["mode"],
      confidenceThreshold: Math.min(
        0.95,
        Math.max(0.5, Number(thr.value) || 0.78)
      ),
    };
    await chrome.storage.sync.set({ policy: next });
    window.close();
  });
}

void init();
