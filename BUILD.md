# WITNESS build plan

Build on `main`, extending the existing Pixel 7 photosphere viewer. Each stage
is a small commit with a specific test gate. Complete that gate before moving
to the next stage. This is a plan, not a claim that these features exist.

The architecture and team interfaces are defined in
[architecture.md](architecture.md#part-c--agreed-integration-plan).

## Existing foundation

The Next.js application already displays the owned photosphere using Photo
Sphere Viewer and its gyroscope plugin, with touch dragging available. Reuse it.
The image includes projection, crop and heading metadata, but inspection found
no EXIF GPS coordinates. Mapbox alignment needs a supplied camera location.

## Ownership

| Owner | Work |
|---|---|
| Annotation teammate | Object placement, dimensions, facing direction, movement paths, timing and export. |
| Generation teammate | Existing X2 sessions, token route, prompts, geometry/model feed, output contract and recording; their Prometheus-w worker owns the initial compositor and view-settle integration. |
| Jack + this agent | Connect those deliverables and annotations; scene playback, occlusion, Next/Restart, timeline and caching. Extend the existing compositor rather than duplicate it. |

Do not duplicate the annotation editor or generation client. Inspect the actual
annotation export and X2 adapter before finalising integration interfaces.
The latest teammate update also reports `lib/witness/geometry.ts`, `contract.ts`,
`model-feed.ts`, `x2.tsx` and `prompts.ts`, plus T-002 compositor work. Reuse and
verify these at the relevant stages. Stages are ordered integration/test gates;
existing teammate components do not need rebuilding to satisfy them.

## Stage 1: Shared scene data and one stationary object

Import one object from the annotation teammate's export. Define stable IDs,
units, coordinate system, dimensions and camera alignment. Render its 3D bounds
using the existing viewer's camera. Reuse the teammate's top-right Debug toggle, off by
default, with subtle translucent bounds when enabled.

Screen pixels alone cannot locate an object as the phone turns. Use local 3D
coordinates, or panorama coordinates plus depth/ground-plane calibration. Keep
annotation labels and movement arrows out of the model-facing render.

**Test gate:** the object remains attached to the same location while turning,
dragging and resizing. Debug changes visibility only, not placement. Reject or
explicitly convert exports with missing coordinate/depth information.

## Stage 2: Scripted steps, motion and corrections

Add Next and Restart, then a display-only timeline. Import one movement path
and evaluate position from time rather than accumulating movement each frame.
Each step loops until Next. Corrections update the same object ID and persist
across loops; Restart restores the original scene. Extend to the remaining
objects after the first path works.

**Test gate:** repeated cycles produce identical source positions, Next advances
one step, the timeline cannot seek, and a van correction leaves unrelated scene
objects unchanged. Test the scene evaluator independently of rendering and X2.

## Stage 3: Calibration and occlusion

Calibrate camera height, heading, ground scale and the locations used by the
story. Use Mapbox building geometry where feasible once coordinates are known.
Add simple invisible surfaces and foreground masks for features the scripted
objects pass behind. Map data does not replace precise image alignment.

**Test gate:** one moving object passes behind a selected photographed feature
and reappears correctly. Validate scale and foot/tyre contact visually from the
fixed viewpoint. Keep approximate measurements labelled as such in scene data.

## Stage 4: Guide frames and matching masks

Reuse and extend the teammate's model feed to produce a clean background,
model-facing composite and object masks from the
same scene revision, camera and animation time. Use recognisable object-shaped
guides without annotation text or arrows. Exclude all interface controls from
capture. Keep the model feed dimensions stable and explicitly map its landscape
view to the portrait phone view. Record source frame metadata for timing alignment.

**Test gate:** inspect the three outputs side by side. Resolution, perspective,
object boundaries, motion and foreground occlusion match. Toggling Debug does
not change the model input or masks.

## Stage 5: One X2 object and correction

Connect the generation teammate's X2 client to the source track. Start with one
stationary van and a fixed camera, then change its colour using the same scene
object. Use the agreed guide and reference image. Verify the installed SDK's
prompt limits and model identifier. Scope runtime generation to X2 only.

**Test gate:** the correct object appears at the intended guide location and the
correction lands. Measure actual latency, inspect placement, and exercise
connection failure and cleanup. Existing stand-in-photo tests do not replace
this test on the real photosphere.

## Stage 6: Masked output and moving-object alignment

Integrate the teammate's compositor to display X2 over the photosphere inside matching object
masks. Test a small margin and softened edges. Apply foreground occlusion after
mask expansion. Establish how returned frames correspond to source animation
and camera state before adding moving generated objects.

**Test gate:** outside-mask background pixels remain unchanged, masks do not
slide over delayed output, and the moving object survives occlusion without
incorrect clipping. Cropping cannot relocate a misplaced generated object.

## Stage 7: One cached animation loop

Generate one full animation cycle for a stable direction. Store its video,
matching masks and loop timing together. Replay that exact cycle until Next.
Key the cache by scene revision, view, field of view, calibration, animation and
generation settings. Invalidate affected entries after corrections.

**Test gate:** multiple repeats reuse the clip instead of regenerating it. Video
and masks remain synchronised, the loop boundary is acceptable, corrections
never replay an old appearance, and Restart restores the original revision.

## Stage 8: Looking around and cache lifecycle

When the phone leaves a cached view, immediately rotate the original photosphere
and hide unmatched generated layers. Show “Updating reconstruction” while the
new direction settles and X2 generates it. Reuse valid cached directions when
returning. Bound memory use and discard superseded requests and late results.

**Test gate:** a clip never appears over the wrong viewing direction. Rapid turns
do not create a generation request for every sensor sample. Returning to a
cached view reuses it; evicted views regenerate. Check pitch, heading and field
of view as well as memory cleanup.

## Stage 9: Complete demo and device rehearsal

Connect all authored story steps, the mirrored display and existing transcript
work. Verify the actual geometry of the van correction and doorway reveal.
Rehearse the full sequence on the Pixel 7 and record a submission run.

**Test gate:** one-tap entry, orientation/touch control, Next, looping, correction,
Debug, loading/error states and Restart work together. Measure sustained memory
use and latency. A recorded X2 run is a demo recording, not another generation
pipeline.

## Delivery rules

- X2 is the only generation path. Runware and LingBot are outside the build.
- Implementation belongs on `main`; preserve teammates' work and commit narrowly.
- Use existing packages where possible and follow AGENTS.md security review
  requirements before adding critical dependencies.
- Run TypeScript and production build checks for relevant code changes, plus
  focused tests for scene evaluation, cache invalidation and timing contracts.
- Browser checks establish interface behaviour; physical Pixel 7 testing is
  still required for motion sensors, latency and sustained performance.
- Record completed stages and observed limitations here as work proceeds.

**Next action:** inspect one real annotation export and the generation adapter,
then implement Stage 1. No stage is marked integration-tested yet; existing components and reported
model tests remain useful starting evidence.
