// Minimal typings for the pure-JS HEIC decoders (they ship no types).

declare module "heic-decode" {
  interface DecodedImage {
    width: number;
    height: number;
    /** RGBA pixels, 4 bytes per pixel. */
    data: Uint8ClampedArray;
  }
  function decode(opts: { buffer: Buffer | Uint8Array | ArrayBuffer }): Promise<DecodedImage>;
  export default decode;
}

declare module "heic-convert" {
  function convert(opts: {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: "JPEG" | "PNG";
    quality?: number;
  }): Promise<ArrayBuffer>;
  export default convert;
}
