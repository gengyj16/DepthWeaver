"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import type { DepthWeaverSceneHandle } from './depth-weaver-scene';
import {
  maskToRgba,
  SPATIAL_ASSET_VERSION,
  type SpatialAssetMetadata,
  type SpatialInpaintMethod,
} from '@/lib/spatial-photo';

const MAX_PROCESSING_DIMENSION = 1280;
const MAX_RAY_STEPS = 32;

export interface SpatialPhotoAssetUrls {
  backgroundUrl: string;
  maskUrl: string;
  metadata: SpatialAssetMetadata;
}

export interface GeneratedSpatialPhotoAssets {
  background: Blob;
  mask: Blob;
  metadata: SpatialAssetMetadata;
}

interface SpatialPhotoSceneProps {
  image: string;
  depthMap: string;
  assets: SpatialPhotoAssetUrls | null;
  parallaxStrength: number;
  focusDepth: number;
  renderQuality: number;
  useSensor: boolean;
  aiEnhance: boolean;
  regenerationToken: number;
  onAssetsGenerated: (assets: GeneratedSpatialPhotoAssets) => void;
}

interface LoadedPixels {
  image: Uint8ClampedArray;
  depth: Uint8ClampedArray;
  width: number;
  height: number;
}

interface PendingWorkerRequest {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform sampler2D uImage;
  uniform sampler2D uDepth;
  uniform sampler2D uBackground;
  uniform sampler2D uMask;
  uniform vec2 uOffset;
  uniform vec2 uResolution;
  uniform vec2 uTextureSize;
  uniform float uImageAspect;
  uniform float uFocusDepth;
  uniform float uRaySteps;

  varying vec2 vUv;

  vec2 coverUv(vec2 screenUv) {
    float viewportAspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 point = screenUv - vec2(0.5);
    if (viewportAspect > uImageAspect) {
      point.y *= uImageAspect / viewportAspect;
    } else {
      point.x *= viewportAspect / uImageAspect;
    }
    return point / 1.065 + vec2(0.5);
  }

  bool insideImage(vec2 uv) {
    return uv.x >= 0.001 && uv.x <= 0.999 && uv.y >= 0.001 && uv.y <= 0.999;
  }

  void main() {
    vec2 baseUv = coverUv(vUv);
    vec2 ray = uOffset;
    float bestScore = -1.0;
    float bestDepth = texture2D(uDepth, baseUv).r;
    vec2 bestUv = baseUv;

    for (int index = 0; index < ${MAX_RAY_STEPS}; index++) {
      if (float(index) >= uRaySteps) break;
      float denominator = max(uRaySteps - 1.0, 1.0);
      float layerDepth = 1.0 - float(index) / denominator;
      vec2 candidateUv = baseUv + (layerDepth - uFocusDepth) * ray;
      if (!insideImage(candidateUv)) continue;

      float sampledDepth = texture2D(uDepth, candidateUv).r;
      float error = abs(sampledDepth - layerDepth);
      float confidence = 1.0 - smoothstep(0.012, 0.09, error);
      float score = confidence + sampledDepth * 0.018;
      if (score > bestScore) {
        bestScore = score;
        bestDepth = sampledDepth;
        bestUv = candidateUv;
      }
    }

    vec2 texel = vec2(1.0) / max(uTextureSize, vec2(1.0));
    float edge = 0.0;
    edge = max(edge, abs(bestDepth - texture2D(uDepth, bestUv + vec2(texel.x, 0.0)).r));
    edge = max(edge, abs(bestDepth - texture2D(uDepth, bestUv + vec2(0.0, texel.y)).r));
    edge = smoothstep(0.025, 0.12, edge);

    vec4 surface = texture2D(uImage, bestUv);
    vec2 backgroundUv = clamp(baseUv + (0.08 - uFocusDepth) * ray, vec2(0.002), vec2(0.998));
    vec4 reconstructed = texture2D(uBackground, backgroundUv);
    float reconstructionMask = texture2D(uMask, bestUv).r;
    float motion = smoothstep(0.002, 0.018, length(ray));
    float missingConfidence = 1.0 - clamp(bestScore, 0.0, 1.0);
    float disocclusion = motion * clamp(
      missingConfidence * 1.65 + edge * reconstructionMask * 0.82,
      0.0,
      1.0
    );

    gl_FragColor = mix(surface, reconstructed, disocclusion);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片资源加载失败'));
    image.src = url;
  });
}

async function loadSpatialPixels(imageUrl: string, depthUrl: string): Promise<LoadedPixels> {
  const [image, depth] = await Promise.all([loadImageElement(imageUrl), loadImageElement(depthUrl)]);
  const scale = Math.min(1, MAX_PROCESSING_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法创建图像处理画布');

  context.drawImage(image, 0, 0, width, height);
  const imagePixels = context.getImageData(0, 0, width, height).data;
  context.clearRect(0, 0, width, height);
  context.drawImage(depth, 0, 0, width, height);
  const depthPixels = context.getImageData(0, 0, width, height).data;
  return {
    image: new Uint8ClampedArray(imagePixels),
    depth: new Uint8ClampedArray(depthPixels),
    width,
    height,
  };
}

async function loadMaskPixels(url: string, width: number, height: number): Promise<Uint8ClampedArray> {
  const image = await loadImageElement(url);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法读取补全遮罩');
  context.drawImage(image, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8ClampedArray(width * height);
  for (let index = 0; index < mask.length; index += 1) mask[index] = rgba[index * 4];
  return mask;
}

function pixelsToPngBlob(pixels: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('浏览器无法编码空间照片资源'));
      return;
    }
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('空间照片资源编码失败'));
    }, 'image/png');
  });
}

function pickRecordingMimeType(): string | undefined {
  const options = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return options.find((option) => MediaRecorder.isTypeSupported(option));
}

export const SpatialPhotoScene = forwardRef<DepthWeaverSceneHandle, SpatialPhotoSceneProps>(
  (
    {
      image,
      depthMap,
      assets,
      parallaxStrength,
      focusDepth,
      renderQuality,
      useSensor,
      aiEnhance,
      regenerationToken,
      onAssetsGenerated,
    },
    ref,
  ) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const pendingRequestsRef = useRef(new Map<number, PendingWorkerRequest>());
    const requestIdRef = useRef(0);
    const sourcePixelsRef = useRef<LoadedPixels | null>(null);
    const aiAttemptedRef = useRef<string | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const materialRef = useRef<THREE.ShaderMaterial | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const targetOffsetRef = useRef(new THREE.Vector2());
    const currentOffsetRef = useRef(new THREE.Vector2());
    const pointerRef = useRef({ dragging: false, x: 0, y: 0 });
    const initialOrientationRef = useRef<{ beta: number | null; gamma: number | null }>({ beta: null, gamma: null });
    const recordingRef = useRef(false);
    const parallaxStrengthRef = useRef(parallaxStrength);
    const [status, setStatus] = useState<string | null>(assets ? null : '正在准备空间照片…');
    const [progress, setProgress] = useState<number | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    useEffect(() => {
      parallaxStrengthRef.current = parallaxStrength;
      targetOffsetRef.current.clampScalar(-parallaxStrength, parallaxStrength);
    }, [parallaxStrength]);

    const ensureWorker = useCallback(() => {
      if (workerRef.current) return workerRef.current;
      const worker = new Worker(new URL('../workers/spatial-inpaint-worker.ts', import.meta.url));
      worker.onmessage = (event: MessageEvent) => {
        const { type, requestId, payload } = event.data as {
          type: string;
          requestId: number;
          payload: Record<string, unknown> & { message?: string; progress?: number };
        };
        if (type === 'status') {
          setStatus(payload.message ?? null);
          setProgress(typeof payload.progress === 'number' ? payload.progress : null);
          return;
        }
        const pending = pendingRequestsRef.current.get(requestId);
        if (!pending) return;
        pendingRequestsRef.current.delete(requestId);
        if (type === 'error') pending.reject(new Error(payload.message ?? '空间照片处理失败'));
        else pending.resolve(payload);
      };
      worker.onerror = () => {
        const error = new Error('空间照片处理线程异常终止');
        for (const pending of pendingRequestsRef.current.values()) pending.reject(error);
        pendingRequestsRef.current.clear();
        if (workerRef.current === worker) workerRef.current = null;
        worker.terminate();
      };
      workerRef.current = worker;
      return worker;
    }, []);

    const disposeWorker = useCallback((reason: string) => {
      const worker = workerRef.current;
      if (!worker) return;
      worker.terminate();
      workerRef.current = null;
      const error = new Error(reason);
      for (const pending of pendingRequestsRef.current.values()) pending.reject(error);
      pendingRequestsRef.current.clear();
    }, []);

    const runWorkerRequest = useCallback(
      (type: 'prepare' | 'enhance', payload: Record<string, unknown>, transfer: Transferable[]) => {
        const worker = ensureWorker();
        const requestId = ++requestIdRef.current;
        return new Promise<Record<string, unknown>>((resolve, reject) => {
          pendingRequestsRef.current.set(requestId, { resolve, reject });
          worker.postMessage({ type, requestId, payload }, transfer);
        });
      },
      [ensureWorker],
    );

    useEffect(() => () => disposeWorker('空间照片处理已取消'), [disposeWorker]);

    useEffect(() => {
      let cancelled = false;
      if (assets) {
        setStatus(null);
        return;
      }
      setWarning(null);
      setStatus('正在读取原图和深度图…');
      setProgress(null);

      const prepare = async () => {
        try {
          const source = await loadSpatialPixels(image, depthMap);
          if (cancelled) return;
          sourcePixelsRef.current = source;
          const fillRadius = Math.round(Math.min(source.width, source.height) * 0.045);
          const imageBuffer = source.image.slice().buffer;
          const depthBuffer = source.depth.slice().buffer;
          const result = await runWorkerRequest(
            'prepare',
            {
              image: imageBuffer,
              depth: depthBuffer,
              width: source.width,
              height: source.height,
              edgeThreshold: 0.075,
              fillRadius,
            },
            [imageBuffer, depthBuffer],
          );
          if (cancelled) return;
          const width = result.width as number;
          const height = result.height as number;
          const mask = new Uint8ClampedArray(result.mask as ArrayBuffer);
          const [backgroundBlob, maskBlob] = await Promise.all([
            pixelsToPngBlob(new Uint8ClampedArray(result.background as ArrayBuffer), width, height),
            pixelsToPngBlob(maskToRgba(mask), width, height),
          ]);
          if (cancelled) return;
          onAssetsGenerated({
            background: backgroundBlob,
            mask: maskBlob,
            metadata: {
              version: SPATIAL_ASSET_VERSION,
              width,
              height,
              method: 'layered-depth-fill',
              maskedPixelCount: result.maskedPixelCount as number,
              layerCount: result.layerCount as number,
            },
          });
          setStatus(null);
        } catch (error) {
          if (cancelled) return;
          setStatus(null);
          setWarning(error instanceof Error ? error.message : '空间背景生成失败');
        }
      };
      void prepare();
      return () => { cancelled = true; };
    }, [assets, depthMap, image, onAssetsGenerated, regenerationToken, runWorkerRequest]);

    useEffect(() => {
      let cancelled = false;
      if (!aiEnhance) {
        aiAttemptedRef.current = null;
        if (assets) {
          setStatus(null);
          setProgress(null);
          setWarning(null);
        }
        return;
      }
      if (!assets || assets.metadata.method === 'migan') return;
      const attemptKey = `${image}:${assets.metadata.width}x${assets.metadata.height}:${regenerationToken}`;
      if (aiAttemptedRef.current === attemptKey) return;
      aiAttemptedRef.current = attemptKey;

      const enhance = async () => {
        try {
          setWarning(null);
          let source = sourcePixelsRef.current;
          if (!source || source.width !== assets.metadata.width || source.height !== assets.metadata.height) {
            source = await loadSpatialPixels(image, depthMap);
            sourcePixelsRef.current = source;
          }
          const mask = await loadMaskPixels(assets.maskUrl, source.width, source.height);
          const imageBuffer = source.image.slice().buffer;
          const maskBuffer = mask.buffer;
          const result = await runWorkerRequest(
            'enhance',
            { image: imageBuffer, mask: maskBuffer, width: source.width, height: source.height },
            [imageBuffer, maskBuffer],
          );
          if (cancelled) return;
          const backgroundBlob = await pixelsToPngBlob(
            new Uint8ClampedArray(result.background as ArrayBuffer),
            source.width,
            source.height,
          );
          const maskBlob = await fetch(assets.maskUrl).then((response) => response.blob());
          if (cancelled) return;
          onAssetsGenerated({
            background: backgroundBlob,
            mask: maskBlob,
            metadata: {
              ...assets.metadata,
              method: result.provider === 'none' ? 'layered-depth-fill' : 'migan',
            },
          });
          setStatus(null);
          setProgress(null);
        } catch (error) {
          if (cancelled) return;
          setStatus(null);
          setProgress(null);
          setWarning(`AI 补全不可用，已保留快速补全结果：${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
          if (!cancelled) disposeWorker('空间照片 AI 处理已结束');
        }
      };
      void enhance();
      return () => {
        cancelled = true;
        disposeWorker('空间照片 AI 处理已取消');
      };
    }, [aiEnhance, assets, depthMap, disposeWorker, image, onAssetsGenerated, regenerationToken, runWorkerRequest]);

    useEffect(() => {
      if (!assets || !mountRef.current) return;
      let cancelled = false;
      const mount = mountRef.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      rendererRef.current = renderer;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      sceneRef.current = scene;
      cameraRef.current = camera;
      const textureLoader = new THREE.TextureLoader();
      const loadTexture = (url: string, color = false) =>
        new Promise<THREE.Texture>((resolve, reject) => {
          textureLoader.load(
            url,
            (texture) => {
              texture.minFilter = THREE.LinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.generateMipmaps = false;
              if (color) texture.colorSpace = THREE.SRGBColorSpace;
              resolve(texture);
            },
            undefined,
            () => reject(new Error('空间照片纹理加载失败')),
          );
        });

      const textures: THREE.Texture[] = [];
      Promise.all([
        loadTexture(image, true),
        loadTexture(depthMap),
        loadTexture(assets.backgroundUrl, true),
        loadTexture(assets.maskUrl),
      ])
        .then(([imageTexture, depthTexture, backgroundTexture, maskTexture]) => {
          if (cancelled) {
            imageTexture.dispose();
            depthTexture.dispose();
            backgroundTexture.dispose();
            maskTexture.dispose();
            return;
          }
          textures.push(imageTexture, depthTexture, backgroundTexture, maskTexture);
          const imageElement = imageTexture.image as HTMLImageElement;
          const material = new THREE.ShaderMaterial({
            uniforms: {
              uImage: { value: imageTexture },
              uDepth: { value: depthTexture },
              uBackground: { value: backgroundTexture },
              uMask: { value: maskTexture },
              uOffset: { value: currentOffsetRef.current },
              uResolution: { value: new THREE.Vector2(mount.clientWidth, mount.clientHeight) },
              uTextureSize: { value: new THREE.Vector2(imageElement.width, imageElement.height) },
              uImageAspect: { value: imageElement.width / imageElement.height },
              uFocusDepth: { value: focusDepth },
              uRaySteps: { value: Math.min(MAX_RAY_STEPS, Math.max(8, renderQuality)) },
            },
            vertexShader,
            fragmentShader,
            depthTest: false,
            depthWrite: false,
          });
          materialRef.current = material;
          scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

          const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            if (!recordingRef.current) {
              currentOffsetRef.current.lerp(targetOffsetRef.current, 0.12);
              material.uniforms.uOffset.value.copy(currentOffsetRef.current);
            }
            renderer.render(scene, camera);
          };
          animate();
        })
        .catch((error) => {
          if (!cancelled) setWarning(error instanceof Error ? error.message : '空间照片渲染失败');
        });

      const resize = () => {
        const width = mount.clientWidth;
        const height = mount.clientHeight;
        renderer.setSize(width, height);
        materialRef.current?.uniforms.uResolution.value.set(width, height);
      };
      window.addEventListener('resize', resize);

      return () => {
        cancelled = true;
        window.removeEventListener('resize', resize);
        if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        for (const texture of textures) texture.dispose();
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) object.material.dispose();
        });
        materialRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
        rendererRef.current = null;
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
        renderer.dispose();
      };
    }, [assets?.backgroundUrl, assets?.maskUrl, depthMap, image]);

    useEffect(() => {
      if (materialRef.current) {
        materialRef.current.uniforms.uFocusDepth.value = focusDepth;
        materialRef.current.uniforms.uRaySteps.value = Math.min(MAX_RAY_STEPS, Math.max(8, renderQuality));
      }
    }, [focusDepth, renderQuality]);

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;
      const pointerDown = (event: PointerEvent) => {
        if (useSensor || recordingRef.current) return;
        pointerRef.current = { dragging: true, x: event.clientX, y: event.clientY };
        mount.setPointerCapture(event.pointerId);
        mount.style.cursor = 'grabbing';
      };
      const pointerMove = (event: PointerEvent) => {
        if (!pointerRef.current.dragging || useSensor || recordingRef.current) return;
        const deltaX = event.clientX - pointerRef.current.x;
        const deltaY = event.clientY - pointerRef.current.y;
        pointerRef.current.x = event.clientX;
        pointerRef.current.y = event.clientY;
        const strength = parallaxStrengthRef.current;
        targetOffsetRef.current.x = THREE.MathUtils.clamp(
          targetOffsetRef.current.x - deltaX / Math.max(mount.clientWidth, 1) * strength * 2.8,
          -strength,
          strength,
        );
        targetOffsetRef.current.y = THREE.MathUtils.clamp(
          targetOffsetRef.current.y + deltaY / Math.max(mount.clientHeight, 1) * strength * 2.8,
          -strength,
          strength,
        );
      };
      const pointerUp = (event: PointerEvent) => {
        pointerRef.current.dragging = false;
        if (mount.hasPointerCapture(event.pointerId)) mount.releasePointerCapture(event.pointerId);
        mount.style.cursor = useSensor ? 'default' : 'grab';
      };
      const reset = () => targetOffsetRef.current.set(0, 0);
      mount.addEventListener('pointerdown', pointerDown);
      mount.addEventListener('pointermove', pointerMove);
      mount.addEventListener('pointerup', pointerUp);
      mount.addEventListener('pointercancel', pointerUp);
      mount.addEventListener('dblclick', reset);
      mount.style.cursor = useSensor ? 'default' : 'grab';
      return () => {
        mount.removeEventListener('pointerdown', pointerDown);
        mount.removeEventListener('pointermove', pointerMove);
        mount.removeEventListener('pointerup', pointerUp);
        mount.removeEventListener('pointercancel', pointerUp);
        mount.removeEventListener('dblclick', reset);
      };
    }, [useSensor]);

    useEffect(() => {
      if (!useSensor) {
        initialOrientationRef.current = { beta: null, gamma: null };
        targetOffsetRef.current.set(0, 0);
        return;
      }
      const orientation = (event: DeviceOrientationEvent) => {
        if (event.beta === null || event.gamma === null || recordingRef.current) return;
        if (initialOrientationRef.current.beta === null || initialOrientationRef.current.gamma === null) {
          initialOrientationRef.current = { beta: event.beta, gamma: event.gamma };
        }
        const betaOrigin = initialOrientationRef.current.beta;
        const gammaOrigin = initialOrientationRef.current.gamma;
        if (betaOrigin === null || gammaOrigin === null) return;
        const strength = parallaxStrengthRef.current;
        targetOffsetRef.current.set(
          THREE.MathUtils.clamp((event.gamma - gammaOrigin) / 20, -1, 1) * strength,
          THREE.MathUtils.clamp((event.beta - betaOrigin) / 20, -1, 1) * -strength,
        );
      };
      window.addEventListener('deviceorientation', orientation);
      return () => window.removeEventListener('deviceorientation', orientation);
    }, [useSensor]);

    useImperativeHandle(ref, () => ({
      async handleExport() {
        throw new Error('空间照片模式不支持 GLB 导出，请切换到经典模式。');
      },
      async startRecording(duration: number) {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const material = materialRef.current;
        if (!renderer || !scene || !camera || !material) throw new Error('空间照片尚未准备完成');
        if (recordingRef.current) throw new Error('录制已在进行中');
        if (typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持画布录制');

        const captureCanvas = renderer.domElement as HTMLCanvasElement & {
          captureStream: (frameRate?: number) => MediaStream;
        };
        if (!captureCanvas.captureStream) throw new Error('当前浏览器不支持画布录制');
        const stream = captureCanvas.captureStream(30);
        const mimeType = pickRecordingMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const chunks: Blob[] = [];
        recordingRef.current = true;
        const originalOffset = currentOffsetRef.current.clone();

        const stopped = new Promise<Blob>((resolve, reject) => {
          recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
          recorder.onerror = () => reject(new Error('浏览器录制空间照片失败'));
          recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType ?? 'video/webm' }));
        });

        try {
          recorder.start();
          const startedAt = performance.now();
          await new Promise<void>((resolve) => {
            const frame = (now: number) => {
              const progressValue = Math.min(1, (now - startedAt) / duration);
              const angle = progressValue * Math.PI * 2;
              const radius = Math.sin(progressValue * Math.PI) * parallaxStrengthRef.current;
              currentOffsetRef.current.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.72);
              material.uniforms.uOffset.value.copy(currentOffsetRef.current);
              renderer.render(scene, camera);
              if (progressValue < 1) requestAnimationFrame(frame);
              else resolve();
            };
            requestAnimationFrame(frame);
          });
          recorder.stop();
          const blob = await stopped;
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `spatial-photo-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
          anchor.click();
          URL.revokeObjectURL(url);
        } finally {
          if (recorder.state === 'recording') recorder.stop();
          stream.getTracks().forEach((track) => track.stop());
          currentOffsetRef.current.copy(originalOffset);
          targetOffsetRef.current.copy(originalOffset);
          material.uniforms.uOffset.value.copy(originalOffset);
          recordingRef.current = false;
        }
      },
    }));

    const methodLabel = (assets?.metadata.method as SpatialInpaintMethod | undefined) === 'migan'
      ? 'AI 背景补全已完成'
      : `深度感知分层补全（${assets?.metadata.layerCount ?? 0} 层）`;

    return (
      <>
        <div ref={mountRef} className="absolute inset-0 h-full w-full bg-black" style={{ touchAction: 'none' }} />
        {(status || warning) && (
          <div className="pointer-events-none absolute left-1/2 top-20 z-20 w-[min(90vw,420px)] -translate-x-1/2 rounded-xl border border-white/10 bg-black/65 px-4 py-3 text-sm text-white shadow-xl backdrop-blur-md">
            {status && <p>{status}</p>}
            {status && progress !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(2, Math.min(100, progress))}%` }} />
              </div>
            )}
            {warning && <p className="text-amber-200">{warning}</p>}
          </div>
        )}
        {assets && !status && !warning && (
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs text-white/70 backdrop-blur-sm">
            {methodLabel} · 拖动浏览 · 双击复位
          </div>
        )}
      </>
    );
  },
);

SpatialPhotoScene.displayName = 'SpatialPhotoScene';
