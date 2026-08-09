export const SPATIAL_ASSET_VERSION = 1;

export type SpatialInpaintMethod = 'depth-fill' | 'migan';

export interface SpatialProcessingOptions {
  /** Minimum normalized depth jump considered an occlusion boundary. */
  edgeThreshold: number;
  /** Number of pixels reconstructed behind the near side of an edge. */
  fillRadius: number;
}

export interface SpatialPreparedPixels {
  background: Uint8ClampedArray;
  mask: Uint8ClampedArray;
  maskedPixelCount: number;
  width: number;
  height: number;
}

export interface SpatialAssetMetadata {
  version: number;
  width: number;
  height: number;
  method: SpatialInpaintMethod;
  maskedPixelCount: number;
}

export type SpatialMaskProvider = (
  image: Uint8ClampedArray,
  depth: Uint8ClampedArray,
  width: number,
  height: number,
  options: SpatialProcessingOptions,
) => SpatialPreparedPixels;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const pixelOffset = (x: number, y: number, width: number) => (y * width + x) * 4;

/**
 * Builds a narrow disocclusion mask directly from depth discontinuities.
 * The depth gradient points from the farther surface towards the nearer one.
 */
export function prepareDepthGuidedBackground(
  image: Uint8ClampedArray,
  depth: Uint8ClampedArray,
  width: number,
  height: number,
  options: SpatialProcessingOptions,
): SpatialPreparedPixels {
  const expectedLength = width * height * 4;
  if (image.length !== expectedLength || depth.length !== expectedLength) {
    throw new Error('Image and depth buffers must be RGBA buffers with matching dimensions.');
  }

  const edgeThreshold = clamp(options.edgeThreshold, 0.01, 0.5);
  const fillRadius = Math.round(clamp(options.fillRadius, 2, Math.max(2, Math.min(width, height) / 5)));
  const background = new Uint8ClampedArray(image);
  const mask = new Uint8ClampedArray(width * height);
  const contributionCount = new Uint16Array(width * height);
  const readDepth = (x: number, y: number) => depth[pixelOffset(x, y, width)] / 255;

  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const dx = readDepth(x + 1, y) - readDepth(x - 1, y);
      const dy = readDepth(x, y + 1) - readDepth(x, y - 1);
      const magnitude = Math.hypot(dx, dy);
      if (magnitude < edgeThreshold) continue;

      // Positive depth is treated as nearer, matching the legacy renderer.
      const normalX = dx / magnitude;
      const normalY = dy / magnitude;
      const nearDepth = readDepth(
        clamp(Math.round(x + normalX * 2), 0, width - 1),
        clamp(Math.round(y + normalY * 2), 0, height - 1),
      );
      const farDepth = readDepth(
        clamp(Math.round(x - normalX * 2), 0, width - 1),
        clamp(Math.round(y - normalY * 2), 0, height - 1),
      );
      if (nearDepth - farDepth < edgeThreshold * 0.75) continue;

      for (let step = 0; step <= fillRadius; step += 1) {
        const targetX = Math.round(x + normalX * step);
        const targetY = Math.round(y + normalY * step);
        if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) break;

        const sourceDistance = 2 + Math.min(fillRadius, step * 0.35);
        const sourceX = clamp(Math.round(x - normalX * sourceDistance), 0, width - 1);
        const sourceY = clamp(Math.round(y - normalY * sourceDistance), 0, height - 1);
        const sourceIndex = pixelOffset(sourceX, sourceY, width);
        const targetPixel = targetY * width + targetX;
        const targetIndex = targetPixel * 4;
        const count = contributionCount[targetPixel] + 1;
        contributionCount[targetPixel] = count;
        mask[targetPixel] = 255;
        for (let channel = 0; channel < 3; channel += 1) {
          const previous = background[targetIndex + channel];
          background[targetIndex + channel] = Math.round(
            previous + (image[sourceIndex + channel] - previous) / count,
          );
        }
        background[targetIndex + 3] = 255;
      }
    }
  }

  const closedMask = new Uint8ClampedArray(mask);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (mask[index] !== 0) continue;
      let neighbours = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          if (mask[(y + oy) * width + x + ox] !== 0) neighbours += 1;
        }
      }
      if (neighbours >= 5) closedMask[index] = 255;
    }
  }

  let maskedPixelCount = 0;
  for (let index = 0; index < closedMask.length; index += 1) {
    if (closedMask[index] === 0) continue;
    maskedPixelCount += 1;
    if (mask[index] !== 0) continue;

    const x = index % width;
    const y = Math.floor(index / width);
    let samples = 0;
    const targetIndex = index * 4;
    const sum = [0, 0, 0];
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const neighbour = (y + oy) * width + x + ox;
        if (mask[neighbour] === 0) continue;
        const neighbourIndex = neighbour * 4;
        sum[0] += background[neighbourIndex];
        sum[1] += background[neighbourIndex + 1];
        sum[2] += background[neighbourIndex + 2];
        samples += 1;
      }
    }
    if (samples > 0) {
      background[targetIndex] = Math.round(sum[0] / samples);
      background[targetIndex + 1] = Math.round(sum[1] / samples);
      background[targetIndex + 2] = Math.round(sum[2] / samples);
      background[targetIndex + 3] = 255;
    }
  }

  return { background, mask: closedMask, maskedPixelCount, width, height };
}

export function maskToRgba(mask: Uint8ClampedArray): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(mask.length * 4);
  for (let index = 0; index < mask.length; index += 1) {
    const value = mask[index];
    const offset = index * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}
