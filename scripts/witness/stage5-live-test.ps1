# BUILD.md stage 5 on the real app, driven from Windows because WSL cannot reach Chrome's
# DevTools port (hub runbook: headless-browser-css-checks). Starts headless Windows Chrome,
# drives the page over CDP with in-page JavaScript, screenshots each step, and always kills
# Chrome so the X2 session ends.
param(
  [string]$Url = "http://localhost:3012/",
  [string]$Out = "$env:TEMP\witness-stage5"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$port = 9333
$origin = ([Uri]$Url).GetLeftPart([UriPartial]::Authority)
$chromeArgs = @(
  "--headless=new", "--remote-debugging-port=$port", "--user-data-dir=$Out\profile",
  "--window-size=1440,900", "--autoplay-policy=no-user-gesture-required",
  "--unsafely-treat-insecure-origin-as-secure=$origin", "--no-first-run",
  "--no-default-browser-check", "--ignore-gpu-blocklist", "about:blank"
)
$log = New-Object System.Collections.ArrayList
function Note($m) { $line = "{0} {1}" -f (Get-Date -Format HH:mm:ss), $m; Write-Output $line; [void]$log.Add($line) }

$proc = Start-Process -FilePath $chrome -ArgumentList $chromeArgs -PassThru
$ws = $null
try {
  $targets = $null
  for ($i = 0; $i -lt 40 -and -not $targets; $i++) {
    Start-Sleep -Milliseconds 500
    try { $targets = Invoke-RestMethod "http://127.0.0.1:$port/json/list" } catch {}
  }
  $page = @($targets | Where-Object { $_.type -eq "page" })[0]
  if (-not $page) { throw "no Chrome page target" }
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  $script:nextId = 0

  function Send-Cdp([string]$method, $params) {
    $script:nextId++
    $myId = $script:nextId
    $msg = @{ id = $myId; method = $method; params = $params } | ConvertTo-Json -Depth 12 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $ws.SendAsync([ArraySegment[byte]]$bytes, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
    $buffer = New-Object byte[] 1048576
    while ($true) {
      $stream = New-Object IO.MemoryStream
      do {
        $result = $ws.ReceiveAsync([ArraySegment[byte]]$buffer, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $stream.Write($buffer, 0, $result.Count)
      } while (-not $result.EndOfMessage)
      $reply = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
      if ($reply.id -eq $myId) { return $reply }
    }
  }
  function Eval-Page([string]$js) {
    $r = Send-Cdp "Runtime.evaluate" @{ expression = $js; awaitPromise = $true; returnByValue = $true }
    if ($r.result.exceptionDetails) { return "EXCEPTION: " + ($r.result.exceptionDetails | ConvertTo-Json -Depth 6 -Compress) }
    return $r.result.result.value
  }
  function Shot([string]$name) {
    $r = Send-Cdp "Page.captureScreenshot" @{ format = "png" }
    [IO.File]::WriteAllBytes("$Out\$name", [Convert]::FromBase64String($r.result.data))
  }

  [void](Send-Cdp "Emulation.setDeviceMetricsOverride" @{ width = 1440; height = 900; deviceScaleFactor = 1; mobile = $false })
  [void](Send-Cdp "Page.navigate" @{ url = $Url })
  Start-Sleep -Seconds 6

  $helpers = @'
if (!window.__h) { const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(text));
async function until(test, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(250); } return null; }
function coverage() {
  const c = document.querySelector("canvas.x2-overlay");
  if (!c || !c.width) return { coverage: 0, mean: null };
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0, r = 0, g = 0, b = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] > 200) { n++; r += d[i - 3]; g += d[i - 2]; b += d[i - 1]; }
  return { coverage: +(n / (d.length / 16) * 100).toFixed(3), mean: n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null };
}
window.__h = { sleep, button, until, coverage }; }
'@

  $step1 = $helpers + @'
(async () => {
  const { sleep, button, until, coverage } = window.__h;
  window.__errs = [];
  window.addEventListener("error", (e) => __errs.push("error: " + e.message));
  window.addEventListener("unhandledrejection", (e) => __errs.push("rejection: " + (e.reason && e.reason.message || e.reason)));
  const origError = console.error; console.error = (...a) => { __errs.push("console: " + a.map(String).join(" ").slice(0, 300)); origError(...a); };
  const look = await until(() => button("Look around"), 30000);
  if (!look) return JSON.stringify({ ok: false, why: "no Look around button" });
  look.click();
  const controls = await until(() => document.querySelector(".witness-controls"), 90000);
  if (!controls) return JSON.stringify({ ok: false, why: "controls never appeared", errs: __errs });
  const host = [...document.querySelectorAll("*")].find((el) => el.photoSphereViewer);
  if (!host) return JSON.stringify({ ok: false, why: "viewer not found" });
  const v = host.photoSphereViewer;
  const s = v.dataHelper.textureCoordsToSphericalCoords({ textureX: 5150, textureY: 2300 });
  // The gyroscope plugin holds the view on a desktop with no motion sensor; stop it so the
  // test can turn the camera, as a user would by dragging.
  const gyro = v.plugins && Object.values(v.plugins).find((pl) => pl && pl.constructor && pl.constructor.id === "gyroscope");
  let gyroStopped = false;
  try { if (gyro) { gyro.stop(); gyroStopped = true; } } catch (e) {}
  v.zoom(45); v.rotate({ yaw: s.yaw, pitch: s.pitch });
  await sleep(1500);
  const pos = v.getPosition();
  const turned = Math.abs(Math.atan2(Math.sin(pos.yaw - s.yaw), Math.cos(pos.yaw - s.yaw))) < 0.05;
  return JSON.stringify({ ok: turned, yaw: s.yaw, pitch: s.pitch, position: pos, gyroFound: !!gyro, gyroStopped, secure: window.isSecureContext });
})()
'@
  Note ("step 1 (enter, point at van): " + (Eval-Page $step1))
  Shot "0-view-before-start.png"

  $step2 = $helpers + @'
(async () => {
  const { sleep, button, until, coverage } = window.__h;
  const t0 = Date.now();
  const start = button("Start reconstruction");
  if (!start) return JSON.stringify({ ok: false, why: "no Start button" });
  start.click();
  const state = await until(() => {
    const err = document.querySelector(".witness-controls__error");
    if (err) return "error: " + err.textContent;
    return document.querySelector(".witness-controls__status strong")?.textContent === "Live" ? "live" : null;
  }, 120000);
  const liveAfter = (Date.now() - t0) / 1000;
  if (state !== "live") return JSON.stringify({ ok: false, state, liveAfter, errs: __errs });
  const seen = await until(() => { const c = coverage(); return c.coverage > 0.2 ? c : null; }, 40000);
  return JSON.stringify({ ok: !!seen, liveAfter, vanAfter: (Date.now() - t0) / 1000, overlay: seen || coverage(), errs: __errs });
})()
'@
  Note ("step 2 (start X2, wait for van): " + (Eval-Page $step2))
  Start-Sleep -Milliseconds 1500
  Shot "1-white-van.png"

  $step3 = $helpers + @'
(async () => {
  const { sleep, button, until, coverage } = window.__h;
  const before = coverage();
  const labels = [];
  for (let i = 0; i < 3; i++) {
    const next = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Next"));
    if (!next || next.disabled) break;
    next.click(); await sleep(700);
    labels.push(document.querySelector(".scene-playback strong")?.textContent || "?");
  }
  const applied = document.querySelector(".witness-controls__correction small")?.textContent || null;
  await sleep(9000);
  return JSON.stringify({ steps: labels, correctionLabel: applied, before, after: coverage(), errs: __errs });
})()
'@
  Note ("step 3 (correction, 9 s later): " + (Eval-Page $step3))
  Shot "2-navy-van.png"

  $step4 = $helpers + @'
(async () => {
  const { sleep, button, until, coverage } = window.__h;
  button("Debug")?.click();
  await sleep(6000);
  return JSON.stringify({ mode: document.querySelector(".witness-controls__mode")?.textContent || null, overlay: coverage(), pill: !!document.querySelector(".reconstruction-status"), errs: __errs });
})()
'@
  Note ("step 4 (debug readout after 6 s): " + (Eval-Page $step4))
  Shot "3-debug.png"
}
catch { Note ("FAILED: " + $_.Exception.Message) }
finally {
  if ($ws) { try { $ws.Dispose() } catch {} }
  if ($proc -and -not $proc.HasExited) { & taskkill.exe /PID $proc.Id /T /F | Out-Null }
  Note "Chrome closed (X2 session ends)"
  $log | Set-Content -Path "$Out\log.txt"
}
