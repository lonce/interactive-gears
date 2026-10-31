import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const target = fileURLToPath(new URL('.', import.meta.url));
const scene = fs.readFileSync(new URL('artwork/gear-source.html', import.meta.url), 'utf8');
const spec = JSON.parse(fs.readFileSync(new URL('gear-spec.json', import.meta.url), 'utf8'));
const pieces = spec.gears.map(g => {
  const match = scene.match(new RegExp(`id="gear-${g.id}"[^>]*>(<svg[\\s\\S]*?<\\/svg>)`));
  if (!match) throw new Error(`Gear ${g.id} artwork is missing`);
  const inner = match[1].replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
    // The rotating offset silhouette suggested a second set of meshing teeth.
    .replace(/<path\b[^>]*transform="translate\(0,11\)"[^>]*\/>/g, '')
    .replace(/(fill="url\(#metal-[abc]\)" stroke="url\(#bevel-[abc]\)" stroke-width=")5(")/g, (_, before, after) => `${before}1.2${after}`);
  return `<g transform="translate(${g.x},${g.y})"><g id="rotor-${g.id}" transform="rotate(${g.phase * 180 / Math.PI})">${inner}</g><circle r="29" fill="url(#axle)" stroke="${g.id === 'b' ? '#d6b275' : '#9aabb5'}" stroke-width="3"/><text y="12" text-anchor="middle" fill="#f1f5f6" font-family="Arial,sans-serif" font-weight="700" font-size="36">${g.id}</text></g>`;
});
fs.writeFileSync(target + 'gears.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="330 60 1200 980" role="img" aria-label="Three steel gears. B drives A and C."><defs><linearGradient id="axle" x2="1" y2="1"><stop stop-color="#aebdc4"/><stop offset=".5" stop-color="#344c5b"/><stop offset="1" stop-color="#687e8a"/></linearGradient></defs>${pieces.join('')}</svg>`);
fs.writeFileSync(target + 'gear-spec.json', JSON.stringify(spec, null, 2));
console.log('Built standalone SVG artwork from the existing gear scene.');
