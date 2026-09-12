"use client";
import { cachedCarClip, generateCarClip } from "../../lib/witness/h3-car";
import { MovingSprite } from "./moving-sprite";
import type { MovingObjectProps } from "./moving-person";
export function MovingCar(props: MovingObjectProps) {
  return <MovingSprite {...props} objectId="moving-car-01" label="moving car" cachedClip={cachedCarClip} generateClip={generateCarClip} />;
}
