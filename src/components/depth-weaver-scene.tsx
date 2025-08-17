
"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

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
}

export interface DepthWeaverSceneHandle {
  handleExport: (format: 'glb') => Promise<void>;
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
  
  void main() {
    vUv = uv;
    vec4 depthColor = texture2D(uDepthMap, uv);
    float depth = depthColor.r;
    float displacement = depth * uDepthMultiplier;
    vec3 newPosition = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const liveFragmentShader = `
  uniform sampler2D uBakedTexture;
  varying vec2 vUv;

  void main() {
    gl_FragColor = texture2D(uBakedTexture, vUv);
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
}, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  const rendererRef = useRef<THREE.WebGLRenderer>();
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera>();
  const meshRef = useRef<THREE.Mesh>();
  const liveMaterialRef = useRef<THREE.ShaderMaterial>();
  const bakedTextureRef = useRef<THREE.WebGLRenderTarget>();

  const maxAngleRef = useRef(THREE.MathUtils.degToRad(viewAngleLimit));
  
  const isDraggingRef = useRef(false);
  const previousPointerPosition = useRef({ x: 0, y: 0 });
  
  const initialOrientationRef = useRef<{ beta: number | null, gamma: number | null }>({ beta: null, gamma: null });

  const renderRequestedRef = useRef(false);

  const requestRenderIfNotRequested = () => {
    if (!renderRequestedRef.current) {
      renderRequestedRef.current = true;
      requestAnimationFrame(renderScene);
    }
  };

  const renderScene = () => {
    renderRequestedRef.current = false;
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  useImperativeHandle(ref, () => ({
    async handleExport(format: 'glb') {
      if (!meshRef.current || !rendererRef.current || !sceneRef.current || !cameraRef.current || format !== 'glb') {
        throw new Error('Export is not ready or format is not supported.');
      }
    
      setIsLoading(true);
    
      try {
        const exporter = new GLTFExporter();
        const originalMesh = meshRef.current;
        const originalMaterial = originalMesh.material as THREE.ShaderMaterial;
    
        // 1. Off-screen render to bake texture
        const renderTarget = new THREE.WebGLRenderer({ 
          antialias: true,
          alpha: true
        });
        renderTarget.setSize(originalMaterial.uniforms.uResolution.value.x, originalMaterial.uniforms.uResolution.value.y);
        renderTarget.outputColorSpace = THREE.SRGBColorSpace;
        
        const bakedTexture = new THREE.WebGLRenderTarget(
          originalMaterial.uniforms.uResolution.value.x,
          originalMaterial.uniforms.uResolution.value.y,
          {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            colorSpace: THREE.SRGBColorSpace,
          }
        );
    
        rendererRef.current.setRenderTarget(bakedTexture);
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        rendererRef.current.setRenderTarget(null);
    
        // 2. Displace vertices on CPU
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
    
        // 3. Create export mesh with baked texture and export
        return new Promise<void>((resolve, reject) => {
          const exportMaterial = new THREE.MeshBasicMaterial({ map: bakedTexture.texture });
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
              resolve();
            },
            (error) => {
              console.error('An error happened during parsing', error);
              reject(new Error('Failed to export GLB.'));
            },
            { binary: true }
          );
        });
      } finally {
        setIsLoading(false);
      }
    }
  }));

 useEffect(() => {
    if (!liveMaterialRef.current) return;
    liveMaterialRef.current.uniforms.uDepthMultiplier.value = depthMultiplier;
    requestRenderIfNotRequested();
  }, [depthMultiplier]);

  useEffect(() => {
    if (cameraRef.current?.type === 'PerspectiveCamera') {
      (cameraRef.current as THREE.PerspectiveCamera).position.z = cameraDistance;
    }
    cameraRef.current?.updateProjectionMatrix();
    requestRenderIfNotRequested();
  }, [cameraDistance]);

  useEffect(() => {
    if (cameraRef.current?.type === 'OrthographicCamera') {
      (cameraRef.current as THREE.OrthographicCamera).zoom = orthographicZoom;
    }
    cameraRef.current?.updateProjectionMatrix();
    requestRenderIfNotRequested();
  }, [orthographicZoom]);
  
  useEffect(() => {
    maxAngleRef.current = THREE.MathUtils.degToRad(viewAngleLimit);
  }, [viewAngleLimit]);

  useEffect(() => {
    if (sceneRef.current && rendererRef.current) {
      sceneRef.current.background = backgroundMode === 'solid' ? new THREE.Color(backgroundColor) : null;
      rendererRef.current.setClearAlpha(backgroundMode === 'blur' ? 0 : 1);
      requestRenderIfNotRequested();
    }
  }, [backgroundMode, backgroundColor]);

  useEffect(() => {
    if (meshRef.current && meshRef.current.geometry.parameters.widthSegments !== meshDetail) {
      meshRef.current.geometry.dispose();
      meshRef.current.geometry = new THREE.PlaneGeometry(2, 2, meshDetail, meshDetail);
      requestRenderIfNotRequested();
    }
  }, [meshDetail]);


  const onPointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current || !meshRef.current || useSensor) return;
      const deltaX = event.clientX - previousPointerPosition.current.x;
      const deltaY = event.clientY - previousPointerPosition.current.y;

      const maxAngle = maxAngleRef.current;
      meshRef.current.rotation.y = THREE.MathUtils.clamp(meshRef.current.rotation.y + deltaX * 0.005, -maxAngle, maxAngle);
      meshRef.current.rotation.x = THREE.MathUtils.clamp(meshRef.current.rotation.x + deltaY * 0.005, -maxAngle, maxAngle);

      previousPointerPosition.current.x = event.clientX;
      previousPointerPosition.current.y = event.clientY;
      requestRenderIfNotRequested();
  };

  const onPointerUp = () => {
      isDraggingRef.current = false;
      if (mountRef.current) mountRef.current.style.cursor = 'grab';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
  };
  
  const onPointerDown = (event: PointerEvent) => {
      if(useSensor) return;
      event.preventDefault();
      isDraggingRef.current = true;
      previousPointerPosition.current.x = event.clientX;
      previousPointerPosition.current.y = event.clientY;
      if (mountRef.current) mountRef.current.style.cursor = 'grabbing';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
  };

  const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (!meshRef.current || !event.beta || !event.gamma) return;
  
      if (initialOrientationRef.current.beta === null || initialOrientationRef.current.gamma === null) {
        initialOrientationRef.current = { beta: event.beta, gamma: event.gamma };
      }
      
      const beta = event.beta - initialOrientationRef.current.beta;
      const gamma = event.gamma - initialOrientationRef.current.gamma;

      const maxAngle = maxAngleRef.current;
      
      meshRef.current.rotation.x = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(beta * -0.5), -maxAngle, maxAngle);
      meshRef.current.rotation.y = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(gamma * -0.5), -maxAngle, maxAngle);
      requestRenderIfNotRequested();
  };


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
      if (meshRef.current) {
        meshRef.current.rotation.x = 0;
        meshRef.current.rotation.y = 0;
        requestRenderIfNotRequested();
      }
       if(currentMount) currentMount.style.cursor = 'grab';
    }

    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    }
  }, [useSensor]);

  useEffect(() => {
    if (!mountRef.current || !image || !depthMap) return;
    let isCancelled = false;
    setIsLoading(true);

    const currentMount = mountRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
        camera.position.z = 2;
        camera.updateProjectionMatrix();
    }
    cameraRef.current = camera;
    
    scene.background = backgroundMode === 'solid' ? new THREE.Color(backgroundColor) : null;
    renderer.setClearAlpha(backgroundMode === 'blur' ? 0 : 1);
    
    const loadingManager = new THREE.LoadingManager();
    const textureLoader = new THREE.TextureLoader(loadingManager);
    
    const colorTexture = textureLoader.load(image);
    const depthTexture = textureLoader.load(depthMap);

    Promise.all([
      new Promise(resolve => textureLoader.load(image, resolve)),
      new Promise(resolve => textureLoader.load(depthMap, resolve))
    ]).then(([colorTex, depthTex]) => {
      if (isCancelled) return;
      
      const loadedColorTexture = colorTex as THREE.Texture;
      const loadedDepthTexture = depthTex as THREE.Texture;

      // --- Baking Pass ---
      const resolution = new THREE.Vector2(loadedColorTexture.image.width, loadedColorTexture.image.height);
      const bakedRenderTarget = new THREE.WebGLRenderTarget(resolution.x, resolution.y, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
      bakedTextureRef.current = bakedRenderTarget;

      const bakingMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: loadedColorTexture },
          uDepthMap: { value: loadedDepthTexture },
          uBlurIntensity: { value: blurIntensity },
          uBlurOffset: { value: blurOffset },
          uResolution: { value: resolution },
          uRenderMode: { value: renderMode === 'fill' ? 1 : 0 },
        },
        vertexShader: bakingVertexShader,
        fragmentShader: bakingFragmentShader,
      });

      const bakingScene = new THREE.Scene();
      const bakingMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakingMaterial);
      bakingScene.add(bakingMesh);

      renderer.setRenderTarget(bakedRenderTarget);
      renderer.render(bakingScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
      renderer.setRenderTarget(null);

      // --- Live Scene Setup ---
      const geometry = new THREE.PlaneGeometry(2, 2, meshDetail, meshDetail);
      const liveMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uBakedTexture: { value: bakedRenderTarget.texture },
          uDepthMap: { value: loadedDepthTexture },
          uDepthMultiplier: { value: depthMultiplier },
        },
        vertexShader: liveVertexShader,
        fragmentShader: liveFragmentShader,
      });
      liveMaterialRef.current = liveMaterial;

      const plane = new THREE.Mesh(geometry, liveMaterial);
      const imageAspect = loadedColorTexture.image.width / loadedColorTexture.image.height;
      plane.scale.set(imageAspect, 1, 1);
      scene.add(plane);
      meshRef.current = plane;

      setIsLoading(false);
      requestRenderIfNotRequested();
    });

    currentMount.addEventListener('pointerdown', onPointerDown);
    currentMount.style.cursor = useSensor ? 'default' : 'grab';

    const handleResize = () => {
      const width = currentMount.clientWidth;
      const height = currentMount.clientHeight;
      renderer.setSize(width, height);
      
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
      window.removeEventListener('resize', handleResize);
      currentMount.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      
      colorTexture.dispose();
      depthTexture.dispose();
      bakedTextureRef.current?.dispose();

      if (meshRef.current) {
        meshRef.current.geometry?.dispose();
        liveMaterialRef.current?.dispose();
        scene.remove(meshRef.current);
      }
      meshRef.current = undefined;
      liveMaterialRef.current = undefined;

      if (renderer.domElement && currentMount.contains(renderer.domElement)) {
         currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      rendererRef.current = undefined;
    };
  }, [image, depthMap, cameraType, meshDetail, blurIntensity, blurOffset, renderMode]);

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

    