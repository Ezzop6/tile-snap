import { state } from "../controller/state.js";
import { SEED_MIN, SEED_MAX } from "../core/noise_params.js";

export function initSeedPanel() {
  const inp = document.getElementById("project-seed");
  if (inp) {
    inp.value = String(state.seed);
    inp.addEventListener("input", () => state.setSeed(inp.value));
    state.addEventListener("seed:changed", () => {
      if (document.activeElement !== inp) inp.value = String(state.seed);
    });
  }

  document.getElementById("project-seed-random")?.addEventListener("click", () => {
    state.setSeed(SEED_MIN + Math.floor(Math.random() * (SEED_MAX - SEED_MIN + 1)));
  });
}
