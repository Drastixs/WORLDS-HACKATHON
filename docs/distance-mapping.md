# Distance mapping

Open `/measure` (also linked from the welcome screen). No additional packages,
API key or model calls are required. Satellite tiles require an internet connection.
The map uses Esri World Imagery with visible provider attribution.

The starter outputs are:

- `public/witness/distance-annotated.png`: the street with approximate metre labels.
- `public/witness/distance-dots.png`: transparent dots and labels at identical pixels.
- `public/witness/distance-mapping.json`: calibration, image coordinates, ground
  coordinates, distances and settings, suitable for reimporting into the tool.

Both images are 2048 × 920. Grid centres are 25 output pixels apart horizontally
and vertically, clipped to a manually selected ground polygon. This corresponds to
112.5 pixels in the original 9216 × 4140 panorama. Hand-placed dots are unrestricted.

## Using the tool

1. Inspect the starter mapping. It is provisional, not a validated measurement.
2. Select **Match landmarks**, click a ground feature in the panorama, then the
   same feature on the satellite map. Four fit landmarks are required; subsequent
   points default to independent checks. Edit coordinates or remove matches in the
   landmark table. Spread matches across bearings and distances.
3. Select **Ground area**, trace a polygon around visible road or pavement and
   apply it. Exclude vehicles and raised surfaces. Nearby objects can be measured
   at their ground contact, not at arbitrary points on their body.
4. Select **Place dots** to add dots. Select a dot to inspect ground distance,
   line-of-sight distance, source pixels and estimated GPS, or remove it.
5. Select **Car route** and click consecutive ground positions. Route length is
   the sum of straight ground segments between clicks; it is not road-network routing.
6. Download the annotated PNG, transparent overlay, JSON or CSV. JSON can be
   reimported. Changes also save automatically in this browser.

The original approximate camera position is 51.5056239, -0.1057864. A calibrated
fit estimates a camera position from the landmark matches and displays both
positions on the map. Changing supplied GPS affects only the uncalibrated fallback;
landmark coordinates determine a fitted camera. Heading is an initial orientation:
the fit also estimates a heading correction.

## Geometry and limits

The source XMP records a full 9216 × 4608 equirectangular sphere cropped at (0, 0)
to 9216 × 4140, with heading 94°. At export size the level horizon is y=512,
not half of 920. Each image point becomes a spherical viewing ray. Intersecting
that ray with a horizontal plane one unit below the camera gives a ground point.
A least-squares similarity fit against map landmarks estimates rotation, scale
(camera height) and translation (camera location). This does not warp the whole
panorama onto a rectangular map image.

Horizontal distance is measured from the fitted camera's ground projection.
In a level equirectangular panorama, pixels on the same row have the same downward
angle and therefore the same ground distance. Repeated labels across a row are
expected under this model. Slant distance includes the fitted camera height.

The current four manually interpreted starter curb matches have approximately
2.7 m fit RMS and 5.4 m leave-one-out RMS. These are consistency checks, not measured
absolute accuracy. The requested 1–2 m accuracy is **not established**. The original
GPS lies about 13 m from the fitted position; neither has been independently verified.
The starter camera height is fitted at about 2.04 m, rather than assumed to be correct.

The model assumes a level panorama and a common flat ground plane. Ground slope,
pavement height, map alignment, historical imagery differences, occluded landmarks,
and panorama stitching can introduce further error. The horizon is adjustable;
roll and a varying ground surface are not modelled. Points less than 2° below the
horizon and beyond the selected maximum distance are rejected. Independent check
points are excluded from fitting. Leave-one-out error fits the remaining training
points and measures error at the omitted point. A failed or degenerate fit falls
back to the entered camera height and GPS with an uncalibrated label.

Keep measurements tied to the original image. A generated replacement may distort
geometry. The transparent overlay is aligned only when output dimensions and image
composition are preserved.

## Regenerate and verify

From the repository root, with the project's Node version:

```sh
node scripts/export-distance-map.mjs
# Or regenerate using settings exported from the tool:
node scripts/export-distance-map.mjs path/to/witness-mapping.json
node --test lib/measurement/geometry.test.ts
npm run typecheck
npm run build
```

The generator overwrites the three starter output files listed above. It uses the
same geometry and SVG labels as the browser export, composited with the existing
Sharp dependency. It does not send the photograph to an image generation service.

The revised starter ground area includes both visible pavements and the distant
road. Supplementary edge samples follow the curb through narrow parts of the
image. Hollow teal markers retain coverage where the horizon or distance limit
prevents measurement; their distance is null in `coverageMarkers` in the JSON.
Applying a new ground polygon clears starter edge guides.

## Distant labels, revision 3

The starter maximum distance is now 100 m. Measurement rays can approach 0.25°
below the horizon; calibration fitting still uses the original 2° cutoff.
The far left road uses a **visually assumed** local horizon at export y=482,
blended back to y=512 by y=550 within the saved distant-road polygon. This is a
rough local ground approximation to handle the inconsistent horizon in this
panorama; it is not a new map calibration, a measured slope, or verified depth.
The assumed far horizon can be edited in the tool. Remove `distantRoad` from
imported settings to disable the approximation. The fixed blend reference y=490
is specific to this source image.

These labels are rounded to whole metres and marked with `*`. The JSON stores
`method: "local-horizon-estimate"` and `lowConfidence: true` for these estimates.
All other estimates beyond 30 m are also marked low confidence. They must not be
interpreted as satisfying the 1–2 m accuracy target. All starter markers now have
an estimate; unavailable rays in user-edited configurations can still be hollow.
