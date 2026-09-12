"use client";
import type { ComponentProps } from "react";
import { cachedPersonClip, generatePersonClip } from "../../lib/witness/h3-person";
import { MovingSprite } from "./moving-sprite";
export type MovingObjectProps = Omit<ComponentProps<typeof MovingSprite>, "objectId" | "label" | "cachedClip" | "generateClip">;
export function MovingPerson(props: MovingObjectProps) {
  return <MovingSprite {...props} objectId="crossing-person-01" label="walking person" cachedClip={cachedPersonClip} generateClip={generatePersonClip} />;
}
