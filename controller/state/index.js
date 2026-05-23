import { initInputsState,           applyInputsMixin           } from "./inputs.js";
import { initPoolsState,            applyPoolsMixin            } from "./pools.js";
import { initTemplateState,         applyTemplateMixin         } from "./template.js";
import { initParamsState,           applyParamsMixin           } from "./params.js";
import { initExportConfigState,     applyExportConfigMixin     } from "./exportConfig.js";
import { initBundleOverridesState,  applyBundleOverridesMixin  } from "./bundleOverrides.js";
import { initBundlePathState,       applyBundlePathMixin       } from "./bundlePath.js";
import { initProjectDirtyState,     applyProjectDirtyMixin,
         attachProjectDirtyBridge                              } from "./projectDirty.js";
import { applySerializeMixin                                   } from "./serialize.js";
import { applyImportSettingsMixin                              } from "./importSettings.js";

class State extends EventTarget {
  constructor() {
    super();
    initInputsState(this);
    initPoolsState(this);
    initTemplateState(this);
    initParamsState(this);
    initExportConfigState(this);
    initBundleOverridesState(this);
    initBundlePathState(this);
    initProjectDirtyState(this);
  }
}

applyInputsMixin(State);
applyPoolsMixin(State);
applyTemplateMixin(State);
applyParamsMixin(State);
applyExportConfigMixin(State);
applyBundleOverridesMixin(State);
applyBundlePathMixin(State);
applyProjectDirtyMixin(State);
applySerializeMixin(State);
applyImportSettingsMixin(State);

export const state = new State();
attachProjectDirtyBridge(state);
