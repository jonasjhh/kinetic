// Extracts the greyscale (luma) plane of a camera VideoFrame.
//
// Android camera frames normally arrive as NV12/I420, whose first plane
// already *is* luma, so this is a plain memory copy. RGB frames get a
// weighted sum, and frames with no CPU-readable format fall back to
// drawing through an OffscreenCanvas.

const Y_PLANE_FORMATS = new Set(["I420", "I420A", "I422", "I444", "NV12"]);

export interface LumaReader {
  read(
    frame: VideoFrame,
    dest: Uint8Array,
    width: number,
    height: number,
  ): Promise<void>;
}

export function frameSize(frame: VideoFrame): {
  width: number;
  height: number;
} {
  const rect = frame.visibleRect;
  return rect
    ? { width: rect.width, height: rect.height }
    : { width: frame.displayWidth, height: frame.displayHeight };
}

export function createLumaReader(): LumaReader {
  let scratch = new Uint8Array(0);
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;

  const ensureScratch = (size: number) => {
    if (scratch.length < size) scratch = new Uint8Array(size);
    return scratch;
  };

  return {
    async read(frame, dest, width, height) {
      const format = frame.format;
      if (format && Y_PLANE_FORMATS.has(format)) {
        const buffer = ensureScratch(frame.allocationSize());
        const layout = await frame.copyTo(buffer);
        const { offset, stride } = layout[0];
        if (stride === width) {
          dest.set(buffer.subarray(offset, offset + width * height));
        } else {
          for (let y = 0; y < height; y++) {
            const start = offset + y * stride;
            dest.set(buffer.subarray(start, start + width), y * width);
          }
        }
        return;
      }

      if (
        format === "RGBA" ||
        format === "RGBX" ||
        format === "BGRA" ||
        format === "BGRX"
      ) {
        const buffer = ensureScratch(frame.allocationSize());
        const layout = await frame.copyTo(buffer);
        const { offset, stride } = layout[0];
        const [ri, bi] = format.startsWith("RGB") ? [0, 2] : [2, 0];
        for (let y = 0; y < height; y++) {
          let p = offset + y * stride;
          let o = y * width;
          for (let x = 0; x < width; x++, p += 4) {
            dest[o++] =
              (77 * buffer[p + ri] +
                150 * buffer[p + 1] +
                29 * buffer[p + bi]) >>
              8;
          }
        }
        return;
      }

      if (!canvas || canvas.width !== width || canvas.height !== height) {
        canvas = new OffscreenCanvas(width, height);
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      }
      if (!ctx) throw new Error("No 2D context for frame readback");
      ctx.drawImage(frame, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      for (let i = 0, p = 0; i < width * height; i++, p += 4) {
        dest[i] = (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2]) >> 8;
      }
    },
  };
}
