"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

type RenderMode = 'blur' | 'fill';
type CameraType = 'perspective' | 'orthographic';

interface PBRSettings {
  metalness: number;
  roughness: number;
  normalIntensity: number;
  emissiveIntensity: number;
  emissiveColor: string;
  opacity: number;
  transmission: number;
  ior: number;
  thickness: number;
}

interface PostProcessingSettings {
  bloomEnabled: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  dofEnabled: boolean;
  dofFocusDistance: number;
  dofFocalLength: number;
  dofBokehScale: number;
  toneMapping: 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces';
  saturation: number;
  contrast: number;
  brightness: number;
}

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
  pbrSettings: PBRSettings;
  postProcessingSettings: PostProcessingSettings;
  onDistanceChange: (distance: number) => void;
  onZoomChange: (zoom: number) => void;
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
      if (uRenderMode == 0) {
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
      } else {
        discard;
      }
    } else {
      gl_FragColor = texture2D(uTexture, vUv);
    }
  }
`;

const pbrVertexShader = `
  uniform sampler2D uDepthMap;
  uniform float uDepthMultiplier;
  uniform float uNormalIntensity;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    
    float pixelSize = 1.0 / 512.0;
    float depthL = texture2D(uDepthMap, uv - vec2(pixelSize, 0.0)).r;
    float depthR = texture2D(uDepthMap, uv + vec2(pixelSize, 0.0)).r;
    float depthT = texture2D(uDepthMap, uv + vec2(0.0, pixelSize)).r;
    float depthB = texture2D(uDepthMap, uv - vec2(0.0, pixelSize)).r;
    
    vec3 dx = vec3(pixelSize * 2.0, 0.0, (depthR - depthL) * uNormalIntensity);
    vec3 dy = vec3(0.0, pixelSize * 2.0, (depthT - depthB) * uNormalIntensity);
    vNormal = normalize(cross(dy, dx));
    
    vec4 depthColor = texture2D(uDepthMap, uv);
    float depth = depthColor.r;
    float displacement = depth * uDepthMultiplier;
    vec3 newPosition = position + normal * displacement;
    vPosition = newPosition;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const pbrFragmentShader = `
  uniform sampler2D uBakedTexture;
  uniform sampler2D uDepthMap;
  uniform float uMetalness;
  uniform float uRoughness;
  uniform float uEmissiveIntensity;
  uniform vec3 uEmissiveColor;
  uniform float uOpacity;
  uniform float uTransmission;
  uniform float uIor;
  uniform float uThickness;
  uniform vec3 uLightPosition;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  const float PI = 3.14159265359;

  vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  }

  float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;

    float num = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return num / denom;
  }

  float geometrySchlickGGX(float NdotV, float roughness) {
    float r = (roughness + 1.0);
    float k = (r * r) / 8.0;

    float num = NdotV;
    float denom = NdotV * (1.0 - k) + k;

    return num / denom;
  }

  float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2 = geometrySchlickGGX(NdotV, roughness);
    float ggx1 = geometrySchlickGGX(NdotL, roughness);

    return ggx1 * ggx2;
  }

  void main() {
    vec4 baseColor = texture2D(uBakedTexture, vUv);
    vec3 albedo = baseColor.rgb;
    
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vPosition);
    vec3 L = normalize(uLightPosition - vPosition);
    vec3 H = normalize(V + L);
    
    vec3 F0 = vec3(0.04);
    F0 = mix(F0, albedo, uMetalness);

    float NDF = distributionGGX(N, H, uRoughness);
    float G = geometrySmith(N, V, L, uRoughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    kD *= 1.0 - uMetalness;

    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;

    float NdotL = max(dot(N, L), 0.0);
    vec3 lightColor = vec3(1.0, 0.98, 0.95) * 3.0;
    vec3 Lo = (kD * albedo / PI + specular) * lightColor * NdotL;

    vec3 ambient = vec3(0.03) * albedo;
    vec3 color = ambient + Lo;

    vec3 emissive = uEmissiveColor * uEmissiveIntensity * albedo;
    color += emissive;

    float depth = texture2D(uDepthMap, vUv).r;
    float transmissionFactor = uTransmission * (1.0 - depth);
    
    if (transmissionFactor > 0.0) {
      float eta = 1.0 / uIor;
      vec3 refractDir = refract(-V, N, eta);
      vec3 refractColor = texture2D(uBakedTexture, vUv + refractDir.xy * uThickness * 0.1).rgb;
      color = mix(color, refractColor, transmissionFactor);
    }

    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    float finalOpacity = mix(uOpacity, 1.0, transmissionFactor);
    
    gl_FragColor = vec4(color, finalOpacity);
  }
`;

const ColorCorrectionShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.0 },
    contrast: { value: 1.0 },
    brightness: { value: 0.0 },
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
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      
      vec3 finalColor = color.rgb + brightness;
      
      float gray = dot(finalColor, vec3(0.299, 0.587, 0.114));
      finalColor = mix(vec3(gray), finalColor, saturation);
      
      finalColor = (finalColor - 0.5) * contrast + 0.5;
      
      gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), color.a);
    }
  `,
};

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
  pbrSettings,
  postProcessingSettings,
  onDistanceChange,
  onZoomChange
}, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  const rendererRef = useRef<THREE.WebGLRenderer>();
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera>();
  const meshRef = useRef<THREE.Mesh>();
  
  const colorTextureRef = useRef<THREE.Texture>();
  const depthTextureRef = useRef<THREE.Texture>();

  const liveMaterialRef = useRef<THREE.ShaderMaterial>();
  const bakingMaterialRef = useRef<THREE.ShaderMaterial>();
  const bakedTextureRef = useRef<THREE.WebGLRenderTarget>();

  const composerRef = useRef<EffectComposer>();
  const bloomPassRef = useRef<UnrealBloomPass>();
  const bokehPassRef = useRef<BokehPass>();
  const colorCorrectionPassRef = useRef<ShaderPass>();

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
        if (composerRef.current && sceneRef.current && cameraRef.current) {
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
          const exportMaterial = new THREE.MeshBasicMaterial({ map: canvasTexture });
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
              
              if (composerRef.current && sceneRef.current && cameraRef.current) {
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

  useEffect(() => {
    if (liveMaterialRef.current) {
      liveMaterialRef.current.uniforms.uDepthMultiplier.value = depthMultiplier;
      liveMaterialRef.current.uniforms.uMetalness.value = pbrSettings.metalness;
      liveMaterialRef.current.uniforms.uRoughness.value = pbrSettings.roughness;
      liveMaterialRef.current.uniforms.uNormalIntensity.value = pbrSettings.normalIntensity;
      liveMaterialRef.current.uniforms.uEmissiveIntensity.value = pbrSettings.emissiveIntensity;
      liveMaterialRef.current.uniforms.uEmissiveColor.value = new THREE.Color(pbrSettings.emissiveColor);
      liveMaterialRef.current.uniforms.uOpacity.value = pbrSettings.opacity;
      liveMaterialRef.current.uniforms.uTransmission.value = pbrSettings.transmission;
      liveMaterialRef.current.uniforms.uIor.value = pbrSettings.ior;
      liveMaterialRef.current.uniforms.uThickness.value = pbrSettings.thickness;
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
    requestRenderIfNotRequested();
  }, [depthMultiplier, cameraDistance, orthographicZoom, backgroundMode, backgroundColor, pbrSettings, requestRenderIfNotRequested]);

  useEffect(() => {
    if (meshRef.current && meshRef.current.geometry.parameters.widthSegments !== meshDetail) {
      meshRef.current.geometry.dispose();
      meshRef.current.geometry = new THREE.PlaneGeometry(2, 2, meshDetail, meshDetail);
      requestRenderIfNotRequested();
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
    
    if (composerRef.current && sceneRef.current) {
      composerRef.current.passes.forEach(pass => {
        if (pass instanceof RenderPass) {
          pass.camera = newCamera;
        }
        if (pass instanceof BokehPass) {
          pass.camera = newCamera;
        }
      });
    }
    
    requestRenderIfNotRequested();
  }, [cameraType, cameraDistance, orthographicZoom, requestRenderIfNotRequested]);

  useEffect(() => {
    if (!composerRef.current) return;

    if (bloomPassRef.current) {
      bloomPassRef.current.enabled = postProcessingSettings.bloomEnabled;
      bloomPassRef.current.strength = postProcessingSettings.bloomStrength;
      bloomPassRef.current.radius = postProcessingSettings.bloomRadius;
      bloomPassRef.current.threshold = postProcessingSettings.bloomThreshold;
    }

    if (bokehPassRef.current) {
      bokehPassRef.current.enabled = postProcessingSettings.dofEnabled;
    }
    
    if (colorCorrectionPassRef.current) {
      colorCorrectionPassRef.current.uniforms.saturation.value = postProcessingSettings.saturation;
      colorCorrectionPassRef.current.uniforms.contrast.value = postProcessingSettings.contrast;
      colorCorrectionPassRef.current.uniforms.brightness.value = postProcessingSettings.brightness;
    }

    if (rendererRef.current) {
      switch (postProcessingSettings.toneMapping) {
        case 'none':
          rendererRef.current.toneMapping = THREE.NoToneMapping;
          break;
        case 'linear':
          rendererRef.current.toneMapping = THREE.LinearToneMapping;
          break;
        case 'reinhard':
          rendererRef.current.toneMapping = THREE.ReinhardToneMapping;
          break;
        case 'cineon':
          rendererRef.current.toneMapping = THREE.CineonToneMapping;
          break;
        case 'aces':
          rendererRef.current.toneMapping = THREE.ACESFilmicToneMapping;
          break;
      }
      rendererRef.current.toneMappingExposure = 1.0;
    }

    requestRenderIfNotRequested();
  }, [postProcessingSettings, requestRenderIfNotRequested]);

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
      
      const beta = event.beta - initialOrientationRef.current.beta;
      const gamma = event.gamma - initialOrientationRef.current.gamma;

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
      if(currentMount) currentMount.style.cursor = 'default';
    } else {
      initialOrientationRef.current = { beta: null, gamma: null };
      if (meshRef.current && !isRecordingRef.current) {
        meshRef.current.rotation.x = 0;
        meshRef.current.rotation.y = 0;
        requestRenderIfNotRequested();
      }
       if(currentMount) currentMount.style.cursor = 'grab';
    }

    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    }
  }, [useSensor, handleDeviceOrientation, requestRenderIfNotRequested]);

  useEffect(() => {
    if (!mountRef.current || !image || !depthMap) return;
    let isCancelled = false;
    setIsLoading(true);

    const currentMount = mountRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const aspect = currentMount.clientWidth / currentMount.clientHeight;
    if (cameraType === 'perspective') {
        camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
        camera.position.z = cameraDistance;
    } else {
        const frustumSize = 2;
        camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 100);
        camera.zoom = orthographicZoom;
        camera.position.z = 6;
        camera.updateProjectionMatrix();
    }
    cameraRef.current = camera;
    
    scene.background = backgroundMode === 'solid' ? new THREE.Color(backgroundColor) : null;
    renderer.setClearAlpha(backgroundMode === 'blur' ? 0 : 1);
    
    const loadingManager = new THREE.LoadingManager();
    const textureLoader = new THREE.TextureLoader(loadingManager);

    const applyTextureSettings = (texture: THREE.Texture) => {
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
    };
    
    Promise.all([
      new Promise<THREE.Texture>(resolve => textureLoader.load(image, (tex) => {
        applyTextureSettings(tex);
        resolve(tex);
      })),
      new Promise<THREE.Texture>(resolve => textureLoader.load(depthMap, (tex) => {
        applyTextureSettings(tex);
        resolve(tex);
      }))
    ]).then(([colorTex, depthTex]) => {
      if (isCancelled) return;
      
      colorTextureRef.current = colorTex;
      depthTextureRef.current = depthTex;

      const resolution = new THREE.Vector2(colorTex.image.width, colorTex.image.height);
      const bakedRT = new THREE.WebGLRenderTarget(resolution.x, resolution.y, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
      bakedTextureRef.current = bakedRT;

      const bakingMat = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: colorTex },
          uDepthMap: { value: depthTex },
          uBlurIntensity: { value: blurIntensity },
          uBlurOffset: { value: blurOffset },
          uResolution: { value: resolution },
          uRenderMode: { value: renderMode === 'fill' ? 1 : 0 },
        },
        vertexShader: bakingVertexShader,
        fragmentShader: bakingFragmentShader,
      });
      bakingMaterialRef.current = bakingMat;

      runBakePass();

      const geometry = new THREE.PlaneGeometry(2, 2, meshDetail, meshDetail);
      const liveMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uBakedTexture: { value: bakedRT.texture },
          uDepthMap: { value: depthTex },
          uDepthMultiplier: { value: depthMultiplier },
          uMetalness: { value: pbrSettings.metalness },
          uRoughness: { value: pbrSettings.roughness },
          uNormalIntensity: { value: pbrSettings.normalIntensity },
          uEmissiveIntensity: { value: pbrSettings.emissiveIntensity },
          uEmissiveColor: { value: new THREE.Color(pbrSettings.emissiveColor) },
          uOpacity: { value: pbrSettings.opacity },
          uTransmission: { value: pbrSettings.transmission },
          uIor: { value: pbrSettings.ior },
          uThickness: { value: pbrSettings.thickness },
          uLightPosition: { value: new THREE.Vector3(2, 2, 3) },
        },
        vertexShader: pbrVertexShader,
        fragmentShader: pbrFragmentShader,
        transparent: true,
      });
      liveMaterialRef.current = liveMaterial;

      const plane = new THREE.Mesh(geometry, liveMaterial);
      const imageAspect = colorTex.image.width / colorTex.image.height;
      plane.scale.set(imageAspect, 1, 1);
      scene.add(plane);
      meshRef.current = plane;

      const composer = new EffectComposer(renderer);
      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight),
        postProcessingSettings.bloomStrength,
        postProcessingSettings.bloomRadius,
        postProcessingSettings.bloomThreshold
      );
      bloomPass.enabled = postProcessingSettings.bloomEnabled;
      composer.addPass(bloomPass);
      bloomPassRef.current = bloomPass;

      const bokehPass = new BokehPass(scene, camera, {
        focus: postProcessingSettings.dofFocusDistance,
        aperture: 0.00001 * postProcessingSettings.dofBokehScale,
        maxblur: 0.01,
      });
      bokehPass.enabled = postProcessingSettings.dofEnabled;
      composer.addPass(bokehPass);
      bokehPassRef.current = bokehPass;

      const colorCorrectionPass = new ShaderPass(ColorCorrectionShader);
      colorCorrectionPass.uniforms.saturation.value = postProcessingSettings.saturation;
      colorCorrectionPass.uniforms.contrast.value = postProcessingSettings.contrast;
      colorCorrectionPass.uniforms.brightness.value = postProcessingSettings.brightness;
      composer.addPass(colorCorrectionPass);
      colorCorrectionPassRef.current = colorCorrectionPass;

      const outputPass = new OutputPass();
      composer.addPass(outputPass);

      composerRef.current = composer;

      setIsLoading(false);
      requestRenderIfNotRequested();
    });

    currentMount.addEventListener('pointerdown', onPointerDown);
    currentMount.addEventListener('wheel', onWheel, { passive: false });
    currentMount.style.cursor = useSensor ? 'default' : 'grab';

    const handleResize = () => {
      if (!mountRef.current) return;
      const width = currentMount.clientWidth;
      const height = currentMount.clientHeight;
      renderer.setSize(width, height);
      
      if (composerRef.current) {
        composerRef.current.setSize(width, height);
      }
      
      const cam = cameraRef.current;
      if (cam) {
        const newAspect = width / height;
        if (cam.type === 'PerspectiveCamera') {
          (cam as THREE.PerspectiveCamera).aspect = newAspect;
        } else if (cam.type === 'OrthographicCamera') {
          const orthoCam = cam as THREE.OrthographicCamera;
          const frustumSize = 2;
          orthoCam.left = frustumSize * newAspect / -2;
          orthoCam.right = frustumSize * newAspect / 2;
          orthoCam.top = frustumSize / 2;
          orthoCam.bottom = frustumSize / -2;
        }
        cam.updateProjectionMatrix();
      }
      requestRenderIfNotRequested();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isCancelled = true;
      isRecordingRef.current = false;
      window.removeEventListener('resize', handleResize);
      currentMount.removeEventListener('pointerdown', onPointerDown);
      currentMount.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      
      colorTextureRef.current?.dispose();
      depthTextureRef.current?.dispose();
      bakedTextureRef.current?.dispose();
      bakingMaterialRef.current?.dispose();

      if (meshRef.current) {
        meshRef.current.geometry?.dispose();
        liveMaterialRef.current?.dispose();
        scene.remove(meshRef.current);
      }
      meshRef.current = undefined;
      liveMaterialRef.current = undefined;

      if (composerRef.current) {
        composerRef.current.dispose();
        composerRef.current = undefined;
      }
      bloomPassRef.current = undefined;
      bokehPassRef.current = undefined;
      colorCorrectionPassRef.current = undefined;

      if (renderer.domElement && currentMount.contains(renderer.domElement)) {
         currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      rendererRef.current = undefined;
    };
  }, [image, depthMap, onWheel, onPointerDown]);

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-primary mx-auto"></div>
            <p className="mt-4 text-lg font-semibold">正在构建3D场景...</p>
          </div>
        </div>
      )}
      <div 
        ref={mountRef} 
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />
    </>
  );
});

DepthWeaverScene.displayName = 'DepthWeaverScene';
