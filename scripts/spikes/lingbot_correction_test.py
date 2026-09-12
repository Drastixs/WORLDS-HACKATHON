"""Witness Beat-4 test: does LingBot World 2 hold the street when only one box of the
reference image changes?

A = original reference, B = same image with one box edited (the parked SUV recoloured,
standing in for a Runware inpaint). Launch on A, snapshot, re-anchor on B in the same
session (reset -> set_image -> seed -> prompt -> start), snapshot, then compare the two
live frames inside and outside the box. Prints timings. Hard-capped and always
disconnects, because the session bills per second while ready.
"""
import asyncio, json, os, sys, time
import numpy as np
from PIL import Image
from reactor_sdk import Reactor, ReactorStatus

HERE = os.path.dirname(os.path.abspath(__file__))
SEED_IMG = sys.argv[1]
W, H = 1664, 960
# SUV box in normalised coords of the SF seed image (right-hand kerb).
BOX = (0.815, 0.330, 0.945, 0.435)
SEED = 4242
HARD_CAP_S = 200

BASE = ("A steep residential street after rain, painted Victorian houses on both sides, "
        "a golden dog standing on the wet pavement. The world contains EXACTLY ONE red fire "
        "hydrant at the kerb at a fixed position AND EXACTLY ONE tree trunk beside it at a fixed "
        "position AND EXACTLY ONE {car} parked on the right at a fixed position. Wet paving slabs, "
        "fallen leaves, soft low sunlight, city skyline in haze. Realistic photographic street scene.")
CAMERA = ("Third-person view, the dog locked at the exact centre of the frame at constant size and "
          "distance. Neither the dog nor the camera moves on its own; arrow-key look-input is the only "
          "source of camera motion, arcing the camera around the stationary, centred dog only while held.")
IDLE = "The dog stands still on the pavement, ears relaxed, tail low, breathing gently."


def prompt(car):
    return " ".join([BASE.format(car=car), CAMERA, IDLE])


def make_images():
    a = Image.open(SEED_IMG).convert("RGB").resize((W, H), Image.LANCZOS)
    b = a.copy()
    x0, y0, x1, y1 = int(BOX[0] * W), int(BOX[1] * H), int(BOX[2] * W), int(BOX[3] * H)
    region = np.asarray(b.crop((x0, y0, x1, y1))).astype(np.float32)
    lum = region.mean(axis=2, keepdims=True)
    red = np.concatenate([lum * 2.2 + 40, lum * 0.35, lum * 0.35], axis=2).clip(0, 255).astype(np.uint8)
    b.paste(Image.fromarray(red), (x0, y0))
    a.save(os.path.join(HERE, "ref_A.png")); b.save(os.path.join(HERE, "ref_B.png"))
    return os.path.join(HERE, "ref_A.png"), os.path.join(HERE, "ref_B.png"), (x0, y0, x1, y1)


def box_diff(f1, f2, box):
    h, w = f1.shape[:2]
    x0, y0, x1, y1 = [int(v) for v in (box[0] * w / W, box[1] * h / H, box[2] * w / W, box[3] * h / H)]
    d = np.abs(f1.astype(np.int16) - f2.astype(np.int16)).mean(axis=2)
    mask = np.zeros_like(d, dtype=bool); mask[y0:y1, x0:x1] = True
    return round(float(d[mask].mean()), 1), round(float(d[~mask].mean()), 1)


async def main():
    ref_a, ref_b, box_px = make_images()
    key = os.environ["REACTOR_API_KEY"]
    r = Reactor(model_name="reactor/lingbot-world-2", api_key=key, max_session_duration_seconds=HARD_CAP_S)
    latest = {"frame": None, "t": None, "n": 0}
    msgs = []
    accepted = asyncio.Event()
    loop = asyncio.get_running_loop()

    @r.on_message
    def _m(msg):
        t = msg.get("type") if isinstance(msg, dict) else str(msg)
        msgs.append((round(time.time() - T0, 2), t))
        if t == "image_accepted":
            loop.call_soon_threadsafe(accepted.set)
        if t in ("command_error", "error"):
            print("MODEL ERROR:", json.dumps(msg)[:400], flush=True)

    @r.on_error
    def _e(err):
        print("SDK ERROR:", repr(err)[:400], flush=True)

    def on_frame(frame):
        f = np.asarray(frame)
        if f.ndim == 4: f = f[-1]
        latest["frame"], latest["t"] = f, time.time(); latest["n"] += 1

    T0 = time.time()
    await r.connect()
    while r.status != ReactorStatus.READY:
        if time.time() - T0 > 120: raise SystemExit("session never became ready")
        await asyncio.sleep(0.2)
    print(f"ready after {time.time()-T0:.1f}s", flush=True)
    r.tracks.with_direction("recvonly").with_kind("video").one().on_frame(on_frame)

    async def anchor(path, car, label):
        accepted.clear()
        t = time.time()
        ref = await r.upload_file(path)
        await r.send_command("set_image", {"image": ref})
        try: await asyncio.wait_for(accepted.wait(), 60)
        except asyncio.TimeoutError: print("no image_accepted within 60s; continuing", flush=True)
        await r.send_command("set_seed", {"seed": SEED})
        await r.send_command("set_attn_window", {"attn_window": "small"})
        await r.send_command("set_prompt", {"prompt": prompt(car)})
        await asyncio.sleep(0.65)
        n0 = latest["n"]
        t_start = time.time()
        await r.send_command("start", {})
        while latest["n"] == n0:
            if time.time() - t_start > 90: raise SystemExit(f"{label}: no frame within 90s of start")
            await asyncio.sleep(0.05)
        first = time.time()
        print(f"{label}: upload+condition {t_start-t:.1f}s, start->first frame {first-t_start:.1f}s, total {first-t:.1f}s", flush=True)
        snaps = {}
        for s in (2, 6):
            await asyncio.sleep(max(0, first + s - time.time()))
            snaps[s] = latest["frame"].copy()
            Image.fromarray(snaps[s]).save(os.path.join(HERE, f"live_{label}_{s}s.png"))
        return snaps, first - t

    try:
        a, _ = await anchor(ref_a, "dark SUV", "A")
        t = time.time()
        await r.send_command("reset", {})
        print(f"reset ack {time.time()-t:.1f}s", flush=True)
        b, total_b = await anchor(ref_b, "red SUV", "B")
        print(f"CORRECTION total (reset -> first corrected frame): {time.time()-t:.1f}s", flush=True)
        ia, oa = box_diff(a[2], b[2], BOX)
        ic, oc = box_diff(a[2], a[6], BOX)
        print(f"diff A@2s vs B@2s: inside box {ia}, outside box {oa}", flush=True)
        print(f"drift A@2s vs A@6s (no change): inside {ic}, outside {oc}", flush=True)
        print(f"frame shape {a[2].shape}, frames received {latest['n']}", flush=True)
    finally:
        try: await r.disconnect()
        except Exception as e: print("disconnect error", e)
        print("messages:", msgs[:40], flush=True)
        print(f"session seconds ~{time.time()-T0:.0f}", flush=True)


asyncio.run(main())
