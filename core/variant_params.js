// Seed itself isn't here: it drives variant randomness; varying it would be circular.

import { GLOBAL_CURVE_PARAMS } from "./curve_params.js";
import { NOISE_LAYER_PARAMS, NOISE_LAYER_KEYS } from "./noise_params.js";

// Noise variants are per-layer: each enabled layer can be randomized
// independently. Storage key includes the layer prefix so per-slot ranges
// don't collide between A and B.
function noiseVariantsFor(layer) {
  return [
    {
      key:    `noise${layer}.density`,
      layer,
      subKey: "density",
      label:  `Noise ${layer} density`,
      source: "noise",
      min:    NOISE_LAYER_PARAMS.density.min,
      max:    NOISE_LAYER_PARAMS.density.max,
    },
    {
      key:    `noise${layer}.scale`,
      layer,
      subKey: "scale",
      label:  `Noise ${layer} scale`,
      source: "noise",
      min:    NOISE_LAYER_PARAMS.scale.min,
      max:    NOISE_LAYER_PARAMS.scale.max,
    },
  ];
}

export const VARIANT_PARAMS = [
  {
    key:    "cornerSoftness",
    label:  "Corner softness",
    source: "curve",
    min:    GLOBAL_CURVE_PARAMS.cornerSoftness.min,
    max:    GLOBAL_CURVE_PARAMS.cornerSoftness.max,
  },
  {
    key:    "cornerArcness",
    label:  "Corner arcness",
    source: "curve",
    min:    GLOBAL_CURVE_PARAMS.cornerArcness.min,
    max:    GLOBAL_CURVE_PARAMS.cornerArcness.max,
  },
  {
    key:    "waveAmplitude",
    label:  "Wave amp",
    source: "curve",
    min:    GLOBAL_CURVE_PARAMS.waveAmplitude.min,
    max:    GLOBAL_CURVE_PARAMS.waveAmplitude.max,
  },
  {
    key:    "waveFrequency",
    label:  "Wave freq",
    source: "curve",
    min:    GLOBAL_CURVE_PARAMS.waveFrequency.min,
    max:    GLOBAL_CURVE_PARAMS.waveFrequency.max,
  },
  {
    key:    "organic",
    label:  "Organic",
    source: "curve",
    min:    GLOBAL_CURVE_PARAMS.organic.min,
    max:    GLOBAL_CURVE_PARAMS.organic.max,
  },
  ...NOISE_LAYER_KEYS.flatMap(noiseVariantsFor),
];

export function getVariantParam(key) {
  return VARIANT_PARAMS.find((p) => p.key === key) || null;
}
