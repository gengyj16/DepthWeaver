import assert from 'node:assert/strict';
import test from 'node:test';
import { maskToRgba, prepareDepthGuidedBackground } from './spatial-photo';

function makeRgba(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const result = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) result.set(pixel(x, y), (y * width + x) * 4);
  }
  return result;
}

test('depth-guided fill reconstructs the near side of an occlusion edge', () => {
  const width = 32, height = 20, split = 14;
  const image = makeRgba(width, height, (x) => x < split ? [20, 80, 220, 255] : [220, 40, 30, 255]);
  const depth = makeRgba(width, height, (x) => {
    const value = x < split ? 25 : 230;
    return [value, value, value, 255];
  });
  const result = prepareDepthGuidedBackground(image, depth, width, height, { edgeThreshold: 0.08, fillRadius: 6 });
  const pixel = Math.floor(height / 2) * width + split + 2;
  assert.ok(result.maskedPixelCount > 0);
  assert.equal(result.mask[pixel], 255);
  assert.ok(result.background[pixel * 4 + 2] > result.background[pixel * 4]);
  assert.equal(result.background[pixel * 4 + 3], 255);
});

test('depth-guided fill follows a reversed near-to-far edge', () => {
  const width = 32, height = 20, split = 16;
  const image = makeRgba(width, height, (x) => x < split ? [230, 35, 25, 255] : [15, 90, 225, 255]);
  const depth = makeRgba(width, height, (x) => {
    const value = x < split ? 230 : 25;
    return [value, value, value, 255];
  });
  const result = prepareDepthGuidedBackground(image, depth, width, height, { edgeThreshold: 0.08, fillRadius: 6 });
  const pixel = Math.floor(height / 2) * width + split - 3;
  assert.equal(result.mask[pixel], 255);
  assert.ok(result.background[pixel * 4 + 2] > result.background[pixel * 4]);
});

test('flat depth maps do not create an inpainting mask', () => {
  const width = 16, height = 12;
  const image = makeRgba(width, height, () => [100, 120, 140, 255]);
  const depth = makeRgba(width, height, () => [128, 128, 128, 255]);
  const result = prepareDepthGuidedBackground(image, depth, width, height, { edgeThreshold: 0.08, fillRadius: 5 });
  assert.equal(result.maskedPixelCount, 0);
  assert.deepEqual(result.background, image);
});

test('maskToRgba emits an opaque grayscale mask', () => {
  assert.deepEqual(maskToRgba(new Uint8ClampedArray([0, 255])), new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]));
});

test('depth-guided fill rejects mismatched RGBA buffers', () => {
  assert.throws(
    () => prepareDepthGuidedBackground(new Uint8ClampedArray(12), new Uint8ClampedArray(16), 2, 2, { edgeThreshold: 0.08, fillRadius: 4 }),
    /matching dimensions/,
  );
});
