"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// Post-processing imports
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Custom shaders for post-processing
const colorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.0 },
    contrast: { value: 1.0 },
    brightness: { value: 1.0 },
    toneMapping: { value: 0 }, // 0: None, 1: ACESFilmic
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform float brightness;
    uniform int toneMapping;
    varying vec2 vUv;

    vec3 ACESFilmicToneMapping(vec3 color) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // Brightness
      color *= brightness;

      // Contrast
      color = (color - 0.5) * contrast + 0.5;

      // Saturation
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luminance), color, saturation);

      // Tone Mapping
      if (toneMapping == 1) {
        color = ACESFilmicToneMapping(color);
      }

      gl_FragColor = vec4(color, texel.a);
    }
  `
};

// Depth of Field shader
const depthOfFieldShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    focusDistance: { value: 0.5 },
    focusRange: { value: 0.1 },
    blurStrength: { value: 1.0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float focusDistance;
    uniform float focusRange;
    uniform float blurStrength;
    uniform vec2 resolution;
    varying vec2 vUv;

    void main() {
      float depth = texture2D(tDepth, vUv).r;
      float blur = smoothstep(focusDistance - focusRange, focusDistance + focusRange, depth);
      blur = abs(blur - 0.5) * 2.0 * blurStrength;

      vec2 texelSize = 1.0 / resolution;
      vec4 color = vec4(0.0);
      float total = 0.0;

      for (float x = -4.0; x <= 4.0; x += 1.0) {
        for (float y = -4.0; y <= 4.0; y += 1.0) {
          vec2 offset = vec2(x, y) * texelSize * blur * 5.0;
          color += texture2D(tDiffuse, vUv + offset);
          total += 1.0;
        }
      }

      gl_FragColor = color / total;
    }
  `
};

type RenderMode = 'blur' | 'fill';
type CameraType = 'perspective' | 'orthographic';

interface DepthWeaverSceneProps {
  image: string;
  depthMap: string;
  depthMultiplier: number;
  cameraDistance: number;
  orthographicZoom: number;
  meshDetail: number;
  blurIntensity: number;
  blurOffset: number;
  viewAngleLimit: number;
  useSensor: boolean;
  backgroundMode: 'blur' | 'solid';
  backgroundColor: string;
  renderMode: RenderMode;
  selectionRange: number;
  cameraType: CameraType;
  onDistanceChange: (distance: number) => void;
  onZoomChange: (zoom: number) => void;
  // PBR Material Props
  metalness?: number;
  roughness?: number;
  emissiveIntensity?: number;
  emissiveColor?: string;
  normalMapScale?: number;
  transparency?: number;
  usePBR?: boolean;
  // Post-processing Props
  bloomEnabled?: boolean;
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  dofEnabled?: boolean;
  dofFocusDistance?: number;
  dofFocusRange?: number;
  dofBlurStrength?: number;
  toneMappingEnabled?: boolean;
  saturation?: number;
  contrast?: number;
  brightness?: number;
}

export interface DepthWeaverSceneHandle {
  handleExport: (format: 'glb') => Promise<void>;
  startRecording: (duration: number) => Promise<void>;
}

const getDepthDataFromImage = (imageUrl: string): Promise<ImageData> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'Anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) {
        return reject(new Error('Failed to get canvas context'));
      }
      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, image.width, image.height));
    };
    image.onerror = (err) => reject(err);
    image.src = imageUrl;
  });
};

// Normal map generator from depth map
const generateNormalMap = (depthData: ImageData, strength: number = 1.0): ImageData => {
  const { width, height, data } = depthData;
  const normalData = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Sample neighboring pixels
      const left = x > 0 ? data[idx - 4] : data[idx];
      const right = x < width - 1 ? data[idx + 4] : data[idx];
      const up = y > 0 ? data[idx - width * 4] : data[idx];
      const down = y < height - 1 ? data[idx + width * 4] : data[idx];

      // Calculate gradients
      const dx = (right - left) * strength / 255.0;
      const dy = (down - up) * strength / 255.0;

      // Calculate normal
      const normal = new THREE.Vector3(-dx, -dy, 1.0).normalize();

      // Convert to RGB
      normalData[idx] = ((normal.x + 1) * 0.5) * 255;
      normalData[idx + 1] = ((normal.y + 1) * 0.5) * 255;
      normalData[idx + 2] = ((normal.z + 1) * 0.5) * 255;
      normalData[idx + 3] = 255;
    }
  }

  return new ImageData(normalData, width, height);
};

const bakingVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const bakingFragmentShader = `
  uniform sampler2D uTexture;
  uniform sampler2D uDepthMap;
  uniform float uBlurIntensity;
  uniform float uBlurOffset;
  uniform vec2 uResolution;
  uniform int uRenderMode;

  varying vec2 vUv;

  float getDepth(vec2 uv) {
    return texture2D(uDepthMap, uv).r;
  }
  
  void main() {
    float pixelSizeX = 1.0 / uResolution.x;
    float pixelSizeY = 1.0 / uResolution.y;

    float depth = getDepth(vUv);
    float depthN = getDepth(vUv + vec2(0.0, pixelSizeY));
    float depthS = getDepth(vUv - vec2(0.0, pixelSizeY));
    float depthE = getDepth(vUv + vec2(pixelSizeX, 0.0));
    float depthW = getDepth(vUv - vec2(pixelSizeX, 0.0));

    float dx = depthE - depthW;
    float dy = depthN - depthS;
    float gradient = smoothstep(0.0, 0.05, sqrt(dx*dx + dy*dy));

    if (gradient > 0.1) {
      if (uRenderMode == 0) { // Blur Mode
        vec4 blurredColor = vec4(0.0);
        float totalWeight = 0.0;
        float blurStrength = gradient * uBlurIntensity;
        float centerDepth = getDepth(vUv);

        for (int x = -4; x <= 4; x++) {
          for (int y = -4; y <= 4; y++) {
            float offsetX = float(x) * pixelSizeX * blurStrength;
            float offsetY = float(y) * pixelSizeY * blurStrength;
            vec2 sampleUV = vUv + vec2(offsetX, offsetY);
            
            float sampleDepth = getDepth(sampleUV);
            float depthDiff = sampleDepth - centerDepth;

            float weight = exp(-(float(x*x + y*y) / (2.0 * 16.0)));

            float depthWeight = 1.0 - (uBlurOffset * sign(depthDiff));
            weight *= clamp(depthWeight, 0.0, 1.0);

            blurredColor += texture2D(uTexture, sampleUV) * weight;
            totalWeight += weight;
          }
        }

        if (totalWeight > 0.0) {
          gl_FragColor = blurredColor / totalWeight;
        } else {
          gl_FragColor = texture2D(uTexture, vUv);
        }
      } else { // Fill Mode
        discard;
      }
    } else {
      gl_FragColor = texture2D(uTexture, vUv);
    }
  }
`;

const liveVertexShader = `
  uniform sampler2D uDepthMap;
  uniform float uDepthMultiplier;
  varying vec2 vUv;
  varying float vDepth;
  
  void main() {
    vUv = uv;
    vec4 depthColor = texture2D(uDepthMap, uv);
    float depth = depthColor.r;
    vDepth = depth;
    float displacement = depth * uDepthMultiplier;
    vec3 newPosition = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const liveFragmentShader = `
  uniform sampler2D uBakedTexture;
  uniform float uEmissiveIntensity;
  uniform vec3 uEmissiveColor;
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vec4 texColor = texture2D(uBakedTexture, vUv);
    vec3 emissive = uEmissiveColor * uEmissiveIntensity * vDepth;
    gl_FragColor = vec4(texColor.rgb + emissive, texColor.a);
  }
`;

export const DepthWeaverScene = forwardRef<DepthWeaverSceneHandle, DepthWeaverSceneProps>(({
  image,
  depthMap,
  depthMultiplier,
  cameraDistance,
  orthographicZoom,
  meshDetail,
  blurIntensity,
  blurOffset,
  viewAngleLimit,
  useSensor,
  backgroundMode,
  backgroundColor,
  renderMode,
  selectionRange,
  cameraType,
  onDistanceChange,
  onZoomChange,
  // PBR defaults
  metalness = 0.0,
  roughness = 0.5,
  emissiveIntensity = 0.0,
  emissiveColor = '#ffffff',
  normalMapScale = 1.0,
  transparency = 0.0,
  usePBR = false,
  // Post-processing defaults
  bloomEnabled = false,
  bloomStrength = 0.5,
  bloomRadius = 0.4,
  bloomThreshold = 0.85,
  dofEnabled = false,
  dofFocusDistance = 0.5,
  dofFocusRange = 0.1,
  dofBlurStrength = 1.0,
  toneMappingEnabled = false,
  saturation = 1.0,
  contrast = 1.0,
  brightness = 1.0,
}, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  const rendererRef = useRef<THREE.WebGLRenderer>();
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera>();
  const meshRef = useRef<THREE.Mesh>();
  
  const colorTextureRef = useRef<THREE.Texture>();
  const depthTextureRef = useRef<THREE.Texture>();
  const normalMapRef = useRef<THREE.Texture>();

  const liveMaterialRef = useRef<THREE.ShaderMaterial>();
  const bakingMaterialRef = useRef<THREE.ShaderMaterial>();
  const bakedTextureRef = useRef<THREE.WebGLRenderTarget>();
  
  // Post-processing refs
  const composerRef = useRef<EffectComposer>();
  const bloomPassRef = useRef<UnrealBloomPass>();
  const colorGradingPassRef = useRef<ShaderPass>();
  const dofPassRef = useRef<ShaderPass>();

  const maxAngleRef = useRef(THREE.MathUtils.degToRad(viewAngleLimit));
  
  const isDraggingRef = useRef(false);
  const previousPointerPosition = useRef({ x: 0, y: 0 });
  
  const initialOrientationRef = useRef<{ beta: number | null, gamma: number | null }>({ beta: null, gamma: null });

  const renderRequestedRef = useRef(false);
  const useSensorRef = useRef(useSensor);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    useSensorRef.current = useSensor;
  }, [useSensor]);

  const requestRenderIfNotRequested = useCallback(() => {
    if (!renderRequestedRef.current) {
      renderRequestedRef.current = true;
      requestAnimationFrame(() => {
        renderRequestedRef.current = false;
        if (composerRef.current) {
          composerRef.current.render();
        }
      });
    }
  }, []);

  const runBakePass = useCallback(() => {
    if (!rendererRef.current || !bakingMaterialRef.current || !bakedTextureRef.current) return;
  
    const bakingScene = new THREE.Scene();
    const bakingMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakingMaterialRef.current);
    bakingScene.add(bakingMesh);
    
    rendererRef.current.setRenderTarget(bakedTextureRef.current);
    rendererRef.current.render(bakingScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    rendererRef.current.setRenderTarget(null);

    bakingMesh.geometry.dispose();
    bakingScene.remove(bakingMesh);

    requestRenderIfNotRequested();
  }, [requestRenderIfNotRequested]);

  useImperativeHandle(ref, () => ({
    async handleExport(format: 'glb') {
      if (!meshRef.current || !rendererRef.current || !sceneRef.current || !cameraRef.current || !bakedTextureRef.current || format !== 'glb') {
        throw new Error('Export is not ready or format is not supported.');
      }
    
      setIsLoading(true);
    
      try {
        const exporter = new GLTFExporter();
        const originalMesh = meshRef.current;
        const renderer = rendererRef.current;
            
        const { width, height } = bakedTextureRef.current;
        const tempRenderTarget = new THREE.WebGLRenderTarget(width, height, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
        });

        const tempBakingMaterial = bakingMaterialRef.current!.clone();
        
        const bakingScene = new THREE.Scene();
        const bakingMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tempBakingMaterial);
        bakingScene.add(bakingMesh);

        const originalClearColor = new THREE.Color();
        renderer.getClearColor(originalClearColor);
        const originalClearAlpha = renderer.getClearAlpha();
        
        renderer.setClearColor('#00ff00');
        renderer.setClearAlpha(1);
        
        renderer.setRenderTarget(tempRenderTarget);
        renderer.clear();
        renderer.render(bakingScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
        renderer.setRenderTarget(null);

        renderer.setClearColor(originalClearColor);
        renderer.setClearAlpha(originalClearAlpha);

        bakingMesh.geometry.dispose();
        bakingScene.remove(bakingMesh);
        tempBakingMaterial.dispose();
    
        const depthData = await getDepthDataFromImage(depthMap);
        const { width: depthWidth, height: depthHeight } = depthData;
        
        const clonedGeometry = originalMesh.geometry.clone();
        const positionAttribute = clonedGeometry.getAttribute('position');
        const uvAttribute = clonedGeometry.getAttribute('uv');
    
        for (let i = 0; i < positionAttribute.count; i++) {
          const u = uvAttribute.getX(i);
          const v = 1 - uvAttribute.getY(i);
          const pixelX = Math.floor(u * (depthWidth - 1));
          const pixelY = Math.floor(v * (depthHeight - 1));
          const pixelIndex = (pixelY * depthWidth + pixelX) * 4;
          const depth = depthData.data[pixelIndex] / 255.0; 
          const displacement = depth * depthMultiplier;
          positionAttribute.setZ(i, originalMesh.geometry.attributes.position.getZ(i) + displacement);
        }
        clonedGeometry.computeVertexNormals();
        
        const buffer = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(tempRenderTarget, 0, 0, width, height, buffer);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Failed to get 2d context from canvas');
        }
        const imageData = new ImageData(new Uint8ClampedArray(buffer.buffer), width, height);
        context.putImageData(imageData, 0, 0);

        const canvasTexture = new THREE.CanvasTexture(canvas);
        canvasTexture.flipY = false;
        canvasTexture.needsUpdate = true;

        tempRenderTarget.dispose();
    
        return new Promise<void>((resolve, reject) => {
          const exportMaterial = new THREE.MeshStandardMaterial({ 
            map: canvasTexture,
            metalness: metalness,
            roughness: roughness,
          });
          const exportMesh = new THREE.Mesh(clonedGeometry, exportMaterial);
          exportMesh.scale.copy(originalMesh.scale);
    
          exporter.parse(
            exportMesh,
            (gltf) => {
              const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `scene-${Date.now()}.glb`;
              a.click();
              URL.revokeObjectURL(url);
              canvasTexture.dispose();
              exportMaterial.dispose();
              clonedGeometry.dispose();
              resolve();
            },
            (error) => {
              console.error('An error happened during parsing', error);
              canvasTexture.dispose();
              exportMaterial.dispose();
              clonedGeometry.dispose();
              reject(new Error('Failed to export GLB.'));
            },
            { binary: true }
          );
        });
      } finally {
        setIsLoading(false);
      }
    },
    async startRecording(duration: number) {
      if (!mountRef.current || !rendererRef.current || !meshRef.current) {
        throw new Error('Recording is not ready.');
      }
      if (isRecordingRef.current) {
        throw new Error('Recording is already in progress.');
      }

      isRecordingRef.current = true;
      const originalRotation = meshRef.current.rotation.clone();

      const animateAndRecord = async () => {
          const TARGET_FPS = 30;
          const totalFrames = duration / 1000 * TARGET_FPS;
          const canvas = rendererRef.current!.domElement;
          const stream = canvas.captureStream(TARGET_FPS);
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
      
          const recordingPromise = new Promise<void>((resolve, reject) => {
              const chunks: Blob[] = [];
              recorder.ondataavailable = (e) => {
                  if (e.data.size > 0) chunks.push(e.data);
              };
              recorder.onstop = () => {
                  const blob = new Blob(chunks, { type: 'video/webm' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `recording-${Date.now()}.webm`;
                  a.click();
                  URL.revokeObjectURL(url);
                  stream.getTracks().forEach(track => track.stop());
                  resolve();
              };
              recorder.onerror = (e) => {
                  console.error('MediaRecorder error:', e);
                  stream.getTracks().forEach(track => track.stop());
                  reject(new Error('MediaRecorder encountered an error.'));
              };
          });

          recorder.start();

          if (meshRef.current) {
            meshRef.current.rotation.set(0, 0, 0);
            requestRenderIfNotRequested();
          }
      
          for (let i = 0; i < totalFrames; i++) {
              if (!meshRef.current) break;

              const linearProgress = i / (totalFrames - 1);
              
              const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
              const easedProgress = easeInOutSine(linearProgress);
              
              const maxAngle = maxAngleRef.current;
              
              const radius = Math.sin(linearProgress * Math.PI) * maxAngle;
              const angle = easedProgress * Math.PI * 4;

              meshRef.current.rotation.y = Math.sin(angle) * radius;
              meshRef.current.rotation.x = Math.cos(angle) * radius;
              
              if (composerRef.current) {
                composerRef.current.render();
              }
              await new Promise(resolve => setTimeout(resolve, 33));
          }
      
          if (recorder.state === "recording") {
              recorder.stop();
          }
      
          return recordingPromise;
      };

      try {
        await animateAndRecord();
      } catch (error) {
        console.error("Recording failed:", error);
        throw error;
      } finally {
        if (meshRef.current) {
          meshRef.current.rotation.copy(originalRotation);
          requestRenderIfNotRequested();
        }
        isRecordingRef.current = false;
      }
    },
  }));

  useEffect(() => {
    maxAngleRef.current = THREE.MathUtils.degToRad(viewAngleLimit);
  }, [viewAngleLimit]);

  // Update post-processing uniforms
  useEffect(() => {
    if (bloomPassRef.current) {
      bloomPassRef.current.strength = bloomStrength;
      bloomPassRef.current.radius = bloomRadius;
      bloomPassRef.current.threshold = bloomThreshold;
    }
    if (colorGradingPassRef.current) {
      colorGradingPassRef.current.uniforms.saturation.value = saturation;
      colorGradingPassRef.current.uniforms.contrast.value = contrast;
      colorGradingPassRef.current.uniforms.brightness.value = brightness;
      colorGradingPassRef.current.uniforms.toneMapping.value = toneMappingEnabled ? 1 : 0;
    }
    if (dofPassRef.current) {
      dofPassRef.current.uniforms.focusDistance.value = dofFocusDistance;
      dofPassRef.current.uniforms.focusRange.value = dofFocusRange;
      dofPassRef.current.uniforms.blurStrength.value = dofBlurStrength;
    }
    requestRenderIfNotRequested();
  }, [
    bloomStrength, bloomRadius, bloomThreshold,
    saturation, contrast, brightness, toneMappingEnabled,
    dofFocusDistance, dofFocusRange, dofBlurStrength,
    requestRenderIfNotRequested
  ]);

  useEffect(() => {
    if (liveMaterialRef.current) {
        liveMaterialRef.current.uniforms.uDepthMultiplier.value = depthMultiplier;
        liveMaterialRef.current.uniforms.uEmissiveIntensity.value = emissiveIntensity;
        liveMaterialRef.current.uniforms.uEmissiveColor.value = new THREE.Color(emissiveColor);
    }
    if (cameraRef.current) {
        if (cameraRef.current.type === 'PerspectiveCamera') {
            (cameraRef.current as THREE.PerspectiveCamera).position.z = cameraDistance;
        } else {
            (cameraRef.current as THREE.OrthographicCamera).zoom = orthographicZoom;
        }
        cameraRef.current.updateProjectionMatrix();
    }
    if (sceneRef.current && rendererRef.current) {
      sceneRef.current.background = backgroundMode === 'solid' ? new THREE.Color(backgroundColor) : null;
      rendererRef.current.setClearAlpha(backgroundMode === 'blur' ? 0 : 1);
    }
    
    // Update PBR material if using PBR
    if (meshRef.current && usePBR) {
      const material = meshRef.current.material as THREE.MeshStandardMaterial;
      if (material) {
        material.metalness = metalness;
        material.roughness = roughness;
        material.emissive = new THREE.Color(emissiveColor);
        material.emissiveIntensity = emissiveIntensity;
        material.transparent = transparency > 0;
        material.opacity = 1 - transparency;
        if (normalMapRef.current) {
          material.normalMap = normalMapRef.current;
          material.normalScale = new THREE.Vector2(normalMapScale, normalMapScale);
        }
      }
    }
    
    requestRenderIfNotRequested();
  }, [
    depthMultiplier, cameraDistance, orthographicZoom, backgroundMode, backgroundColor,
    metalness, roughness, emissiveIntensity, emissiveColor, normalMapScale, transparency, usePBR,
    requestRenderIfNotRequested
  ]);

  useEffect(() => {
    if (meshRef.current) {
      const geo = meshRef.current.geometry as THREE.PlaneGeometry;
      if (geo.parameters && geo.parameters.widthSegments !== meshDetail) {
        meshRef.current.geometry.dispose();
        meshRef.current.geometry = new THREE.PlaneGeometry(2, 2, meshDetail, meshDetail);
        requestRenderIfNotRequested();
      }
    }
  }, [meshDetail, requestRenderIfNotRequested]);
  
  useEffect(() => {
    if (bakingMaterialRef.current) {
      bakingMaterialRef.current.uniforms.uBlurIntensity.value = blurIntensity;
      bakingMaterialRef.current.uniforms.uBlurOffset.value = blurOffset;
      bakingMaterialRef.current.uniforms.uRenderMode.value = renderMode === 'fill' ? 1 : 0;
      runBakePass();
    }
  }, [blurIntensity, blurOffset, renderMode, runBakePass]);

  useEffect(() => {
    if (!cameraRef.current || cameraRef.current.type.toLowerCase().startsWith(cameraType)) return;

    const currentMount = mountRef.current;
    if (!currentMount) return;

    const aspect = currentMount.clientWidth / currentMount.clientHeight;
    let newCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;

    if (cameraType === 'perspective') {
      newCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
      newCamera.position.z = cameraDistance;
    } else {
      const frustumSize = 2;
      newCamera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 100);
      newCamera.zoom = orthographicZoom;
      newCamera.position.z = 6;
    }
    newCamera.updateProjectionMatrix();
    cameraRef.current = newCamera;
    
    // Update composer camera
    if (composerRef.current) {
      composerRef.current.dispose();
      
      const renderScene = new RenderPass(sceneRef.current!, newCamera);
      
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight),
        bloomStrength,
        bloomRadius,
        bloomThreshold
      );
      bloomPassRef.current = bloomPass;

      const colorGradingPass = new ShaderPass(colorGradingShader);
      colorGradingPass.uniforms.saturation.value = saturation;
      colorGradingPass.uniforms.contrast.value = contrast;
      colorGradingPass.uniforms.brightness.value = brightness;
      colorGradingPass.uniforms.toneMapping.value = toneMappingEnabled ? 1 : 0;
      colorGradingPassRef.current = colorGradingPass;

      const dofPass = new ShaderPass(depthOfFieldShader);
      dofPass.uniforms.tDepth.value = depthTextureRef.current;
      dofPass.uniforms.focusDistance.value = dofFocusDistance;
      dofPass.uniforms.focusRange.value = dofFocusRange;
      dofPass.uniforms.blurStrength.value = dofBlurStrength;
      dofPass.uniforms.resolution.value = new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight);
      dofPassRef.current = dofPass;

      const composer = new EffectComposer(rendererRef.current!);
      composer.addPass(renderScene);
      if (bloomEnabled) composer.addPass(bloomPass);
      if (dofEnabled) composer.addPass(dofPass);
      composer.addPass(colorGradingPass);
      composerRef.current = composer;
    }
    
    requestRenderIfNotRequested();
  }, [cameraType, cameraDistance, orthographicZoom, bloomEnabled, bloomStrength, bloomRadius, bloomThreshold, dofEnabled, dofFocusDistance, dofFocusRange, dofBlurStrength, toneMappingEnabled, saturation, contrast, brightness, requestRenderIfNotRequested]);


  const onPointerMove = useCallback((event: PointerEvent) => {
      if (!isDraggingRef.current || useSensorRef.current) return;
      const deltaX = event.clientX - previousPointerPosition.current.x;
      const deltaY = event.clientY - previousPointerPosition.current.y;

      const maxAngle = maxAngleRef.current;
      if (meshRef.current) {
        meshRef.current.rotation.y = THREE.MathUtils.clamp(meshRef.current.rotation.y + deltaX * 0.005, -maxAngle, maxAngle);
        meshRef.current.rotation.x = THREE.MathUtils.clamp(meshRef.current.rotation.x + deltaY * 0.005, -maxAngle, maxAngle);
      }

      previousPointerPosition.current.x = event.clientX;
      previousPointerPosition.current.y = event.clientY;
      requestRenderIfNotRequested();
  }, [requestRenderIfNotRequested]);

  const onPointerUp = useCallback(() => {
      isDraggingRef.current = false;
      if (mountRef.current) mountRef.current.style.cursor = 'grab';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);
  
  const onPointerDown = useCallback((event: PointerEvent) => {
      if(useSensorRef.current || isRecordingRef.current) return;
      event.preventDefault();
      isDraggingRef.current = true;
      previousPointerPosition.current.x = event.clientX;
      previousPointerPosition.current.y = event.clientY;
      if (mountRef.current) mountRef.current.style.cursor = 'grabbing';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
  }, [onPointerMove, onPointerUp]);

  const handleDeviceOrientation = useCallback((event: DeviceOrientationEvent) => {
      if (!meshRef.current || !event.beta || !event.gamma || !useSensorRef.current || isRecordingRef.current) return;
  
      if (initialOrientationRef.current.beta === null || initialOrientationRef.current.gamma === null) {
        initialOrientationRef.current = { beta: event.beta, gamma: event.gamma };
      }
      
      const initialBeta = initialOrientationRef.current.beta ?? 0;
      const initialGamma = initialOrientationRef.current.gamma ?? 0;
      const beta = event.beta - initialBeta;
      const gamma = event.gamma - initialGamma;

      const maxAngle = maxAngleRef.current;
      const smoothingFactor = 0.1;

      const targetRotationX = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(beta * -0.5), -maxAngle, maxAngle);
      const targetRotationY = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(gamma * -0.5), -maxAngle, maxAngle);
      
      meshRef.current.rotation.x += (targetRotationX - meshRef.current.rotation.x) * smoothingFactor;
      meshRef.current.rotation.y += (targetRotationY - meshRef.current.rotation.y) * smoothingFactor;
      
      requestRenderIfNotRequested();
  }, [requestRenderIfNotRequested]);

  const onWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (!cameraRef.current || isRecordingRef.current) return;

    const zoomSpeed = 0.002;
    const delta = event.deltaY * zoomSpeed;

    if (cameraRef.current.type === 'PerspectiveCamera') {
        const cam = cameraRef.current as THREE.PerspectiveCamera;
        const newDistance = THREE.MathUtils.clamp(cam.position.z + delta, 0.5, 5);
        onDistanceChange(newDistance);
    } else {
        const cam = cameraRef.current as THREE.OrthographicCamera;
        const newZoom = THREE.MathUtils.clamp(cam.zoom - delta * cam.zoom, 0.1, 5);
        onZoomChange(newZoom);
    }
  }, [onDistanceChange, onZoomChange]);


  useEffect(() => {
    const currentMount = mountRef.current;
    if (useSensor) {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') {
              window.addEventListener('deviceorientation', handleDeviceOrientation);
            }
          });
      } else {
        window.addEventListener('deviceorientation', handleDeviceOrientation);
      }
    }
    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, [useSensor, handleDeviceOrientation]);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    setIsLoading(true);

    const width = currentMount.clientWidth;
    const height = currentMount.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const aspect = width / height;
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (cameraType === 'perspective') {
      camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
      camera.position.z = cameraDistance;
    } else {
      const frustumSize = 2;
      camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 100);
      camera.zoom = orthographicZoom;
      camera.position.z = 6;
    }
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    Promise.all([
      new Promise<THREE.Texture>((resolve, reject) => {
        textureLoader.load(image, (tex) => resolve(tex), undefined, reject);
      }),
      new Promise<THREE.Texture>((resolve, reject) => {
        textureLoader.load(depthMap, (tex) => resolve(tex), undefined, reject);
      })
    ]).then(([colorTex, depthTex]) => {
      colorTextureRef.current = colorTex;
      depthTextureRef.current = depthTex;

      const img = colorTex.image as HTMLImageElement;
      const bakedTarget = new THREE.WebGLRenderTarget(img.width, img.height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
      bakedTextureRef.current = bakedTarget;

      const bakingMat = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: colorTex },
          uDepthMap: { value: depthTex },
          uBlurIntensity: { value: blurIntensity },
          uBlurOffset: { value: blurOffset },
          uResolution: { value: new THREE.Vector2((colorTex.image as HTMLImageElement).width, (colorTex.image as HTMLImageElement).height) },
          uRenderMode: { value: renderMode === 'fill' ? 1 : 0 },
        },
        vertexShader: bakingVertexShader,
        fragmentShader: bakingFragmentShader,
      });
      bakingMaterialRef.current = bakingMat;

      // Generate normal map from depth
      getDepthDataFromImage(depthMap).then((depthData) => {
        const normalImageData = generateNormalMap(depthData, normalMapScale);
        const normalCanvas = document.createElement('canvas');
        normalCanvas.width = normalImageData.width;
        normalCanvas.height = normalImageData.height;
        const normalCtx = normalCanvas.getContext('2d');
        if (normalCtx) {
          normalCtx.putImageData(normalImageData, 0, 0);
          const normalTexture = new THREE.CanvasTexture(normalCanvas);
          normalTexture.wrapS = THREE.RepeatWrapping;
          normalTexture.wrapT = THREE.RepeatWrapping;
          normalMapRef.current = normalTexture;
        }
      });

      const liveMat = new THREE.ShaderMaterial({
        uniforms: {
          uBakedTexture: { value: bakedTarget.texture },
          uDepthMap: { value: depthTex },
          uDepthMultiplier: { value: depthMultiplier },
          uEmissiveIntensity: { value: emissiveIntensity },
          uEmissiveColor: { value: new THREE.Color(emissiveColor) },
        },
        vertexShader: liveVertexShader,
        fragmentShader: liveFragmentShader,
      });
      liveMaterialRef.current = liveMat;

      // Use PBR material if enabled
      let meshMaterial: THREE.Material = liveMat;
      if (usePBR) {
        meshMaterial = new THREE.MeshPhysicalMaterial({
          map: bakedTarget.texture,
          metalness: metalness,
          roughness: roughness,
          emissive: new THREE.Color(emissiveColor),
          emissiveIntensity: emissiveIntensity,
          transparent: transparency > 0,
          opacity: 1 - transparency,
          transmission: transparency,
          thickness: 1.0,
          envMapIntensity: 1.0,
          clearcoat: 0.5,
          clearcoatRoughness: 0.1,
        });
      }

      const geometry = new THREE.PlaneGeometry(2, 2, meshDetail, meshDetail);
      const mesh = new THREE.Mesh(geometry, meshMaterial);
      meshRef.current = mesh;
      scene.add(mesh);

      // Add lights for PBR
      if (usePBR) {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0xffffff, 0.5);
        pointLight.position.set(-5, 3, 5);
        scene.add(pointLight);
      }

      // Setup post-processing
      const renderScene = new RenderPass(scene, camera);
      
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        bloomStrength,
        bloomRadius,
        bloomThreshold
      );
      bloomPassRef.current = bloomPass;

      const colorGradingPass = new ShaderPass(colorGradingShader);
      colorGradingPass.uniforms.saturation.value = saturation;
      colorGradingPass.uniforms.contrast.value = contrast;
      colorGradingPass.uniforms.brightness.value = brightness;
      colorGradingPass.uniforms.toneMapping.value = toneMappingEnabled ? 1 : 0;
      colorGradingPassRef.current = colorGradingPass;

      const dofPass = new ShaderPass(depthOfFieldShader);
      dofPass.uniforms.tDepth.value = depthTex;
      dofPass.uniforms.focusDistance.value = dofFocusDistance;
      dofPass.uniforms.focusRange.value = dofFocusRange;
      dofPass.uniforms.blurStrength.value = dofBlurStrength;
      dofPass.uniforms.resolution.value = new THREE.Vector2(width, height);
      dofPassRef.current = dofPass;

      const composer = new EffectComposer(renderer);
      composer.addPass(renderScene);
      if (bloomEnabled) composer.addPass(bloomPass);
      if (dofEnabled) composer.addPass(dofPass);
      composer.addPass(colorGradingPass);
      composerRef.current = composer;

      runBakePass();
      setIsLoading(false);
    }).catch((err) => {
      console.error("Failed to load textures:", err);
      setIsLoading(false);
    });

    currentMount.addEventListener('pointerdown', onPointerDown);
    currentMount.addEventListener('wheel', onWheel, { passive: false });
    currentMount.style.cursor = 'grab';

    const handleResize = () => {
      if (!currentMount || !rendererRef.current || !cameraRef.current) return;
      const newWidth = currentMount.clientWidth;
      const newHeight = currentMount.clientHeight;
      rendererRef.current.setSize(newWidth, newHeight);
      
      if (composerRef.current) {
        composerRef.current.setSize(newWidth, newHeight);
      }
      
      if (dofPassRef.current) {
        dofPassRef.current.uniforms.resolution.value = new THREE.Vector2(newWidth, newHeight);
      }

      const newAspect = newWidth / newHeight;
      if (cameraRef.current.type === 'PerspectiveCamera') {
        (cameraRef.current as THREE.PerspectiveCamera).aspect = newAspect;
      } else {
        const frustumSize = 2;
        (cameraRef.current as THREE.OrthographicCamera).left = frustumSize * newAspect / -2;
        (cameraRef.current as THREE.OrthographicCamera).right = frustumSize * newAspect / 2;
      }
      cameraRef.current.updateProjectionMatrix();
      requestRenderIfNotRequested();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      currentMount.removeEventListener('pointerdown', onPointerDown);
      currentMount.removeEventListener('wheel', onWheel);
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (currentMount.contains(rendererRef.current.domElement)) {
          currentMount.removeChild(rendererRef.current.domElement);
        }
      }
      
      if (composerRef.current) {
        composerRef.current.dispose();
      }
      
      colorTextureRef.current?.dispose();
      depthTextureRef.current?.dispose();
      normalMapRef.current?.dispose();
      bakedTextureRef.current?.dispose();
      liveMaterialRef.current?.dispose();
      bakingMaterialRef.current?.dispose();
      meshRef.current?.geometry.dispose();
      if (meshRef.current?.material) {
        if (Array.isArray(meshRef.current.material)) {
          meshRef.current.material.forEach(m => m.dispose());
        } else {
          meshRef.current.material.dispose();
        }
      }
    };
  }, [image, depthMap, cameraType, cameraDistance, orthographicZoom, meshDetail, blurIntensity, blurOffset, renderMode, depthMultiplier, emissiveIntensity, emissiveColor, metalness, roughness, normalMapScale, transparency, usePBR, bloomEnabled, bloomStrength, bloomRadius, bloomThreshold, dofEnabled, dofFocusDistance, dofFocusRange, dofBlurStrength, toneMappingEnabled, saturation, contrast, brightness, runBakePass, onPointerDown, onWheel, requestRenderIfNotRequested]);

  return (
    <div 
      ref={mountRef} 
      className="w-full h-full relative"
      style={{ touchAction: 'none' }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="text-sm text-muted-foreground">加载中...</span>
          </div>
        </div>
      )}
    </div>
  );
});

DepthWeaverScene.displayName = 'DepthWeaverScene';
