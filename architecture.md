> Part A records the current architecture. Part B preserves Zeus's reported
> experiments and earlier proposals. Part C is the current integration plan,
> revised with Jack's agreed team split and X2-only decisions on 12 Sep 2026.
> Follow [BUILD.md](BUILD.md) for ordered work and test gates.

# WITNESS architecture

Status: agreed design, with implementation and validation still outstanding.
The owned photosphere viewer already works; the generation pipeline is not
claimed complete. Part C supersedes conflicting historical proposals in Part B.

## Demo scope

Extend the fixed-view experience described in [PRODUCT.md](PRODUCT.md): Chrome
on a Google Pixel 7, held upright, with phone rotation controlling the viewing
direction outside Bastille Court. Touch dragging remains the fallback. Display
the generated view on the phone and mirror it to the detective's screen.

The demo uses hardcoded scene steps triggered by a Next button. Each step adds
or corrects an object at a predefined position. A looping animation controls scripted movement. A bottom timeline shows
progress and events only; it has no scrubbing or seeking. Speech-driven placement is outside this
initial scope. Each step waits for Next while its animation loops. X2 is the
only generation path; no alternative model or rendered-object fallback is planned.

Keep the photographed surroundings and lighting unchanged. Added cars, people,
animals and similar objects have stable labelled 3D bounding volumes in scene
data. Model-facing frames use recognisable object-shaped guides, without text
labels or movement arrows. Viewer-facing debug bounds remain subtle.
Accurate object placement is the primary success criterion.

## Core approach

Maintain a small, deterministic 3D scene over a panoramic background. Render
the current camera view, including object-shaped guides and their occlusion, and
stream that composite into Reactor X2. A detailed prompt describes how X2 should
replace each box with a realistic object while preserving the background.

The source scene is 3D; the generated output is a 2D video of its current view.
Turning the phone rotates the source camera and supplies new frames. This does
not require generating an editable, photorealistic 3D world or supporting
physical walking through it.

```mermaid
flowchart TD
    A[Next button and playback clock] --> B[Deterministic scene state]
    C[Phone orientation or touch drag] --> D[Fixed-position virtual camera]
    E[Panorama and aligned occlusion geometry] --> F[Source renderer]
    B --> F
    B --> L[Display-only timeline]
    D --> F
    B --> G[Detailed prompt builder]
    F --> H[Reactor X2 source video]
    G --> H
    H --> M[View-specific loop cache and matching masks]
    M --> I[Masked video over responsive photosphere]
    I --> J[Mirrored detective display]
    K[Backend session service] --> H
```

## Scene state and timeline

Use one shared scene definition for rendering, prompts and playback. It contains:

- Panorama asset, fixed camera origin, orientation alignment and ground scale.
- Stable object IDs, semantic labels, dimensions, position, rotation and visibility.
- Object descriptions such as vehicle type, colour, clothing and facing direction.
- Predefined motion paths and speed or timing information.
- Scripted additions and corrections, each associated with a demo step.
- Static geometry and masks used to hide objects behind photographed features.

Keep the current story step, playback time and camera orientation separate.
Evaluate transforms directly from playback time so looping produces the same
source scene. The timeline is an indicator, not an input. A correction updates the same object
ID; it does not rebuild the street. Preserve corrections across animation loops; restarting the full demo restores
the initial revision.

Positions and paths come from the authored scene, not from instructions asking
X2 to invent movement. For example, the car's box follows a predefined trajectory
and X2 receives frames already containing its movement and perspective.

## Panorama alignment and occlusion

A panorama supplies colour but does not automatically provide the geometry
needed to place objects behind photographed buildings, trees or bicycles.

Recommended demo implementation: manually align a ground plane and simple
invisible surfaces to the chosen panorama. Use building surfaces for large
occluders and more detailed silhouettes or depth masks for foreground features.
Render boxes with depth testing against these surfaces while retaining the
panorama's appearance. A person behind the photographed bike must have the
appropriate parts of their box hidden before the frame reaches X2.

Calibrate the panorama heading, camera height, ground plane and object scale
using visible landmarks. From a single photograph these measurements are
estimates; visual alignment is not a surveyed reconstruction.

Use Mapbox where available to establish rough building volumes near the
photosphere GPS coordinates. Read latitude and longitude from the original
image metadata, validate them, and convert nearby geometry into a local frame
centred on the camera. GPS gives approximate location, not panorama heading,
camera height or precise image alignment. Inspect orientation metadata when
present, then calibrate against visible landmarks. Mapbox does not provide the
bike, fence and tree detail needed here; foreground masks remain necessary.
Validate local coverage and supported geometry access before integration. See
[Mapbox's 3D building example](https://docs.mapbox.com/mapbox-gl-js/example/3d-buildings/).

## Reactor X2 integration

X2 accepts a source video stream and editing instructions and returns a
transformed video stream. It supports prompt changes during a session; changes
take effect at generated block boundaries. See the
[X2 overview](https://docs.reactor.inc/model-api-reference/x2/overview).

The browser renderer should produce a capturable video source containing the
panorama and guides, excluding controls, the timeline and the debug toggle. Verify that the chosen
imagery delivery and renderer support capture; a separately embedded panorama
viewer cannot simply be assumed capturable.

Generate a specific prompt from a stable template and active scene state.
Preserve the user's intent for explicit placement and appearance instructions
while respecting the SDK/API limit verified by the generation teammate; Part B
reports a 1000-character limit. Include:

- Background preservation, camera perspective and existing lighting.
- The mapping from each guide shape and spatial location to its object description.
- Desired scale, facing direction and visible appearance.
- Instructions to follow source motion and preserve visible occlusion.
- Instructions to remove guide boxes and labels from the realistic output.

Object IDs and labels remain authoritative in scene data and prompts. Do not
paint annotation text or arrows into the model-facing video: the reported tests
in Part B found label leakage. Use proportioned object-shaped guides and test
reference images to improve placement. An annotation box defines the bounds;
it does not have to be the literal appearance of the guide sent to X2.

Detailed prompts do not guarantee exact boundaries, identity persistence or
unchanged background pixels. Those are acceptance criteria to measure, not
capabilities to assume. The deterministic source render is the placement
reference. Do not assume a fixed generation seed solves consistency.

## Bounding volumes and debug display

Viewer-facing bounds are very subtle, translucent and slightly holographic,
showing approximate 3D shape and distance. A top-right Debug button toggles these
bounds; default them off. This changes only their display visibility, preserving
scene state and model guidance. Keep model-facing guides clear enough to
condition generation independently of the faint debug styling.

The intended object occupies its authored volume. Generation should appear
inside its projected bounds. Prompting is not a hard spatial constraint:
the agreed approach is to composite generated video over the original
photosphere only within visible projected object masks, keeping original pixels
elsewhere. Allow a small configurable margin and softened edges around each
projected box; apply foreground occlusion after expanding the mask. A larger
margin may reveal altered background. Cropping cannot relocate an object that
X2 generated outside its guide. Test edge quality,
clipped objects and restricted shadows before accepting this technique.

This requires matching returned frames to source camera and object state.
Current-camera masks over delayed video misalign as the phone turns. Establish
frame/state correspondence or hold a matched presentation state before claiming
strict containment. This is a validation requirement, not a verified X2 masking
capability.

## Sessions, playback and latency

Proposed backend responsibility: mint browser session credentials, retain the
scene revision and demo state, and coordinate the mirrored display. Keep
long-lived API credentials server-side. Modal can host this service; Reactor
hosts X2, so this proposal does not require serving X2 weights on Modal.

Keep one generation session active where practical. Associate scene edits with
local revision IDs and update the source and prompt together. These IDs track
application state; they do not establish exact correspondence with returned
frames unless the API provides suitable timing metadata.

Measure phone-motion-to-output and edit-to-output delay on the actual Pixel 7.
Model frame rate alone is not end-to-end latency. Show measured values if the
demo displays latency. Slow camera motion is the starting assumption.

The timeline displays elapsed animation time and event markers without seek
interaction. Next advances hardcoded scene steps; the playback clock drives
movement and loops. Test generation across loop boundaries: identical source
frames do not guarantee identical generated output.

## View-specific generation cache

Generate a complete animation cycle for a stable viewing direction, then cache
and replay the same X2 video with its matching masks. Each story step waits for
Next and loops its cached animation; the display-only timeline follows replay
time. Cache replay prevents fresh generation drift on every cycle, but does not
make the first and last frames seamless. Select and validate a suitable loop
boundary, especially for standing people or other continuously visible objects.

Key each cache entry by photosphere/calibration revision, scene step and
correction revision, camera orientation and field of view, output dimensions,
animation definition and generation settings. Store the generated clip, matching
mask sequence or reproducible aligned mask state, and loop timing together.
A correction invalidates affected scene entries. Keep cache size bounded on the
phone; returning to an evicted direction may require fresh generation.

Start with one stable direction; multiple direction entries can be added as the
user explores. A cached clip is valid only for its matching view. Do not stretch
or paste it onto another direction and assume perspective remains correct.

When the phone moves outside a cached view, immediately rotate the original
photosphere, hide unmatched generated layers and show a brief "Updating
reconstruction" status. The user has explicitly accepted this interval. Once
the direction settles, generate for that view; reveal the object layer when its
video and masks align. Reuse a valid cached loop when the user returns to that
view. Supersede obsolete view requests when the phone moves again, so late
results never replace the current view. Changes in pitch and field of view
matter as well as heading.

Do not restart generation on every sensor sample. Determine the settling and
view-match tolerances through testing. Keep debug bounds tied to the displayed
state, and distinguish updating from cached replay. New directions and scene
corrections still use X2; no generation fallback is authorised.

Caching does not solve source/output timing alignment. Verify how a returned
frame maps to source animation time before storing its masks. Holding a stable
camera removes camera mismatch but not moving-object timing mismatch.

## Background source

Use the user's own Google Pixel 7 photosphere directly, replacing Google Street
View imagery in this proposed pipeline. Host the original asset with the project
and render it as the fixed panoramic background. No street-imagery API is needed
for the background. Preserve original metadata before image optimisation.

Inspect GPS and photosphere projection, crop and orientation metadata on import.
Validate full-sphere versus cropped coverage rather than assuming a 2:1 image.
If GPS is absent, record a manually supplied camera location; if heading is
absent, calibrate against landmarks. Do not infer coordinates from the earlier
Street View screenshot.

The current asset is `public/bastille-court-photosphere.jpg`. Inspection found
9216 × 4140 pixels, equirectangular GPano metadata describing a 9216 × 4608 full
panorama, crop origin (0, 0), and a reported heading of 94 degrees. No EXIF GPS
coordinates were found. Obtain a camera location before Mapbox alignment;
validate the metadata heading against the viewer rather than applying it twice.
Mapbox supplies geographic context and rough geometry, not background imagery.

## First validation slice

Before building the full story, test one stationary box, one moving box and one
box passing behind a foreground feature, using the actual phone viewpoint.
Compare the generated output with the source for position, scale, occlusion,
background drift and orientation delay. Then correct an existing object's
colour and facing direction while holding the camera fixed.

Test looping, cache reuse, correction invalidation, direction changes, timeline
progress and the debug toggle separately. Refine X2 guides, prompts and mask
alignment if placement fails; report unresolved failures without switching to
another model or directly rendered replacement objects.

The van reveal also needs a geometry test: rotating a symmetric rectangular box
180 degrees does not uncover a doorway. The scripted camera or object placement
must actually change visibility. Any hidden person in the fictional demo must
be authored explicitly; generated details are not recovered evidence.

## Remaining validation

- Obtain missing camera coordinates and verify the existing projection/heading alignment.
- Confirm Mapbox coverage and geometry access, then calibrate occlusion surfaces.
- Verify X2 follows labelled volumes and preserves object identity.
- Validate frame alignment and compositing for strict box containment.
- Measure placement error and end-to-end latency on the Pixel 7; agree numeric
  thresholds from that test. Accurate placement remains the priority.

This revision updates documentation only. It does not implement new UI, map
integration, generation or caching, or install dependencies.

The contributor notes below are preserved as reported evidence and proposals.
Part A above reflects the latest user decisions: owned Pixel 7 photosphere,
Mapbox-assisted alignment where feasible, display-only timeline without
scrubbing, and subtle bounds controlled by a top-right debug toggle. Older
scrubbing references below are superseded. The latest decision also supersedes
all fallback recommendations below: X2 is the only generation path. Preserve
those historical test results as evidence, not as implementation authorisation. Reported model tests and prompt
limits below still need to inform implementation and validation.

---

# Part B — Zeus additions

> **Author: Zeus** (Atilade's planning agent), added 12 Sep 2026 from ~13:30 and updated ~14:00.
> Everything above this line is Part A, originally written by Jack's agent in `053de48` and
> since revised by Jack's agent (`14fffa9`) to reflect the latest user decisions; Zeus has not
> edited it. Part B records what Atilade and Zeus decided, what has been measured on the live
> APIs, and answers to Part A's earlier open points. These notes are historical;
> the current Part C below replaces the original pending proposal.

## B1. End goal

WITNESS: an interviewer rebuilds a hit-and-run from a witness's statement, on the real street
outside Bastille Court, and the scene can be argued with. The **correction** (the van was not
white, it was dark and facing the other way) is the moment that proves the product: one object
changes and the rest of the street holds.

- **Prizes we are building for:** Real-Time Interactive (Reactor, £1000 + $2K credits) and Best
  Use of World Models (£1000).
- **How it is judged:** judges come to the table from 17:45 for 2–3 minutes and score four
  things: use of world models ("is the model doing the work?"), ambition, execution ("does it
  run in front of a judge, today?") and craft. Submissions close **17:30**.
- **Pitch line for the Reactor judge:** their own three words — *realtime* (the view answers
  the phone and the statement), *persistent state* (the street survives a correction),
  *controllable* (every object sits where the interviewer put it).

## B2. Decisions made with Atilade

| # | Decision | Why |
|---|---|---|
| 1 | **The live build is the demo; a recorded video is the submission and the backup.** | Judging scores live execution. An earlier storyboard said "record only"; that is reversed. |
| 2 | **Lighting is whatever the photosphere shows: a sunny afternoon, no rain.** (Earlier plan: overcast and wet; superseded by the real photo and Part A's "keep the photographed lighting".) The script's "it had been raining" line goes. | The background is the real photo, so the story must match it. |
| 3 | **The world only shows what the witness said.** The doorway stays empty until she says "there was someone else"; only then is the figure added, as an authored object. | Showing her something she never said is how false memories are planted. Agrees with Part A: "Any hidden person … must be authored explicitly." |
| 4 | **The impact happens off screen:** a screech and a thud on the audio, then the aftermath (a shopping bag on the road). | Reactor moderates violent content in prompts *and* images and **terminates the session** when flagged (docs: Content Moderation). A flagged prompt at the table kills the demo. |
| 5 | **No violent words in anything sent to Reactor** ("hit", "victim", "body", "blood", "injured"…). The prompt builder filters them; the on-screen transcript can say anything. | Same as 4. |
| 6 | **Faces small, distant, in shade. No readable generated text** (plates, signs). **Blur the real number plate** in the photosphere (the parked Lexus, left of the heading) before anything is published. | Generated faces and text are unstable; the plate belongs to a real person's car. |
| 7 | **Guide-driven generation:** the model only fills guides the interviewer placed. | From Part A; agreed. It keeps placement deterministic and keeps decision 3 honest. See B4 for what the model-facing guides should look like. |
| 8 | **Background: Atilade's Pixel 7 photosphere** (`public/bastille-court-photosphere.jpg`, from `PXL_20260912_121547443.PHOTOSPHERE`). Settled in Part A. | Owned imagery; no Street View terms problem. |
| 9 | **Witness work runs on its own hub board** (`HUB_DIR=~/hub-witness`), separate from Refinery. | Atilade's instruction. |
| 10 | **No free-drawing 2D box editor.** Task T-001 was cancelled at 13:30 and the Prometheus-w worker shut down. | Part A drives the demo from scripted steps, so the editor was off the critical path. |
| 11 | **No Runware.** The team's `WMHACK26` code does not work, so nothing in the plan depends on it. | The only use was filling guides for the LingBot fallback; X2 now does that (B5). |

## B3. What has been measured (live APIs, 13:00–13:50)

| Check | Result |
|---|---|
| Reactor API key | Works. Mints session-scoped tokens. |
| Model access | `lingbot-world-2` ✅. X2 ✅ **only as `xmax/x2`** — the slug `x2` shown in some docs is rejected ("requested model is not available to this API key"). |
| **LingBot correction test** (re-anchor on an image that differs in one box: `reset → set_image → set_seed → set_prompt → start`, same session) | Correction lands in **~3.7 s** (reset 0.1 s, upload + conditioning 2.7 s, first frame 0.9 s). Mean pixel change: **28.9 inside the edited box, 2.6 outside** — less than the street's own drift over 4 s with no edit (10.2). The street holds. |
| **X2 test 1: black box labelled VAN** (stand-in street photo streamed to `source` at 24 fps; "replace the box with a white van… remove the box and label… preserve the street", then "navy van") | **Fast:** first edited frame 0.6 s after the prompt, steady 24 fps. **Failed:** the van appeared across the middle of the street, not in the box; **the "VAN" label leaked** into the output; the street moved (19.1 outside the box); the dog vanished, then reappeared doubled. |
| **X2 test 2: grey van-shaped silhouette, no text** (same stand-in street; stage 1 guide only; stage 2 + a side-on reference photo of a white panel van; stage 3 prompt changed to navy) | **Much better.** Guide only: a real vehicle appears **roughly where the guide is**, but it is a minivan and spills ~20% past the guide. With the reference: **the right vehicle, a panel van matching the reference**, in the same place. **Correction: the van turns navy and keeps its shape and position.** Artefacts: a leftover white panel and a small extra car at the guide's right end, because the guide was longer than the reference van. |
| **X2 test 3: the real street** (a 90° view rendered from the photosphere looking down the road, van-shaped guide at the right-hand kerb, same three stages, then **each X2 frame composited back over the photo inside the padded guide**, as Part A proposes) | **Raw X2 output is not usable on its own:** it puts the reference van correctly in the guide, **but also invents a second van** on the pavement by the pub, and the whole frame drifts (26–28 change outside the guide). **Composited, it works:** one white van parked at the kerb where the guide was, on the untouched real street; the correction gives **the same van in the same place, now navy**. Remaining flaws: a textured ground patch under the van and a faint mask edge. |
| **Fallback without Runware: X2 as the inpainter** (the X2 van pasted into the photo inside a feathered mask → LingBot reference; correction = paste the navy X2 van and re-anchor, same session) | **Works.** The correction lands in **6.4 s**. Change between the live white and navy worlds: **48.2 inside the mask, 4.5 outside**. The small extra car and panel edge from test 2 were carried over by the paste; a properly proportioned guide or a tighter mask removes them. |
| **Capacity** | At 13:38 LingBot refused a session: **429 "no available capacity: no available servers"** (the whole hackathon shares these GPUs). X2 connected at 13:40 (ready in 5.8 s); LingBot capacity was back by 13:40. Capacity at 17:45 is not guaranteed for either model. |
| Reactor limits | 5 concurrent sessions, 10 new sessions/min (burst 3). Tokens last 1 h by default — mint a fresh one before 17:45. |
| Cost | Billed per second from `ready` until disconnect, generating or not. LingBot $0.42/min (~$25/h). X2 is private preview, price unpublished. **Disconnect idle sessions.** |
| Recording | `requestRecording()` returns the whole session as an MP4 (kept 24 h). Useful footage for the submission video. |

All frames are in `docs/evidence/` (the real-street ones start `real-street-`); the scripts that
produced them are in `scripts/spikes/`. Each result is one run — evidence, not a verdict.

## B4. Answers to Part A's open points

| Part A point | Zeus's answer |
|---|---|
| Background source | Settled in Part A (Pixel 7 photosphere). Agreed. |
| **Photosphere GPS** | **Neither copy has GPS** — not `public/bastille-court-photosphere.jpg`, not Atilade's original download. Use Part A's manual option: Bastille Court is 51.5067, -0.1064 (already in the old Street View code). The file does carry `GPano` metadata: equirectangular, 9216 × 4140 cropped from a 9216 × 4608 full sphere (top-aligned, so the bottom ~32° of the nadir is missing), `PoseHeadingDegrees` 94. |
| Manually authored geometry and occlusion masks | Accept, but keep it to what the story needs: the ground plane, the van, the doorway, and one foreground occluder at most. |
| Timeline and loops | Settled in Part A (display-only timeline, corrections persist across loops). Agreed; earlier scrubber notes are superseded. |
| Placement tolerance and latency | Targets: correction visible in under ~5 s on X2 (under ~7 s on the fallback); phone rotation to output under ~1 s. Measure on the Pixel 7. |
| **"Verify X2 follows labelled volumes"** | Tested (B3). **Labels drawn in the frame leak into the output** and a plain box does not hold placement (test 1). **Object-shaped grey guides with no text do much better**, especially with a reference image (tests 2–3). Recommended model-facing guide: a flat silhouette of the object's side or rear profile, **proportioned like the reference object**, perspective-correct from the renderer, **no text in the frame** — keep labels in scene data and the prompt. Distinct guide colours per object (Part A) are untested. |
| **Composite generated video only inside projected masks** | **Required, not optional.** On the real street X2 adds objects outside the guide and drifts the whole frame (test 3); compositing inside the padded mask is what turns that into a clean result. Part A's own caveat stands: the mask must match the frame X2 returns, not the current camera. Holding the camera still during a correction sidesteps it for the key beat. |

Further notes on Part A:
- **X2 needs a fixed-size landscape feed.** The viewer's canvas takes the screen's size, so on a
  Pixel 7 held upright it is portrait — and X2 fixes its output shape from the first frames of a
  session. Render the model-facing composite (photosphere + guides, no UI, no debug bounds) into
  a separate fixed landscape canvas (e.g. 1472 × 832, X2's own bucket) and capture that with
  `captureStream(24)`. Since `cfefd92` the phone viewer is Photo Sphere Viewer, so the feed is a second,
  hidden Photo Sphere Viewer at that size; objects are fixed as pixels on the photosphere and each
  viewer places them through the library's own camera (zoom sets the field of view, the photo's
  94° heading is applied), so the phone and the feed agree by construction.
- Browsers stop `requestAnimationFrame` in background tabs, which would stop the X2 feed; the
  page must stay in the foreground during the demo.
- **X2 prompts are capped at 1000 characters**; X2's prompt guide advises the *shortest*
  instruction that names the target, the one change, the spatial relationship and what to
  preserve. The prompt used on the real street: *"Turn the flat grey van-shaped silhouette at the
  kerb on the right, in front of the low building into the van from the reference image, parked
  exactly there at the same size, side-on to the camera. Keep everything else unchanged: the pub,
  the black fence, the buildings, the trees, the road markings, the sunlight and the camera. The
  van stays parked and still."*
- X2 takes **one reference image** per session, and swapping it restarts the stream. Give it to
  the van; the other objects rely on their guide shape and the prompt.

## B5. Historical experiment: X2 fills, LingBot holds

This experiment is retained as evidence only. LingBot and Runware are outside
the agreed implementation scope; do not wire this path into the demo.

> **Superseded by Part A (`5a021a9`): X2 is the only generation path.** Kept as a record of
> what was measured, not as a plan.

Built and measured as a backup, with no Runware: take an X2 output frame of the current view →
paste the object into the original photo **only inside its projected mask** → the result
becomes LingBot World 2's reference image → a live world the phone can look around. A
correction pastes the corrected X2 frame and re-anchors in the same session (B3: 6.4 s; 48.2
change inside the mask, 4.5 outside). It needs X2 and LingBot capacity at the same time.

Its limits, stated plainly: the world grows from one image, so turning far past that image makes
the model invent the rest; and it cannot follow authored motion paths the way Part A's source
render can.

---

# Part C — Agreed integration plan

Updated after Jack's review of `ecc01c3`, the Runware removal in `9ace9db`,
and the subsequent X2-only and caching decisions. The earlier fallback and
pending sign-off proposal is superseded. No Runware or LingBot integration is
planned. Historical experiments remain in Part B for reference.

## C1. Responsibilities

| Owner | Deliverable |
|---|---|
| Annotation teammate | Existing annotation tooling and export: object IDs, descriptions, dimensions, placement, facing direction, paths, timing and step membership. Boxes and arrows are authoring aids. |
| Generation teammate (Zeus/Atilade's stream) | Existing X2 client, token route, prompts, reference images, geometry/model feed and output contract; session recording and review of their compositor work. |
| Prometheus-w, via Zeus | Existing T-002 work: pose/settle integration, masked overlay, updating state, correction control and Debug. Integrate this work rather than rebuild it. |
| Jack + this agent | Import annotation data; scene playback, alignment, occlusion, Next/Restart, timeline and cache. Integrate the existing model feed and compositor, extending their contracts for motion and replay where needed. |

Integrate the teammates' deliverables rather than build another annotation
editor or X2 client. Implementation is requested on `main`; coordinate file
ownership and commit narrow changes without overwriting concurrent work.
The unused `feature/scene-foundation` worktree is not the implementation target.

### Existing work to reuse

The concurrent teammate update reports `lib/witness/geometry.ts`,
`lib/witness/contract.ts`, `lib/witness/model-feed.ts`, `lib/witness/x2.tsx`
and `lib/witness/prompts.ts`, with Prometheus-w integrating the overlay.
Inspect these modules before implementing any stage. Part B now includes a
real-photosphere X2 test; retain that evidence while testing the integrated
phone pipeline independently.

## C2. Shared scene contract

Inspect a real annotation export before finalising field names. Agree these
semantics first:

- Scene schema version, panorama/calibration revision, camera origin and coordinate convention.
- Stable object ID, kind, description, dimensions, orientation and initial position.
- Motion path points with times in seconds; define interpolation and whether a
  point marks the object's centre or ground contact position.
- Step IDs, loop duration, visibility intervals and corrections to existing IDs.
- Explicit units: metres for world dimensions, radians for rotations, seconds for time.

Prefer local 3D coordinates shared with the renderer. If the annotation tool
exports panorama yaw/pitch, include distance or a calibrated ground-plane
intersection. Raw screen pixels alone are insufficient. If only screen-space
annotations exist, preserve their source camera pose, field of view and image
size, then convert with an explicit depth/ground assumption. Mark such placement
as approximate rather than silently treating it as surveyed geometry.

## C3. Renderer and X2 handoff

For one immutable scene revision, camera pose and animation time, produce:

1. Clean photosphere frame for background preservation.
2. Fixed-size model-facing frame containing object-shaped guides and occlusion,
   excluding controls, labels and arrows; reuse the teammate's landscape feed
   and publish this as the X2 source video track. Explicitly map its camera and
   field of view to the portrait display rather than assume equal pixel coordinates.
3. Projected visible object masks for output compositing and cached playback.

Keep the subtle Debug overlay separate from the generation inputs. Attach local
frame IDs, animation timestamps, camera pose, field of view and scene revision
to the renderer's frame records. These are application metadata, not a claim
that X2 echoes them. The generation teammate must expose available output timing
information and session transitions so integration can establish correspondence.

The X2 adapter accepts a source track, prompt and optional reference image, and
exposes output video, readiness, errors and cleanup. Verify prompt length and
model identifier against the installed SDK and account; Part B reports
`xmax/x2`. Verify the current token route is scoped to X2 only; earlier revisions
included LingBot. No runtime route is modified by this documentation change.

## C4. Compositing and cache

Composite returned X2 video only through the matching projected object masks,
with a small tested edge margin and feathering; preserve the original
photosphere outside those regions. Apply foreground occlusion to the masks.
Cropping cannot fix an object generated in the wrong place. A stable camera
also does not solve moving-object latency, so verify temporal correspondence.

Each step waits for Next. Generate and cache a complete loop for a stable view,
then replay its clip and masks together. Corrections persist across loops and
invalidate affected cache entries. Restart restores the original scene.

Cache identity includes the scene/correction revision, panorama/calibration,
camera orientation, field of view, animation definition and generation settings.
When the phone leaves a cached direction, rotate the original photosphere
immediately, hide mismatched generated layers and show "Updating reconstruction".
Generate when the new direction settles; reuse matching cached views and discard
obsolete results. This update interval is explicitly accepted by the user.

## C5. Implementation sequence

Follow the gates in [BUILD.md](BUILD.md): annotation contract
and stationary object → deterministic motion and steps → occlusion → guide/mask
capture → one X2 object → aligned compositing → cached loop → view changes →
full Pixel 7 rehearsal. Complete and check each slice before expanding it.

The earliest end-to-end proof is one stationary van at the actual location,
using the annotation teammate's data and generation teammate's client, followed
by its colour correction. Model tests in Part B do not establish success for
moving objects or unrestricted camera rotation.
