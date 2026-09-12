"""Witness fallback without Runware: X2 as the inpainter, LingBot as the world.

Pastes the van from an X2 output frame into the original street photo, only inside a
feathered object mask, and uses that as LingBot World 2's reference image. Then the
correction: paste the navy X2 van instead and re-anchor in the same session. Measures
timing and the change inside vs outside the mask. Hard-capped; always disconnects.
"""
import asyncio, os, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from reactor_sdk import Reactor, ReactorStatus

HERE = os.path.dirname(os.path.abspath(__file__))
SEED_IMG, X2_WHITE, X2_NAVY = sys.argv[1:4]
W, H = 1664, 960
MASK = (0.48, 0.24, 0.92, 0.54)  # where X2 actually drew the van, normalised
SEED = 4242
HARD_CAP_S = 150

BASE = ("A steep residential street after rain, painted Victorian houses on both sides, a golden dog "
        "standing on the wet pavement. The world contains EXACTLY ONE red fire hydrant at the kerb at a "
        "fixed position AND EXACTLY ONE tree trunk beside it at a fixed position AND EXACTLY ONE {van} "
        "parked on the road at a fixed position. Wet paving slabs, fallen leaves, soft low sunlight, city "
        "skyline in haze. Realistic photographic street scene.")
CAMERA = ("Third-person view, the dog locked at the exact centre of the frame at constant size and distance. "
          "Neither the dog nor the camera moves on its own; arrow-key look-input is the only source of "
          "camera motion, arcing the camera around the stationary, centred dog only while held.")
IDLE = "The dog stands still on the pavement, ears relaxed, tail low, breathing gently. The van stays parked."


def mask_img():
    m = Image.new("L", (W, H), 0)
    x0, y0, x1, y1 = int(MASK[0] * W), int(MASK[1] * H), int(MASK[2] * W), int(MASK[3] * H)
    ImageDraw.Draw(m).rectangle((x0, y0, x1, y1), fill=255)
    return m.filter(ImageFilter.GaussianBlur(10))


def composite(x2_path, name):
    base = Image.open(SEED_IMG).convert("RGB").resize((W, H), Image.LANCZOS)
    x2 = Image.open(x2_path).convert("RGB").resize((W, H), Image.LANCZOS)
    out = Image.composite(x2, base, mask_img())
    p = os.path.join(HERE, name); out.save(p); return p


def diff(a, b):
    m = np.asarray(mask_img()) > 128
    d = np.abs(np.asarray(a).astype(np.int16) - np.asarray(b).astype(np.int16)).mean(axis=2)
    if d.shape != m.shape:
        m = np.asarray(mask_img().resize((d.shape[1], d.shape[0]))) > 128
    return round(float(d[m].mean()), 1), round(float(d[~m].mean()), 1)


async def main():
    ref_white = composite(X2_WHITE, "patch_white.png")
    ref_navy = composite(X2_NAVY, "patch_navy.png")
    r = Reactor(model_name="reactor/lingbot-world-2", api_key=os.environ["REACTOR_API_KEY"],
                max_session_duration_seconds=HARD_CAP_S)
    latest = {"frame": None, "n": 0}
    accepted = asyncio.Event()
    loop = asyncio.get_running_loop()

    @r.on_message
    def _m(msg):
        t = msg.get("type") if isinstance(msg, dict) else str(msg)
        if t == "image_accepted": loop.call_soon_threadsafe(accepted.set)
        if t in ("command_error", "error"): print("MODEL ERROR:", str(msg)[:300], flush=True)

    def on_frame(frame):
        f = np.asarray(frame)
        if f.ndim == 4: f = f[-1]
        latest["frame"] = f; latest["n"] += 1

    T0 = time.time()
    await r.connect()
    while r.status != ReactorStatus.READY:
        if time.time() - T0 > 120: raise SystemExit("session never became ready")
        await asyncio.sleep(0.2)
    r.tracks.with_direction("recvonly").with_kind("video").one().on_frame(on_frame)

    async def anchor(path, van, label):
        accepted.clear(); t = time.time()
        await r.send_command("set_image", {"image": await r.upload_file(path)})
        try: await asyncio.wait_for(accepted.wait(), 60)
        except asyncio.TimeoutError: print("no image_accepted in 60s", flush=True)
        await r.send_command("set_seed", {"seed": SEED})
        await r.send_command("set_attn_window", {"attn_window": "small"})
        await r.send_command("set_prompt", {"prompt": " ".join([BASE.format(van=van), CAMERA, IDLE])})
        await asyncio.sleep(0.65)
        n0 = latest["n"]; await r.send_command("start", {})
        while latest["n"] == n0:
            if time.time() - t > 90: raise SystemExit(f"{label}: no frame")
            await asyncio.sleep(0.05)
        first = time.time()
        await asyncio.sleep(3)
        f = latest["frame"].copy(); Image.fromarray(f).save(os.path.join(HERE, f"patch_live_{label}.png"))
        return f, first - t

    try:
        a, ta = await anchor(ref_white, "white panel van", "white")
        t = time.time(); await r.send_command("reset", {})
        b, tb = await anchor(ref_navy, "dark navy blue panel van", "navy")
        print(f"launch {ta:.1f}s; correction reset->first frame {time.time()-t-3:.1f}s", flush=True)
        print(f"live white vs live navy: inside mask {diff(a, b)[0]}, outside mask {diff(a, b)[1]}", flush=True)
        print(f"reference white vs live white: inside {diff(Image.open(ref_white), a)[0]}, outside {diff(Image.open(ref_white), a)[1]}", flush=True)
    finally:
        try: await r.disconnect()
        except Exception as e: print("disconnect error", e)
        print(f"session seconds ~{time.time()-T0:.0f}", flush=True)


asyncio.run(main())
