"""Witness X2 test: does X2 turn a labelled black box into a realistic object, keep the
street, and apply a correction quickly?

Streams a still street frame with one black box labelled VAN into X2's `source` track at
24 fps. Prompt 1 asks for a white van; after a hold, prompt 2 corrects it to a navy van.
Measures first-output latency, correction latency (box brightness shift), and how far the
street outside the box moves from the source. Hard-capped; always disconnects.
"""
import asyncio, inspect, json, os, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from reactor_sdk import Reactor, ReactorStatus

HERE = os.path.dirname(os.path.abspath(__file__))
SEED_IMG = sys.argv[1]
W, H = 1664, 960
BOX = (0.80, 0.30, 0.99, 0.45)
HARD_CAP_S = 150
HOLD_S = 14

P_WHITE = ("Replace the black box labelled VAN on the right side of the road with a realistic white "
           "panel van parked at the kerb, facing away from the camera, matching the street's light "
           "and perspective. Remove the box and its label completely. Preserve the street, houses, "
           "tree, hydrant, dog, lighting and camera.")
P_NAVY = P_WHITE.replace("realistic white panel van", "realistic dark navy blue panel van")


def make_source():
    img = Image.open(SEED_IMG).convert("RGB").resize((W, H), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = int(BOX[0] * W), int(BOX[1] * H), int(BOX[2] * W), int(BOX[3] * H)
    d.rectangle((x0, y0, x1, y1), fill=(0, 0, 0))
    try: font = ImageFont.load_default(size=44)
    except TypeError: font = ImageFont.load_default()
    d.text(((x0 + x1) // 2, (y0 + y1) // 2), "VAN", fill=(255, 255, 255), font=font, anchor="mm")
    img.save(os.path.join(HERE, "x2_source.png"))
    return np.asarray(img)


def region(f, inside=True):
    h, w = f.shape[:2]
    x0, y0, x1, y1 = int(BOX[0] * w), int(BOX[1] * h), int(BOX[2] * w), int(BOX[3] * h)
    m = np.zeros((h, w), bool); m[y0:y1, x0:x1] = True
    return f[m] if inside else f[~m]


async def maybe(x):
    return await x if inspect.isawaitable(x) else x


async def main():
    src = make_source()
    r = Reactor(model_name="xmax/x2", api_key=os.environ["REACTOR_API_KEY"], max_session_duration_seconds=HARD_CAP_S)
    out = {"frame": None, "n": 0, "first": None}
    lum_log = []
    msgs = []
    T0 = time.time()

    @r.on_message
    def _m(msg):
        t = msg.get("type") if isinstance(msg, dict) else str(msg)
        msgs.append((round(time.time() - T0, 2), t))
        if t in ("command_error", "error", "generation_stopped", "generation_started"):
            print(f"{time.time()-T0:6.1f}s MODEL {t}:", json.dumps(msg)[:300], flush=True)

    @r.on_error
    def _e(err):
        print("SDK ERROR:", repr(err)[:300], flush=True)

    def on_frame(frame):
        f = np.asarray(frame)
        if f.ndim == 4: f = f[-1]
        now = time.time()
        if out["first"] is None: out["first"] = now
        out["frame"] = f; out["n"] += 1
        lum_log.append((now, float(region(f).mean())))

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

    try:
        await asyncio.sleep(1.0)
        t_prompt = time.time()
        await r.send_command("set_prompt", {"prompt": P_WHITE})
        while out["first"] is None:
            if time.time() - t_prompt > 90: raise SystemExit("no output within 90s of prompt")
            await asyncio.sleep(0.05)
        print(f"prompt -> first output frame {out['first']-t_prompt:.1f}s; output shape {out['frame'].shape}", flush=True)
        await asyncio.sleep(HOLD_S)
        white = out["frame"].copy(); Image.fromarray(white).save(os.path.join(HERE, "x2_white.png"))
        lum_white = float(region(white).mean())

        t_fix = time.time()
        await r.send_command("set_prompt", {"prompt": P_NAVY})
        seen = None
        while time.time() - t_fix < 30:
            recent = [l for t, l in lum_log if t > t_fix]
            if recent and recent[-1] < lum_white - 25 and seen is None:
                seen = time.time() - t_fix
            await asyncio.sleep(0.1)
            if seen is not None and time.time() - t_fix > seen + 4: break
        navy = out["frame"].copy(); Image.fromarray(navy).save(os.path.join(HERE, "x2_navy.png"))
        print(f"CORRECTION: box brightness white={lum_white:.0f} navy={float(region(navy).mean()):.0f}; "
              f"visible change after {'%.1fs' % seen if seen else 'NOT DETECTED within 30s'}", flush=True)

        s = np.asarray(Image.fromarray(src).resize((white.shape[1], white.shape[0]))).astype(np.int16)
        print(f"street outside box vs source: white {np.abs(region(white.astype(np.int16), False) - region(s, False)).mean():.1f}, "
              f"navy {np.abs(region(navy.astype(np.int16), False) - region(s, False)).mean():.1f}; "
              f"white vs navy outside box {np.abs(region(white.astype(np.int16), False) - region(navy.astype(np.int16), False)).mean():.1f}", flush=True)
        print(f"frames received {out['n']}", flush=True)
    finally:
        stop.set(); pump_task.cancel()
        try: await r.disconnect()
        except Exception as e: print("disconnect error", e)
        print("messages:", msgs[:30], flush=True)
        print(f"session seconds ~{time.time()-T0:.0f}", flush=True)


asyncio.run(main())
