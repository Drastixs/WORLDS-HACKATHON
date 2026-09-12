"""Witness X2 test 2: does a label-free, van-shaped grey guide (optionally with a reference
image of the van) make X2 put the van where the guide is, and keep the street?

One session, three stages on the same source frame (street + grey van silhouette, no text):
  1. guide only           prompt: turn the grey van shape into a white panel van
  2. guide + reference    same prompt, reference image of a white van set (stream restarts)
  3. correction           prompt: navy van, reference kept
Per stage: mean colour inside the guide vs the source's grey, and street change outside it.
Hard-capped; always disconnects.
"""
import asyncio, inspect, json, os, sys, time
import numpy as np
from PIL import Image, ImageDraw
from reactor_sdk import Reactor, ReactorStatus

HERE = os.path.dirname(os.path.abspath(__file__))
SEED_IMG, REF_IMG = sys.argv[1], sys.argv[2]
W, H = 1664, 960
BOX = (0.64, 0.27, 0.97, 0.50)  # the guide's bounding box, normalised
HARD_CAP_S = 170
STAGE_S = 12

PROMPT_WHITE = ("Turn the flat grey van-shaped silhouette on the right side of the road into a real white "
                "panel van, parked exactly there at the same size, side-on to the camera. "
                "Keep everything else unchanged: street, houses, tree, hydrant, dog, light and camera.")
PROMPT_REF = PROMPT_WHITE.replace("a real white panel van", "the van from the reference image")
PROMPT_NAVY = ("Turn the flat grey van-shaped silhouette on the right side of the road into a real dark navy "
               "blue panel van, parked exactly there at the same size, side-on to the camera. "
               "Keep everything else unchanged: street, houses, tree, hydrant, dog, light and camera.")


def box_px(w, h):
    return int(BOX[0] * w), int(BOX[1] * h), int(BOX[2] * w), int(BOX[3] * h)


def make_source():
    img = Image.open(SEED_IMG).convert("RGB").resize((W, H), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box_px(W, H)
    bw, bh = x1 - x0, y1 - y0
    grey = (128, 128, 128)
    wheel = int(bh * 0.18)
    body_bottom = y1 - wheel
    # Panel van side profile: long box body, sloped cab at the left end, two wheels.
    d.polygon([(x0 + int(bw * 0.18), y0), (x1, y0), (x1, body_bottom), (x0, body_bottom),
               (x0, y0 + int(bh * 0.45)), (x0 + int(bw * 0.08), y0 + int(bh * 0.12))], fill=grey)
    for cx in (x0 + int(bw * 0.17), x1 - int(bw * 0.17)):
        d.ellipse((cx - wheel, body_bottom - wheel, cx + wheel, body_bottom + wheel), fill=(60, 60, 60))
    img.save(os.path.join(HERE, "x2g_source.png"))
    return np.asarray(img)


def masks(shape):
    h, w = shape[:2]
    x0, y0, x1, y1 = box_px(w, h)
    m = np.zeros((h, w), bool); m[y0:y1, x0:x1] = True
    return m


def stats(frame, src):
    s = np.asarray(Image.fromarray(src).resize((frame.shape[1], frame.shape[0]))).astype(np.int16)
    f = frame.astype(np.int16)
    m = masks(frame.shape)
    inside_rgb = f[m].mean(axis=0).round().astype(int).tolist()
    inside_change = float(np.abs(f[m] - s[m]).mean())
    outside_change = float(np.abs(f[~m] - s[~m]).mean())
    return inside_rgb, round(inside_change, 1), round(outside_change, 1)


async def maybe(x):
    return await x if inspect.isawaitable(x) else x


async def main():
    src = make_source()
    r = Reactor(model_name="xmax/x2", api_key=os.environ["REACTOR_API_KEY"], max_session_duration_seconds=HARD_CAP_S)
    out = {"frame": None, "n": 0}
    msgs = []
    T0 = time.time()

    @r.on_message
    def _m(msg):
        t = msg.get("type") if isinstance(msg, dict) else str(msg)
        msgs.append((round(time.time() - T0, 1), t))
        if t in ("command_error", "error", "generation_stopped"):
            print(f"{time.time()-T0:6.1f}s MODEL {t}:", json.dumps(msg)[:300], flush=True)

    @r.on_error
    def _e(err):
        print("SDK ERROR:", repr(err)[:300], flush=True)

    def on_frame(frame):
        f = np.asarray(frame)
        if f.ndim == 4: f = f[-1]
        out["frame"] = f; out["n"] += 1

    await r.connect()
    while r.status != ReactorStatus.READY:
        if time.time() - T0 > 120: raise SystemExit("session never became ready")
        await asyncio.sleep(0.2)
    print(f"ready after {time.time()-T0:.1f}s", flush=True)
    r.tracks.with_direction("recvonly").with_kind("video").one().on_frame(on_frame)
    source = await maybe(r.publish_track("source"))
    stop = asyncio.Event()

    async def pump():
        while not stop.is_set():
            source.push_frame(src)
            await asyncio.sleep(1 / 24)
    pump_task = asyncio.create_task(pump())

    async def stage(name, prompt=None, ref=None):
        if ref is not None:
            fr = await r.upload_file(ref)
            await r.send_command("set_reference_image", {"reference_image": fr})
        if prompt is not None:
            await r.send_command("set_prompt", {"prompt": prompt})
        await asyncio.sleep(STAGE_S)
        f = out["frame"].copy()
        Image.fromarray(f).save(os.path.join(HERE, f"x2g_{name}.png"))
        rgb, ic, oc = stats(f, src)
        print(f"{name:10s} inside-guide mean RGB {rgb} (source grey 128), inside change {ic}, street change outside {oc}", flush=True)

    try:
        await asyncio.sleep(1.0)
        await stage("guide", PROMPT_WHITE)
        await stage("reference", PROMPT_REF, REF_IMG)
        await stage("navy", PROMPT_NAVY)
        print(f"frames received {out['n']}", flush=True)
    finally:
        stop.set(); pump_task.cancel()
        try: await r.disconnect()
        except Exception as e: print("disconnect error", e)
        print("messages:", msgs[:30], flush=True)
        print(f"session seconds ~{time.time()-T0:.0f}", flush=True)


asyncio.run(main())
