// Minimal .zip reader: enough to pull a .gba out of the archives ROM sites
// usually serve. Supports stored and deflated entries.
export async function extractFromZip(buffer, wanted = /\.(gba|agb|bin)$/i) {
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new Error('Arquivo .zip inválido.');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let i = 0; i < count; ++i) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (!wanted.test(name)) continue;

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = new Uint8Array(buffer, start, compressedSize);

    if (method === 0) {
      return { name, data: data.slice().buffer };
    }
    if (method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Este navegador não consegue abrir .zip. Extraia o .gba antes de importar.');
      }
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return { name, data: await new Response(stream).arrayBuffer() };
    }
    throw new Error('Compressão do .zip não suportada.');
  }
  throw new Error('Nenhum arquivo .gba encontrado dentro do .zip.');
}

function findEndOfCentralDirectory(view) {
  const min = Math.max(0, view.byteLength - 0xffff - 22);
  for (let i = view.byteLength - 22; i >= min; --i) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}
