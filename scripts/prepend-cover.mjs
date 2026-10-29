import { readFileSync, writeFileSync } from 'node:fs';

// Prepend the existing book-cover JPG to the free PDF as page one.
// The PDF interior is preserved byte-for-byte (incremental PDF update).
const pdfPath = 'public/books/a-theory-of-minimal-tolerance.pdf';
const coverPath = 'public/images/book-cover.jpg';
const original = readFileSync(pdfPath);
const cover = readFileSync(coverPath);
const marker = '% MinimalToleranceFrontCover:v1';
if (original.subarray(Math.max(0, original.length - 4096)).toString('latin1').includes(marker)) {
  console.log('Front cover already included.');
  process.exit(0);
}
if (original.subarray(0, 8).toString('latin1').startsWith('%PDF-') === false) throw Error('Not a PDF');
const source = original.toString('latin1');
const trailers = [...source.matchAll(/trailer\s*<<(.*?)>>\s*startxref\s*(\d+)\s*%%EOF/gs)];
const lastTrailer = trailers.at(-1);
if (!lastTrailer) throw Error('Unsupported PDF trailer');
const trailer = lastTrailer[1];
const prev = Number(lastTrailer[2]);
const size = Number(trailer.match(/\/Size\s+(\d+)/)?.[1]);
const root = trailer.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
if (!Number.isSafeInteger(size) || !root || root[2] !== '0') throw Error('Unexpected PDF catalog');
const catalogId = Number(root[1]);
function obj(id) {
  const re = new RegExp('(?:^|[\\r\\n])' + id + ' 0 obj\\s*([\\s\\S]*?)\\s*endobj');
  const found = source.match(re);
  if (!found) throw Error('Missing PDF object ' + id);
  return found[1].trim();
}
const catalog = obj(catalogId);
const oldRootId = Number(catalog.match(/\/Pages\s+(\d+)\s+0\s+R/)?.[1]);
if (!oldRootId) throw Error('Could not find PDF page tree');
const oldRoot = obj(oldRootId);
const pageCount = Number(oldRoot.match(/\/Count\s+(\d+)/)?.[1]);
if (!Number.isSafeInteger(pageCount) || pageCount < 1 || /\/Parent\b/.test(oldRoot)) throw Error('Unexpected PDF page tree');
const revisedCatalog = catalog.replace(/\/Pages\s+\d+\s+0\s+R/, '/Pages ' + size + ' 0 R');
const revisedRoot = oldRoot.replace(/>>\s*$/, '/Parent ' + size + ' 0 R >>');
if (revisedCatalog === catalog || revisedRoot === oldRoot) throw Error('Could not update PDF tree');

if (cover[0] !== 255 || cover[1] !== 216) throw Error('Not a JPEG');
let dimensions;
for (let pos = 2; pos < cover.length - 10;) {
  if (cover[pos] !== 255) { pos++; continue; }
  const m = cover[pos + 1];
  if (m === 0xD8 || m === 0xD9 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { pos += 2; continue; }
  if (m === 0xDA) break;
  const len = cover.readUInt16BE(pos + 2);
  if ([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF].includes(m)) {
    dimensions = { height: cover.readUInt16BE(pos + 5), width: cover.readUInt16BE(pos + 7), components: cover[pos + 9] };
    break;
  }
  pos += 2 + len;
}
if (!dimensions) throw Error('Unable to read JPEG dimensions');
const cs = dimensions.components === 1 ? '/DeviceGray' : dimensions.components === 3 ? '/DeviceRGB' : dimensions.components === 4 ? '/DeviceCMYK' : null;
if (!cs) throw Error('Unsupported JPEG color model');
const w = 432, h = Number((w * dimensions.height / dimensions.width).toFixed(3));
const pageRoot = size, page = size + 1, image = size + 2, drawingObject = size + 3;
const chunks = [original], offsets = [];
let n = original.length;
function add(value) {
  const b = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
  chunks.push(b); n += b.length;
}
function addObj(id, body) {
  offsets.push([id, n]);
  add('\n' + id + ' 0 obj\n' + body + '\nendobj\n');
}
addObj(catalogId, revisedCatalog);
addObj(oldRootId, revisedRoot);
addObj(pageRoot, '<< /Type /Pages /Kids [' + page + ' 0 R ' + oldRootId + ' 0 R] /Count ' + (pageCount + 1) + ' >>');
addObj(page, '<< /Type /Page /Parent ' + pageRoot + ' 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /Cover ' + image + ' 0 R >> >> /Contents ' + drawingObject + ' 0 R >>');
offsets.push([image, n]);
add('\n' + image + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + dimensions.width + ' /Height ' + dimensions.height + ' /ColorSpace ' + cs + ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + cover.length + ' >>\nstream\n');
add(cover);
add('\nendstream\nendobj\n');
const draw = 'q\n' + w + ' 0 0 ' + h + ' 0 0 cm\n/Cover Do\nQ\n';
offsets.push([drawingObject, n]);
add('\n' + drawingObject + ' 0 obj\n<< /Length ' + Buffer.byteLength(draw) + ' >>\nstream\n' + draw + 'endstream\nendobj\n');
const xrefAt = n;
const entry = pair => String(pair[1]).padStart(10, '0') + ' 00000 n \n';
add('xref\n');
add(catalogId + ' 1\n' + entry(offsets.find(a => a[0] === catalogId)));
add(oldRootId + ' 1\n' + entry(offsets.find(a => a[0] === oldRootId)));
add(pageRoot + ' 4\n' + offsets.filter(a => a[0] >= pageRoot).map(entry).join(''));
const info = trailer.match(/\/Info\s+\d+\s+\d+\s+R/)?.[0] ?? '';
const id = trailer.match(/\/ID\s*\[\s*<[^>]+>\s*<[^>]+>\s*\]/)?.[0] ?? '';
add('trailer\n<< /Size ' + (drawingObject + 1) + ' /Root ' + catalogId + ' 0 R /Prev ' + prev + ' ' + info + ' ' + id + ' >>\nstartxref\n' + xrefAt + '\n%%EOF\n' + marker + '\n');
writeFileSync(pdfPath, Buffer.concat(chunks));
console.log('Prepending official front cover succeeded: ' + (pageCount + 1) + ' pages.');
