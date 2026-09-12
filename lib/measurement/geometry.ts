// Metric geometry for this cropped equirectangular panorama. Never measure the
// stretched image with a single pixels-per-metre ratio.
export type Point = { x: number; y: number };
export type Geo = { lat: number; lon: number };
export type Landmark = { id: string; name: string; image: Point; geo: Geo; check: boolean };
export type Settings = { camera: Geo; horizon: number; heading: number; height: number; spacing: number; maxDistance: number; landmarks: Landmark[]; polygon: Point[]; manual: Point[]; excluded: string[]; route: Point[] };
export const WIDTH = 2048;
export const HEIGHT = 920;
export const SOURCE_WIDTH = 9216;
export const SOURCE_HEIGHT = 4140;
export const ORIGIN: Geo = { lat: 51.5056239, lon: -0.1057864 };
const R = 6378137;
const RAD = Math.PI / 180;
export function toLocal(g: Geo, origin = ORIGIN): Point {
  return { x: (g.lon - origin.lon) * RAD * R * Math.cos(origin.lat * RAD), y: (g.lat - origin.lat) * RAD * R };
}
export function toGeo(p: Point, origin = ORIGIN): Geo {
  return { lat: origin.lat + p.y / (RAD * R), lon: origin.lon + p.x / (RAD * R * Math.cos(origin.lat * RAD)) };
}
export function mapPixel(g: Geo, zoom: number): Point {
  const n = 256 * 2 ** zoom;
  return { x: (g.lon + 180) / 360 * n, y: (1 - Math.asinh(Math.tan(g.lat * RAD)) / Math.PI) / 2 * n };
}
export function mapGeo(p: Point, zoom: number): Geo {
  const n = 256 * 2 ** zoom;
  return { lon: p.x / n * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * p.y / n))) / RAD };
}
// Coordinates in a horizontal plane one metre below the camera. XMP says the
// full sphere is 9216x4608, cropped to 9216x4140 at (0,0): horizon is y=512 here.
export function groundRay(p: Point, horizon: number, heading: number): Point | null {
  const down = (p.y - horizon) / WIDTH * 2 * Math.PI;
  if (down < 2 * RAD || down >= Math.PI / 2 || p.x < 0 || p.x > WIDTH || p.y > HEIGHT) return null;
  const bearing = (p.x / WIDTH * 360 - 180 + heading) * RAD;
  const radius = 1 / Math.tan(down);
  return { x: Math.sin(bearing) * radius, y: Math.cos(bearing) * radius };
}
export type Calibration = { a: number; b: number; camera: Point; fitted: boolean; fitRms: number | null; checkRms: number | null; crossValidationRms: number | null; errors: { id: string; metres: number; check: boolean }[]; height: number; warning: string | null };
function fitPairs(pairs: { ray: Point; ground: Point }[]) {
  const n = pairs.length;
  const mean = (f: (p: typeof pairs[number]) => number) => pairs.reduce((s, p) => s + f(p), 0) / n;
  const ux = mean(p => p.ray.x), uy = mean(p => p.ray.y), vx = mean(p => p.ground.x), vy = mean(p => p.ground.y);
  let denominator = 0, real = 0, imaginary = 0;
  for (const p of pairs) {
    const x = p.ray.x - ux, y = p.ray.y - uy, X = p.ground.x - vx, Y = p.ground.y - vy;
    denominator += x*x + y*y; real += x*X + y*Y; imaginary += x*Y - y*X;
  }
  if (denominator < 0.01) return null;
  const a = real / denominator, b = imaginary / denominator;
  if (!Number.isFinite(a + b) || Math.hypot(a,b) < 0.3 || Math.hypot(a,b) > 5) return null;
  return { a, b, camera: { x: vx - a*ux + b*uy, y: vy - b*ux - a*uy } };
}
function transform(p: Point, fit: { a: number; b: number; camera: Point }): Point {
  return { x: fit.camera.x + fit.a*p.x - fit.b*p.y, y: fit.camera.y + fit.b*p.x + fit.a*p.y };
}
const rms = (values: number[]) => values.length ? Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length) : null;
export function calibrate(s: Settings): Calibration {
  const all = s.landmarks.flatMap(l => { const ray = groundRay(l.image,s.horizon,s.heading); return ray ? [{ ...l, ray, ground: toLocal(l.geo) }] : []; });
  const training = all.filter(l => !l.check);
  const fit = training.length >= 4 ? fitPairs(training) : null;
  const base = fit ?? { a: s.height, b: 0, camera: toLocal(s.camera) };
  const errors = fit ? all.map(l => ({ id:l.id, check:l.check, metres: Math.hypot(transform(l.ray,fit).x-l.ground.x,transform(l.ray,fit).y-l.ground.y) })) : [];
  const cv = fit ? training.flatMap((p,i) => { const f = fitPairs(training.filter((_,j)=>j!==i)); if (!f) return []; const q=transform(p.ray,f); return [Math.hypot(q.x-p.ground.x,q.y-p.ground.y)]; }) : [];
  return { ...base, fitted:!!fit, height:Math.hypot(base.a,base.b), fitRms:rms(errors.filter(e=>!e.check).map(e=>e.metres)), checkRms:rms(errors.filter(e=>e.check).map(e=>e.metres)), crossValidationRms:cv.length===training.length?rms(cv):null, errors, warning:!fit ? 'Uncalibrated: assumed camera height and level ground. Add four spread-out ground landmarks.' : 'Map estimates only. Flat, level ground assumed; map checks do not establish survey accuracy.' };
}
export function inside(p: Point, polygon: Point[]) {
  let yes=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) yes=!yes;
  }
  return yes;
}
export function measurement(p: Point, s: Settings, c = calibrate(s)) {
  const ray=groundRay(p,s.horizon,s.heading); if(!ray) return null;
  const ground=transform(ray,c), distance=Math.hypot(ground.x-c.camera.x,ground.y-c.camera.y);
  if(!Number.isFinite(distance) || distance>s.maxDistance) return null;
  return { ...p, distance, slantDistance:Math.hypot(distance,c.height), ground, geo:toGeo(ground), textureX:p.x/WIDTH*SOURCE_WIDTH, textureY:p.y/HEIGHT*SOURCE_HEIGHT };
}
export function dots(s: Settings) {
  const c=calibrate(s), result=[];
  const spacing=Math.max(25,Math.min(300,s.spacing));
  for(let y=spacing/2;y<HEIGHT-12;y+=spacing) for(let x=spacing/2;x<WIDTH-12;x+=spacing) {
    const id=`grid-${x}-${y}`;
    if(inside({x,y},s.polygon)&&!s.excluded.includes(id)) { const m=measurement({x,y},s,c);if(m)result.push({id,...m}); }
  }
  s.manual.forEach((p,i)=>{const m=measurement(p,s,c);if(m)result.push({id:`manual-${i}`,...m});});
  return result;
}
export function routeLength(s: Settings) {
  const c=calibrate(s);let length=0;
  for(let i=1;i<s.route.length;i++) { const a=measurement(s.route[i-1],s,c),b=measurement(s.route[i],s,c);if(a&&b)length+=Math.hypot(a.ground.x-b.ground.x,a.ground.y-b.ground.y); }
  return length;
}
const aerial = (x:number,y:number) => mapGeo({x:261988*256+x,y:174342*256+y},19);
export const DEFAULTS: Settings = {
 camera:ORIGIN,horizon:512,heading:94,height:1.65,spacing:25,maxDistance:30,
 // Manually interpreted curb matches on Esri imagery. Provisional, not surveyed.
 landmarks:[
 {id:'L1',name:'Pub frontage curb, projecting corner',image:{x:850,y:606},geo:aerial(491,369),check:false},
 {id:'L2',name:'Pub east curb bend',image:{x:991,y:548},geo:aerial(539,353),check:false},
 {id:'L3',name:'Opposite low-building curb bend',image:{x:1350,y:566},geo:aerial(513,422),check:false},
 {id:'L4',name:'West curb beside parked car',image:{x:324,y:661},geo:aerial(419,363),check:false},
 ],
 polygon:[{x:0,y:780},{x:160,y:730},{x:340,y:690},{x:345,y:540},{x:380,y:515},{x:530,y:575},{x:850,y:630},{x:1020,y:535},{x:1300,y:538},{x:1420,y:650},{x:1740,y:750},{x:2048,y:790},{x:2048,y:910},{x:0,y:910}],
 manual:[],excluded:[],route:[],
};
export function validateSettings(value: unknown): Settings {
 if(!value || typeof value!=='object')throw new Error('Expected a measurement settings object.');
 const s=value as Settings;
 const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
 const point=(p:Point)=>p&&finite(p.x)&&finite(p.y)&&p.x>=0&&p.x<=WIDTH&&p.y>=0&&p.y<=HEIGHT;
 const geo=(g:Geo)=>g&&finite(g.lat)&&finite(g.lon)&&Math.abs(g.lat)<85&&Math.abs(g.lon)<=180;
 if(!geo(s.camera)||!finite(s.horizon)||s.horizon<400||s.horizon>600||!finite(s.heading)||Math.abs(s.heading)>360||!finite(s.height)||s.height<0.3||s.height>5||!finite(s.spacing)||s.spacing<25||s.spacing>300||!finite(s.maxDistance)||s.maxDistance<2||s.maxDistance>100)throw new Error('Invalid camera or grid settings.');
 for(const name of ['polygon','manual','route'] as const)if(!Array.isArray(s[name])||s[name].length>5000||!s[name].every(point))throw new Error(`Invalid ${name} points.`);
 if(!Array.isArray(s.excluded)||s.excluded.length>5000||!s.excluded.every(x=>typeof x==='string'))throw new Error('Invalid excluded dots.');
 if(!Array.isArray(s.landmarks)||s.landmarks.length>100||!s.landmarks.every(l=>typeof l.id==='string'&&typeof l.name==='string'&&point(l.image)&&geo(l.geo)&&typeof l.check==='boolean')||new Set(s.landmarks.map(l=>l.id)).size!==s.landmarks.length)throw new Error('Invalid landmarks.');
 return s;
}

export function dotStyle(spacing: number) {
 const scale=Math.min(1,spacing/100);
 return {radius:Math.max(2,6*scale),fontSize:Math.max(7,19*scale),offset:Math.max(6,15*scale),stroke:Math.max(1,4*scale),labelWidth:spacing<60?spacing-3:undefined};
}
