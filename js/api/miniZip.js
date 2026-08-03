// Minimal single-entry ZIP extractor -- just enough to unwrap NSE's F&O bhavcopy download
// (BhavCopy_NSE_FO_..._F_0000.csv.zip), which always contains exactly one CSV file. Not a
// general-purpose ZIP reader: no central directory, no multi-entry support, no data-descriptor
// (streamed) entries -- verified against a real downloaded file during planning that NSE's zip
// uses the plain case (sizes present directly in the local file header, general-purpose flag
// bit 3 unset), which is what this reads. Uses the browser's native DecompressionStream, so no
// external inflate library is needed.
//
// ZIP local file header layout (fixed 30-byte prefix), all multi-byte fields little-endian:
//   0..3   signature (0x04034b50)
//   8..9   compression method (0 = stored, 8 = deflate)
//   18..21 compressed size
//   22..25 uncompressed size
//   26..27 filename length (n)
//   28..29 extra field length (m)
//   30..30+n         filename
//   30+n..30+n+m      extra field
//   30+n+m..+compSize compressed data

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

export async function unzipSingleEntry(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const signature = view.getUint32(0, true);
  if (signature !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Not a ZIP file (bad local file header signature)");
  }

  const generalPurposeFlag = view.getUint16(6, true);
  const compressionMethod = view.getUint16(8, true);
  const compressedSize = view.getUint32(18, true);
  const uncompressedSize = view.getUint32(22, true);
  const filenameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);

  if ((generalPurposeFlag & 0x0008) !== 0 || compressedSize === 0) {
    throw new Error("Unsupported ZIP entry: sizes are in a trailing data descriptor, not the local header");
  }

  const dataOffset = 30 + filenameLength + extraLength;
  const compressedBytes = arrayBuffer.slice(dataOffset, dataOffset + compressedSize);

  let outBytes;
  if (compressionMethod === 0) {
    outBytes = compressedBytes; // stored, no compression
  } else if (compressionMethod === 8) {
    const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    outBytes = await new Response(stream).arrayBuffer();
  } else {
    throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
  }

  if (uncompressedSize && outBytes.byteLength !== uncompressedSize) {
    throw new Error(`Decompressed size mismatch: expected ${uncompressedSize}, got ${outBytes.byteLength}`);
  }
  return outBytes;
}
