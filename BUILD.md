# WITNESS build plan

Build on `main`, extending the existing Pixel 7 photosphere viewer. Each stage
is a small commit with a specific test gate. Complete that gate before moving
to the next stage. This is a plan, not a claim that these features exist.

The architecture and team interfaces are defined in
[architecture.md](architecture.md#part-c--agreed-integration-plan).

## H3 scene integration checkpoints

- **Statement 1 — user-tested:** the starting van uses one captured non-empty H3
  frame. The model requires a five-second request internally; playback is stopped
  by closing the session after the first usable frame. The cropped still is anchored
  to the photosphere and retained in browser memory for Restart.
- **Statement 2 — implemented, awaiting user visual test:** generate one walking
  person against a chroma-green reference, remove green from decoded frames, and
  cache at most 120 small RGBA frames in browser memory. H3 supplies walking motion;
  the existing evaluated person cuboid supplies position and size. The existing
  foreground fence polygon erases occluded pixels from the person layer. The static
  van stays visible. The four-second path and sprite playback share the statement clock (25% faster
  than the original five-second crossing); the person box is 0.85 m wide.
  No model calls occur on subsequent loops or Restart. Refresh clears these caches.
  Cancel, leaving statement 2 and unmount stop capture and close the H3 session.

- **Statement 3 — implemented, awaiting user visual test:** a dark car driving-in-place
  clip uses the same chroma extraction and bounded frame cache as the person, with a
  landscape reference and left-facing vehicle prompt. The car follows the existing
  five-second path and projected box. The static van persists and the cached person
  holds its final walking frame at the completed crossing position. Car loops and
  Restart reuse the same cached frames. Leaving the active generation step cancels
  its capture. Sprite projection approximates a view-facing image; it does not create
  new 3D viewpoints of the generated car or model a collision.

**Statement 3 test:** generate the van and person, advance to 3/4, and press Generate
moving car. Compare its position with Debug through two loops. Check direction,
scale, wheels, green edges, and that the van/person remain in place. Restart and
advance again to verify the clip is reused. Actual car generation is left for the
user's visual test, as requested.

TypeScript, production build and 20 existing scene tests pass. Actual H3 pedestrian
quality, chroma edges, walking direction and loop continuity await the user's test;
these are not established by the scene tests. Current caches are browser-local,
not server storage. Statement 4 retains its existing X2 implementation.

**Test:** in Chromium, enter the scene, generate the starting van, press Next, then
Generate walking person. Watch at least two loops with Debug both on and off. Check
that feet stay near the guide's base, the person disappears behind the black fence
and emerges on the other side, the van remains still, and turning away/back preserves
placement. Restart then Next should reuse the same pedestrian without generating.

## H3 capability test — isolated experiment

The current user-authorized experiment is at `/h3-test`. The main scene still uses
X2. This exception to the original X2-only plan tests H3 before any pipeline migration.

- Render one perspective of the owned photosphere at the authored van position.
  Replace the side-profile guide with a front-facing grey rectangle for this test.
- Upload exactly one 1344 × 768 PNG through the existing Reactor SDK to
  `reactor/h3-reference-to-video-turbo-realtime`; request five seconds with seed 42.
- Use an H3-only server-minted token, retained for the entire session. The API key
  remains server-side. A three-minute client timeout and four-minute session limit
  bound the experiment; cancel, completion and unmount close the connection.
- Record the video output in browser memory for local replay and downloads. Capture
  a selected frame and compare the full result with a rectangular mask plus 5 pixels
  over the original street. This mask bounds displayed pixels, not model accuracy.
- The exact prompt is editable and visible on the page. Its default asks for a
  stationary white van facing the camera and preservation of the photographed scene.

**Observed:** a real Chromium session uploaded the reference, generated a front-facing
white van, completed playback, disconnected, and replayed the recorded output. Frame
selection works. A second completed run through the production Tailscale URL showed
a correctly front-facing van growing substantially beyond the grey guide by the final
frame. H3 also alters raw street details. Appearance is demonstrated; stationary scale
and box-fit consistency are **not passed**. The mask can clip an incorrectly sized van
and does not correct it. TypeScript, the production build and 20 scene tests pass.

**Test gate:** open `/h3-test` in Chromium, press **Generate one clip**, wait for
**Complete**, then play/pause the local recording and press **Capture replay frame**.
Compare the van's front, roof, wheels and edges against the grey reference and masked
result. Download the clip/frame if useful. Refresh clears the recording. Server cache,
moving objects and integration into the main photosphere are deliberately later stages.

## Existing foundation

The Next.js application already displays the owned photosphere using Photo
Sphere Viewer and its gyroscope plugin, with touch dragging available. Reuse it.
The image includes projection, crop and heading metadata, but inspection found
no EXIF GPS coordinates. Mapbox alignment needs a supplied camera location.

## Completed checkpoints

- **Stage 1 — complete (`8a8fc00`):** a versioned scene contract and subtle
  viewer-projected 3D debug volume are integrated. Placement remained fixed
  through drag, resize and Debug visibility checks. The object measurements are
  explicitly approximate because no annotation export is present yet.
- **Stage 2 — complete:** four deterministic, looping statement steps now drive
  absolute-time object paths, Next, Restart, a display-only timeline, staged
  object visibility and the van correction. Nine focused scene/playback tests,
  TypeScript, the production build and a Pixel 7 user test pass. The movement
  anchors remain a replaceable hardcoded fixture until the annotation export
  lands; Stage 2 does not claim moving X2 output alignment.
- **Stage 3 — complete:** the runtime scene records a versioned provisional
  panorama calibration, uses calibrated camera-ray depths, and projects an
  authored foreground mask for the photographed pub-garden enclosure. The
  figure volume passes behind the enclosure, disappears through the middle and
  reappears on the other side. Twelve witness tests, eight calibration tests,
  TypeScript, the production build, browser checks and supplied visual evidence
  pass. Calibration remains approximate (2.68 m fit RMS; 5.40 m cross-validation
  RMS), and model-facing mask reuse belongs to Stage 4.
- **Stage 4 — implemented, awaiting Pixel 7 sign-off:** the fixed 1472 × 832
  hidden feed now consumes the evaluated scene revision and loop time, renders
  label-free vehicle/person/animal silhouettes, and produces synchronized clean
  background, model-input and foreground-clipped object-mask canvases. Debug
  exposes those three outputs and local frame metadata without changing the
  captured feed. Eighteen focused scene/frame tests, TypeScript and browser
  pixel inspection pass; the browser found zero changed pixels outside the
  matching mask. Physical portrait-device inspection remains the stage gate.
- **Stage 5 — complete (Zeus):** on the real photosphere, with the view on the van's kerb,
  X2 went live in ~11 s and one white panel van appeared inside its guide ~14 s after Start,
  composited over the untouched photo. The story's correction step turned it navy and facing
  the other way in place within 9 s, and the loop cache then replayed the navy van. The white
  reference image had held the van white for 15 s against a navy prompt, so the correction now
  also swaps to a navy reference. Checked in headless Chrome at 1440×900
  (`scripts/witness/stage5-live-test.ps1`, evidence `docs/evidence/stage5-*`); not yet on a
  physical Pixel 7. On a desktop with no motion sensor the gyroscope plugin ignores programmatic
  rotation, so the test stops it first; desktop dragging does still turn the view (400 px → 24°).
- **Stage 7 — partial, stationary van only (Zeus + Prometheus-w, `8dac331`, `1a80f67`):** a
  bounded loop cache records 4 s of X2 output per settled view with its mask, replays it through
  that mask, keys entries by view and variant, drops old-variant entries on a correction and
  records nothing for 6 s after one. Live check: after the correction Debug read "cached" and
  showed the navy van. Not yet: loop-boundary validation, a scene revision in the key (Restart
  keeps `"v1"`), moving objects.
- **Stage 8 — partial (Prometheus-w, `9900ac4`, `8dac331`):** settle detection (600 ms under
  0.5°, no request per sensor sample), a 3° view tolerance, "Updating reconstruction" while the
  view moves, cached reuse on return, and recordings discarded if the view or variant changes
  mid-take. Not yet live-tested across several directions or on a Pixel 7.

### Handoff notes from Agent 2 (Zeus), 15:15

1. **Start facing the scene.** The van is at yaw ≈ 2.01 rad (115°) from the viewer's start;
   the figure and car are nearby. Opening with `defaultYaw` ≈ 2.0 saves the judge a large turn.
2. **One van placement.** Since `57a355e` the overlay composites through the scene-based
   `feedMask()`, so the van now sits where the scene puts it. `VAN_GUIDE` in
   `lib/witness/geometry.ts` survives only behind `feedGuide()`; retire it once nothing reads it.
3. **Stage 4 — done in `57a355e`.** The hidden 1472×832 feed now renders scene-driven,
   occlusion-clipped guides and `feedMask()`; Agent 2 verified the Stage 5 correction fix
   (`1a80f67`) survived it.
4. **X2 returns no frame tags** (294 tagged frames in, 0 out), so there is no per-frame
   correspondence from the model. Moving-object masks need measured latency or held state.
5. **Reference images beat prompts.** Appearance changes need their own reference image; the
   white reference held a "navy" van white for 15 s.
6. **Never run `npm run build` in a folder with a running `next dev`.** It broke the dev server
   (CSS 500, chunk 404, no hydration). Build in a separate worktree.
7. **Gyroscope plugin:** on a desktop it ignores programmatic `rotate()`; stop it first in tests.

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

## Two-agent implementation split

Split implementation by ownership, not alternating stages. The teammate roles
above describe existing upstream work; these two agents integrate and extend it.

| Agent | Stages | Responsibility |
|---|---|---|
| Agent 1: Scene and playback | 1–4 | Annotation import, scene state, camera alignment, controls, deterministic movement, occlusion, guide frames and masks. |
| Agent 2: Generation and replay | 5–8 | Existing X2 client/compositor integration, output alignment, cached loops, view changes and stale-result handling. |
| Agent 1 leads, Agent 2 supports | 9 | Full integration and Pixel 7 rehearsal; Agent 2 resolves generation/cache failures. |

### Shared interface before implementation

Agent 1 owns the shared contract file; Agent 2 reviews it before either builds
against it. Reuse the existing `lib/witness/contract.ts` where appropriate.
Agree these inputs and outputs:

- Scene: stable object IDs, transforms, dimensions, paths, step and correction revision.
- Renderer: source video, clean background, masks, camera pose, field of view
  and animation timestamps, with explicit units and coordinate conventions.
- Generation: output video, readiness/error state and available timing metadata.
  Local frame IDs are not assumed to be echoed by X2.

Agent 1 starts with the real annotation export. Agent 2 can work concurrently
using the existing stationary-van feed to integrate X2 and develop caching.
The moving-object compositing gate waits for Agent 1's matching masks and timing.
Independent work may proceed, but dependent stages are not complete until their
upstream inputs and test gates pass.

### File ownership and commits

Before edits, list the exact existing files each agent will own. Agent 1 owns
scene data, renderer/model-feed changes, shared contract and scene controls.
Agent 2 owns X2 session, compositor and cache changes. Agent 1 performs shared
page integration; Agent 2 supplies components and documents required props.
Resolve overlap with the teammates' active files before modifying them.

Both agents work on `main` as requested. Serialise Git staging and commits;
stage explicit owned paths only. Neither agent may reset, discard, overwrite or
commit the other's unreviewed changes. Shared-file edits require an explicit
handoff. Check the combined tree after integrating each slice.

### Agent 1 assignment

> Own BUILD.md stages 1–4. Reuse the annotation teammate's export and existing
> viewer/geometry modules. Deliver deterministic scene playback, controls,
> occlusion and synchronised generation inputs. Coordinate the shared interface
> with Agent 2. Do not modify X2 session or cache code. Lead Stage 9 integration.

### Agent 2 assignment

> Own BUILD.md stages 5–8. Reuse the generation teammate's X2 client and
> Prometheus-w compositor. Deliver aligned masked output, cached loops and
> view-change handling. X2 only. Start with the existing stationary feed;
> integrate moving scene inputs when Agent 1 supplies them. Do not rebuild
> annotation or scene controls. Support Stage 9 generation/cache fixes.

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
