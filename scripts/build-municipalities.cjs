// Bouwt een kleine, openbare kaartasset. Er worden geen workshopgegevens gelezen.
// Download vooraf de GeoJSON via de URL in SOURCE (EPSG:28992) en geef dat pad mee.
const fs = require('node:fs');
const SOURCE = 'https://api.pdok.nl/kadaster/brk-bestuurlijke-gebieden/ogc/v1/collections/gemeentegebied/items?f=json&limit=1000&crs=http://www.opengis.net/def/crs/EPSG/0/28992';
const input = process.argv[2];
if (!input) throw new Error('Gebruik: node scripts/build-municipalities.cjs /pad/naar/gemeenten.geojson');
const collection = JSON.parse(fs.readFileSync(input, 'utf8'));
if (!Array.isArray(collection.features) || collection.features.length < 300 ||
    (collection.links || []).some(link => link.rel === 'next')) {
  throw new Error('Verwacht een volledige Nederlandse gemeentecollectie zonder volgende pagina.');
}

function distanceSquared(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length)) : 0;
  return (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2;
}

function simplify(points) {
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop();
    let maximum = 75 ** 2; // 75 meter: uitsluitend een overzichtskaart.
    let selected = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = distanceSquared(points[index], points[start], points[end]);
      if (distance > maximum) { maximum = distance; selected = index; }
    }
    if (selected !== -1) {
      keep.add(selected);
      pending.push([start, selected], [selected, end]);
    }
  }
  const result = [...keep].sort((a, b) => a - b).map(index => points[index]);
  return result.length >= 4 ? result : points;
}

function contains(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function bounds(points) {
  return points.reduce((box, p) => [Math.min(box[0], p[0]), Math.min(box[1], p[1]),
    Math.max(box[2], p[0]), Math.max(box[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
}

function area(ring) {
  return Math.abs(ring.reduce((sum, point, i) => {
    const next = ring[(i + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0));
}

function labelPoint(polygons) {
  const polygon = polygons.reduce((best, item) => area(item[0]) > area(best[0]) ? item : best);
  const box = bounds(polygon[0]);
  let best = polygon[0][0];
  let maximum = -1;
  for (let x = 0; x <= 30; x += 1) for (let y = 0; y <= 30; y += 1) {
    const point = [box[0] + (box[2] - box[0]) * x / 30, box[1] + (box[3] - box[1]) * y / 30];
    if (!contains(point, polygon[0]) || polygon.slice(1).some(ring => contains(point, ring))) continue;
    let distance = Infinity;
    polygon.forEach(ring => ring.slice(1).forEach((end, index) => {
      distance = Math.min(distance, distanceSquared(point, ring[index], end));
    }));
    if (distance > maximum) { maximum = distance; best = point; }
  }
  return best.map(value => Math.round(value * 100) / 100);
}

const municipalities = collection.features.map(feature => {
  const geometry = feature.geometry;
  const properties = feature.properties;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !properties.naam || !properties.code) {
    throw new Error('Onverwachte gemeentegeometrie of ontbrekende gemeentecode.');
  }
  const first = geometry.type === 'Polygon' ? geometry.coordinates[0][0] : geometry.coordinates[0][0][0];
  if (!first || first[1] < 200000 || first[1] > 800000) {
    throw new Error('Verwacht RD New / EPSG:28992-coördinaten, geen lengte- en breedtegraden.');
  }
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
    .map(polygon => polygon.map(ring => simplify(ring).map(point => [
      Math.round(point[0] / 5) / 100,
      Math.round((630000 - point[1]) / 5) / 100
    ])));
  const points = polygons.flat(2);
  return {
    code: 'GM' + properties.code,
    name: properties.naam,
    bounds: bounds(points),
    label: labelPoint(polygons),
    path: polygons.flat().map(ring => 'M' + ring.map(point => point.join(',')).join('L') + 'Z').join('')
  };
}).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
if (new Set(municipalities.map(item => item.code)).size !== municipalities.length) {
  throw new Error('Dubbele gemeentecodes in de bron.');
}
const data = {
  source: 'Kadaster / PDOK, Bestuurlijke Gebieden',
  url: SOURCE,
  license: 'CC BY 4.0',
  retrievedAt: new Date().toISOString().slice(0, 10),
  projection: 'EPSG:28992, SVG-eenheid = 500 meter',
  municipalities
};
fs.writeFileSync('src/Municipalities.html',
  '<!-- Openbare gemeentegrenzen; gegenereerd met scripts/build-municipalities.cjs. -->\n' +
  '<script type="application/json" id="municipalityData">\n' +
  JSON.stringify(data).replace(/</g, '\\u003c') + '\n</script>\n');
console.log(municipalities.length + ' gemeenten, ' + fs.statSync('src/Municipalities.html').size + ' bytes.');
