
"use client";

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

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
  viewAngleLimit: number;
  useSensor: boolean;
  backgroundMode: 'blur' | 'solid';
  backgroundColor: string;
  renderMode: RenderMode;
  selectionRange: number;
  cameraType: CameraType;
}

export function DepthWeaverScene({ 
  image, 
  depthMap, 
  depthMultiplier, 
  cameraDistance, 
  orthographicZoom,
  meshDetail, 
  blurIntensity, 
  viewAngleLimit, 
  useSensor,
  backgroundMode,
  backgroundColor,
  renderMode,
  selectionRange,
  cameraType,
}: DepthWeaverSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const materialRef = useRef<THREE.ShaderMaterial>();
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera>();
  const meshRef = useRef<THREE.Mesh>();
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const maxAngleRef = useRef(THREE.MathUtils.degToRad(viewAngleLimit));
  
  const isDraggingRef = useRef(false);
  const previousPointerPosition = useRef({ x: 0, y: 0 });
  
  const initialOrientationRef = useRef<{ beta: number | null, gamma: number | null }>({ beta: null, gamma: null });

  useEffect(() => {
    if (materialRef.current) {
        materialRef.current.uniforms.uDepthMultiplier.value = depthMultiplier;
    }
  }, [depthMultiplier]);
  
  useEffect(() => {
    if (cameraRef.current && cameraRef.current.type === 'PerspectiveCamera') {
        (cameraRef.current as THREE.PerspectiveCamera).position.z = cameraDistance;
    }
  }, [cameraDistance]);

  useEffect(() => {
    if (cameraRef.current && cameraRef.current.type === 'OrthographicCamera') {
        (cameraRef.current as THREE.OrthographicCamera).zoom = orthographicZoom;
        cameraRef.current.updateProjectionMatrix();
    }
  }, [orthographicZoom]);

  useEffect(() => {
    if (materialRef.current) {
        materialRef.current.uniforms.uBlurIntensity.value = blurIntensity;
    }
  }, [blurIntensity]);
  
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uRenderMode.value = renderMode === 'fill' ? 1 : 0;
    }
  }, [renderMode]);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uSelectionRange.value = selectionRange;
    }
  }, [selectionRange]);

  useEffect(() => {
    maxAngleRef.current = THREE.MathUtils.degToRad(viewAngleLimit);
  }, [viewAngleLimit]);

  useEffect(() => {
      if (sceneRef.current && rendererRef.current) {
          if (backgroundMode === 'solid') {
              sceneRef.current.background = new THREE.Color(backgroundColor);
          } else {
              sceneRef.current.background = null; 
          }
          rendererRef.current.setClearAlpha(backgroundMode === 'blur' ? 0 : 1);
      }
  }, [backgroundMode, backgroundColor]);

  // Effect for updating mesh detail
  useEffect(() => {
    if (meshRef.current) {
      setIsLoading(true);
      // Dispose the old geometry to free up memory
      meshRef.current.geometry.dispose();
      // Create and assign the new geometry
      meshRef.current.geometry = new THREE.PlaneGeometry(2, 2, meshDetail, meshDetail);
      setIsLoading(false);
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
      
      const beta = event.beta - initialOrientationRef.current.beta;  // Front-back tilt
      const gamma = event.gamma - initialOrientationRef.current.gamma; // Left-right tilt

      const maxAngle = maxAngleRef.current;
      
      meshRef.current.rotation.x = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(beta * -0.5), -maxAngle, maxAngle);
      meshRef.current.rotation.y = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(gamma * -0.5), -maxAngle, maxAngle);
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
      }
       if(currentMount) currentMount.style.cursor = 'grab';
    }

    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    }
  }, [useSensor]);

  useEffect(() => {
    if (!mountRef.current || !image || !depthMap) return;
    setIsLoading(true);

    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    if (backgroundMode === 'solid') {
      scene.background = new THREE.Color(backgroundColor);
    } else {
      scene.background = null;
    }

    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const aspect = currentMount.clientWidth / currentMount.clientHeight;

    if (cameraType === 'perspective') {
        camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
        camera.position.z = cameraDistance;
    } else {
        const frustumSize = 2;
        camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 100);
        camera.zoom = orthographicZoom;
        camera.position.z = 2; // Position doesn't affect size, but needs to be outside the mesh
        camera.updateProjectionMatrix();
    }
    
    cameraRef.current = camera;


    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearAlpha(backgroundMode === 'blur' ? 0 : 1);
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const loadingManager = new THREE.LoadingManager(() => {
        setIsLoading(false);
    });
    const textureLoader = new THREE.TextureLoader(loadingManager);
    
    const applyTextureSettings = (texture: THREE.Texture) => {
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    };

    const colorTexture = textureLoader.load(image, applyTextureSettings);
    const depthTexture = textureLoader.load(depthMap, applyTextureSettings);

    const geometry = new THREE.PlaneGeometry(2, 2, meshDetail, meshDetail);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: colorTexture },
        uDepthMap: { value: depthTexture },
        uDepthMultiplier: { value: depthMultiplier },
        uBlurIntensity: { value: blurIntensity },
        uResolution: { value: new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight) },
        uRenderMode: { value: renderMode === 'fill' ? 1 : 0 },
        uSelectionRange: { value: selectionRange }
      },
      vertexShader: `
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
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform sampler2D uDepthMap;
        uniform float uBlurIntensity;
        uniform vec2 uResolution;
        uniform int uRenderMode;
        uniform int uSelectionRange;

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

              for (int x = -4; x <= 4; x++) {
                for (int y = -4; y <= 4; y++) {
                  float offsetX = float(x) * pixelSizeX * blurStrength;
                  float offsetY = float(y) * pixelSizeY * blurStrength;
                  vec2 sampleUV = vUv + vec2(offsetX, offsetY);
                  
                  float weight = exp(-(float(x*x + y*y) / (2.0 * 16.0)));
                  
                  blurredColor += texture2D(uTexture, sampleUV) * weight;
                  totalWeight += weight;
                }
              }
              gl_FragColor = blurredColor / totalWeight;
            } else { // Fill Mode
              discard;
            }
          } else {
            gl_FragColor = texture2D(uTexture, vUv);
          }
        }
      `,
    });
    materialRef.current = material;
    
    const plane = new THREE.Mesh(geometry, material);
    textureLoader.load(image, (texture) => {
        const aspect = texture.image.naturalWidth / texture.image.naturalHeight;
        plane.scale.set(aspect, 1, 1);
    });

    scene.add(plane);
    meshRef.current = plane;
    
    currentMount.addEventListener('pointerdown', onPointerDown);
    if (!useSensor) {
      currentMount.style.cursor = 'grab';
    } else {
      currentMount.style.cursor = 'default';
    }

    const handleResize = () => {
      const width = currentMount.clientWidth;
      const height = currentMount.clientHeight;
      renderer.setSize(width, height);
      if (materialRef.current) {
        materialRef.current.uniforms.uResolution.value.set(width, height);
      }
      
      const newAspect = width / height;
      if (camera.type === 'PerspectiveCamera') {
        (camera as THREE.PerspectiveCamera).aspect = newAspect;
      } else if (camera.type === 'OrthographicCamera') {
        const cam = camera as THREE.OrthographicCamera;
        const frustumSize = 2;
        cam.left = frustumSize * newAspect / -2;
        cam.right = frustumSize * newAspect / 2;
        cam.top = frustumSize / 2;
        cam.bottom = frustumSize / -2;
      }
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      currentMount.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);

      // Dispose of Three.js objects
      if (meshRef.current) {
        if(meshRef.current.geometry) {
            meshRef.current.geometry.dispose();
        }
        if(meshRef.current.material) {
            // If the material is an array, dispose each one.
            if (Array.isArray(meshRef.current.material)) {
                meshRef.current.material.forEach(material => material.dispose());
            } else {
                (meshRef.current.material as THREE.Material).dispose();
            }
        }
        scene.remove(meshRef.current);
        meshRef.current = undefined;
      }
      
      colorTexture.dispose();
      depthTexture.dispose();

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && currentMount.contains(renderer.domElement)) {
           currentMount.removeChild(renderer.domElement);
        }
      }
    };
  }, [image, depthMap, cameraType]);

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
}
