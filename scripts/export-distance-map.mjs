import fs from 'node:fs/promises';
import sharp from 'sharp';
import { DEFAULTS, validateSettings } from '../lib/measurement/geometry.ts';
import { exportData, overlaySvg } from '../lib/measurement/export.ts';
// Optional exported mapping JSON, otherwise regenerate the provisional starter.
const input = process.argv[2] ? JSON.parse(await fs.readFile(process.argv[2], 'utf8')) : null;
const settings = input ? validateSettings(input.settings ?? input) : DEFAULTS;
const data = exportData(settings);
await fs.mkdir('public/witness', { recursive:true });
const background = await sharp('public/bastille-court-photosphere.jpg').resize(2048,920).toBuffer();
await sharp(background).composite([{input:Buffer.from(overlaySvg(settings))}]).png().toFile('public/witness/distance-annotated.png');
await sharp(Buffer.from(overlaySvg(settings,false))).png().toFile('public/witness/distance-dots.png');
await fs.writeFile('public/witness/distance-mapping.json',JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({dots:data.dots.length,fitRms:data.calibration.fitRms,crossValidationRms:data.calibration.crossValidationRms,camera:data.calibration.geo,output:'public/witness/distance-annotated.png'},null,2));
