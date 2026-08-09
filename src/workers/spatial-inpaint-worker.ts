/// <reference lib="webworker" />

import { prepareDepthGuidedBackground } from '@/lib/spatial-photo';

const MODEL_URL =
  process.env.NEXT_PUBLIC_MIGAN_MODEL_URL ??
  'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';
const MODEL_CACHE = 'depthweaver-models-v1';

interface PrepareRequest {
  type: 'prepare';
  requestId: number;
  payload: {
    image: ArrayBuffer;
    depth: ArrayBuffer;
    width: number;
    height: number;
    edgeThreshold: number;
    fillRadius: number;
  };
}

interface EnhanceRequest {
  type: 'enhance';
  requestId: number;
  payload: {
    image: ArrayBuffer;
    mask: ArrayBuffer;
    width: number;
    height: number;
  };
}

type SpatialWorkerRequest = PrepareRequest | EnhanceRequest;
type OrtModule = typeof import('onnxruntime-web');
type OrtSession = import('onnxruntime-web').InferenceSession;

let ortModule: OrtModule | null = null;
let session: OrtSession | null = null;
let sessionProvider: 'webgpu' | 'wasm' | null = null;
let modelBuffer: ArrayBuffer | null = null;

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

function postStatus(requestId: number, message: string, progress?: number) {
  workerScope.postMessage({ type: 'status', requestId, payload: { message, progress } });
}

async function fetchModel(requestId: number): Promise<ArrayBuffer> {
  if (modelBuffer) return modelBuffer;

  if ('caches' in workerScope) {
    try {
      const cache = await caches.open(MODEL_CACHE);
      const cached = await cache.match(MODEL_URL);
      if (cached) {
        postStatus(requestId, '正在从本地缓存加载补全模型…', 100);
        modelBuffer = await cached.arrayBuffer();
        return modelBuffer;
      }
    } catch (error) {
      console.warn('Unable to read the MI-GAN model cache; downloading instead.', error);
    }
  }

  postStatus(requestId, '首次使用：正在下载 28.1 MB 补全模型…', 0);
  const response = await fetch(MODEL_URL, { mode: 'cors' });
  if (!response.ok) throw new Error(`模型下载失败 (${response.status})`);

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body?.getReader();
  let downloadedBuffer: ArrayBuffer;

  if (!reader) {
    downloadedBuffer = await response.arrayBuffer();
  } else {
    const chunks: Uint8Array[] = [];
    let downloaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      downloaded += value.byteLength;
      const progress = contentLength > 0 ? (downloaded / contentLength) * 100 : undefined;
      postStatus(requestId, '正在下载本地补全模型…', progress);
    }
    const joined = new Uint8Array(downloaded);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    downloadedBuffer = joined.buffer;
  }

  if ('caches' in workerScope) {
    try {
      const cache = await caches.open(MODEL_CACHE);
      await cache.put(
        MODEL_URL,
        new Response(downloadedBuffer.slice(0), {
          headers: { 'content-type': 'application/octet-stream' },
        }),
      );
    } catch (error) {
      // Private browsing and storage quotas can disable Cache API writes. The
      // downloaded model is still valid for this inference session.
      console.warn('Unable to persist the MI-GAN model cache.', error);
    }
  }

  modelBuffer = downloadedBuffer;
  return modelBuffer;
}

async function createSession(
  requestId: number,
  provider: 'webgpu' | 'wasm',
): Promise<OrtSession> {
  const ort = (ortModule ??= await import('onnxruntime-web'));
  ort.env.wasm.numThreads = 1;
  const model = await fetchModel(requestId);
  postStatus(
    requestId,
    provider === 'webgpu' ? '正在初始化 WebGPU 补全模型…' : '正在初始化 WASM 补全模型…',
  );
  return ort.InferenceSession.create(model, {
    executionProviders: [provider],
    graphOptimizationLevel: 'all',
  });
}

async function getSession(requestId: number): Promise<OrtSession> {
  if (session) return session;
  const hasWebGpu = Boolean((workerScope.navigator as Navigator & { gpu?: unknown }).gpu);
  const preferredProvider: 'webgpu' | 'wasm' = hasWebGpu ? 'webgpu' : 'wasm';

  try {
    session = await createSession(requestId, preferredProvider);
    sessionProvider = preferredProvider;
  } catch (error) {
    if (preferredProvider === 'wasm') throw error;
    postStatus(requestId, 'WebGPU 初始化失败，正在切换到 WASM…');
    session = await createSession(requestId, 'wasm');
    sessionProvider = 'wasm';
  }
  return session;
}

function rgbaToChw(image: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const pixelCount = width * height;
  const chw = new Uint8Array(pixelCount * 3);
  for (let index = 0; index < pixelCount; index += 1) {
    const rgbaOffset = index * 4;
    chw[index] = image[rgbaOffset];
    chw[pixelCount + index] = image[rgbaOffset + 1];
    chw[pixelCount * 2 + index] = image[rgbaOffset + 2];
  }
  return chw;
}

function chwToRgba(data: ArrayLike<number>, width: number, height: number): Uint8ClampedArray {
  const pixelCount = width * height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let index = 0; index < pixelCount; index += 1) {
    const rgbaOffset = index * 4;
    rgba[rgbaOffset] = data[index];
    rgba[rgbaOffset + 1] = data[pixelCount + index];
    rgba[rgbaOffset + 2] = data[pixelCount * 2 + index];
    rgba[rgbaOffset + 3] = 255;
  }
  return rgba;
}

async function enhanceWithMiGan(request: EnhanceRequest) {
  const { requestId, payload } = request;
  const { width, height } = payload;
  const image = new Uint8ClampedArray(payload.image);
  const mask = new Uint8ClampedArray(payload.mask);
  const pixelCount = width * height;

  if (image.length !== pixelCount * 4 || mask.length !== pixelCount) {
    throw new Error('补全输入尺寸不匹配');
  }
  if (!mask.some((value) => value > 0)) {
    workerScope.postMessage(
      { type: 'enhanced', requestId, payload: { background: image.buffer, width, height, provider: 'none' } },
      [image.buffer],
    );
    return;
  }

  const ort = (ortModule ??= await import('onnxruntime-web'));
  const activeSession = await getSession(requestId);
  postStatus(requestId, '正在设备上补全被遮挡背景…');

  const imageTensor = new ort.Tensor('uint8', rgbaToChw(image, width, height), [1, 3, height, width]);
  const knownMask = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) knownMask[index] = mask[index] > 0 ? 0 : 255;
  const maskTensor = new ort.Tensor('uint8', knownMask, [1, 1, height, width]);
  const imageInput = activeSession.inputNames.find((name: string) => /image|img/i.test(name)) ?? activeSession.inputNames[0];
  const maskInput = activeSession.inputNames.find((name: string) => /mask/i.test(name)) ?? activeSession.inputNames[1];
  let inferenceSession = activeSession;
  let output: import('onnxruntime-web').Tensor | null = null;

  try {
    let results;
    try {
      results = await inferenceSession.run({ [imageInput]: imageTensor, [maskInput]: maskTensor });
    } catch (error) {
      if (sessionProvider !== 'webgpu') throw error;
      postStatus(requestId, 'WebGPU 推理失败，正在切换到 WASM…');
      await inferenceSession.release().catch(() => undefined);
      session = null;
      sessionProvider = null;
      inferenceSession = await createSession(requestId, 'wasm');
      session = inferenceSession;
      sessionProvider = 'wasm';
      results = await inferenceSession.run({ [imageInput]: imageTensor, [maskInput]: maskTensor });
    }

    output = results[inferenceSession.outputNames[0]];
    const background = chwToRgba(output.data as Uint8Array, width, height);
    workerScope.postMessage(
      { type: 'enhanced', requestId, payload: { background: background.buffer, width, height, provider: sessionProvider } },
      [background.buffer],
    );
  } finally {
    imageTensor.dispose();
    maskTensor.dispose();
    output?.dispose();
  }
}

workerScope.onmessage = async (event: MessageEvent<SpatialWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'prepare') {
      const { payload, requestId } = request;
      postStatus(requestId, '正在分析深度遮挡边界…');
      const result = prepareDepthGuidedBackground(
        new Uint8ClampedArray(payload.image),
        new Uint8ClampedArray(payload.depth),
        payload.width,
        payload.height,
        { edgeThreshold: payload.edgeThreshold, fillRadius: payload.fillRadius },
      );
      workerScope.postMessage(
        {
          type: 'prepared',
          requestId,
          payload: {
            background: result.background.buffer,
            mask: result.mask.buffer,
            width: result.width,
            height: result.height,
            maskedPixelCount: result.maskedPixelCount,
          },
        },
        [result.background.buffer, result.mask.buffer],
      );
      return;
    }
    await enhanceWithMiGan(request);
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      requestId: request.requestId,
      payload: { message: error instanceof Error ? error.message : '空间照片处理失败' },
    });
  }
};

export {};
