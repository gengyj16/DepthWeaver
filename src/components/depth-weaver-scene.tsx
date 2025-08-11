
"use client";

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface DepthWeaverSceneProps {
  image: string;
  depthMap: string;
  depthMultiplier: number;
  cameraDistance: number;
  meshDetail: number;
  blurIntensity: number;
  viewAngleLimit: number;
  useSensor: boolean;
  backgroundMode: 'blur' | 'solid';
  backgroundColor: string;
}

export function DepthWeaverScene({ 
  image, 
  depthMap, 
  depthMultiplier, 
  cameraDistance, 
  meshDetail, 
  blurIntensity, 
  viewAngleLimit, 
  useSensor,
  backgroundMode,
  backgroundColor
}: DepthWeaverSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const materialRef = useRef<THREE.ShaderMaterial>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const meshRef = useRef<THREE.Mesh>();
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const keyRef = useRef(meshDetail);
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
    if (cameraRef.current) {
        cameraRef.current.position.z = cameraDistance;
    }
  }, [cameraDistance]);

  useEffect(() => {
    if (materialRef.current) {
        materialRef.current.uniforms.uBlurIntensity.value = blurIntensity;
    }
  }, [blurIntensity]);

  useEffect(() => {
    maxAngleRef.current = THREE.MathUtils.degToRad(viewAngleLimit);
  }, [viewAngleLimit]);

  useEffect(() => {
      if (sceneRef.current) {
          if (backgroundMode === 'solid') {
              sceneRef.current.background = new THREE.Color(backgroundColor);
          } else {
              // Setting to null will make it transparent, showing the blurred div behind.
              sceneRef.current.background = null; 
          }
      }
      if (rendererRef.current) {
        // Ensure renderer's alpha setting matches the mode
        rendererRef.current.setClearAlpha(backgroundMode === 'blur' ? 0 : 1);
      }
  }, [backgroundMode, backgroundColor]);

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
      
      // We are mapping beta to x-axis rotation and gamma to y-axis.
      // The multipliers can be adjusted for sensitivity.
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
         // Gently reset rotation
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

    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 100);
    camera.position.z = cameraDistance;
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
    const colorTexture = textureLoader.load(image, (texture) => {
        if (meshRef.current) {
            const aspect = texture.image.naturalWidth / texture.image.naturalHeight;
            meshRef.current.scale.set(aspect, 1, 1);
        }
    });
    const depthTexture = textureLoader.load(depthMap);
    
    // Create geometry and material
    if (!meshRef.current || keyRef.current !== meshDetail) {
      if (meshRef.current) {
        scene.remove(meshRef.current);
        meshRef.current.geometry.dispose();
      }

      const geometry = new THREE.PlaneGeometry(2, 2, meshDetail, meshDetail);
      const material = materialRef.current || new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: colorTexture },
          uDepthMap: { value: depthTexture },
          uDepthMultiplier: { value: depthMultiplier },
          uBlurIntensity: { value: blurIntensity },
          uResolution: { value: new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight) }
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

            float dx = abs(depthE - depthW);
            float dy = abs(depthN - depthS);
            float gradient = smoothstep(0.0, 0.05, max(dx, dy));

            if (gradient > 0.1 && uBlurIntensity > 0.0) {
              vec4 blurredColor = vec4(0.0);
              float totalWeight = 0.0;
              float blurStrength = gradient * uBlurIntensity;

              for (int x = -4; x <= 4; x++) {
                for (int y = -4; y <= 4; y++) {
                  float offsetX = float(x) * pixelSizeX * blurStrength;
                  float offsetY = float(y) * pixelSizeY * blurStrength;
                  vec2 sampleUV = vUv + vec2(offsetX, offsetY);
                  
                  // Gaussian weight
                  float weight = exp(-(float(x*x + y*y) / (2.0 * 16.0)));
                  
                  blurredColor += texture2D(uTexture, sampleUV) * weight;
                  totalWeight += weight;
                }
              }
              gl_FragColor = blurredColor / totalWeight;
            } else {
              gl_FragColor = texture2D(uTexture, vUv);
            }
          }
        `,
      });
      materialRef.current = material;
      
      const plane = new THREE.Mesh(geometry, material);
      const aspect = colorTexture.image ? colorTexture.image.naturalWidth / colorTexture.image.naturalHeight : 1;
      plane.scale.set(aspect, 1, 1);
      scene.add(plane);
      meshRef.current = plane;
      keyRef.current = meshDetail;
    } else {
        scene.add(meshRef.current);
    }
    
    // Update textures
    if (materialRef.current) {
        materialRef.current.uniforms.uTexture.value = colorTexture;
        materialRef.current.uniforms.uDepthMap.value = depthTexture;
        materialRef.current.needsUpdate = true;
    }

    currentMount.addEventListener('pointerdown', onPointerDown);
    if (!useSensor) {
      currentMount.style.cursor = 'grab';
    } else {
      currentMount.style.cursor = 'default';
    }

    const handleResize = () => {
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
      if (materialRef.current) {
        materialRef.current.uniforms.uResolution.value.set(currentMount.clientWidth, currentMount.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    const animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      currentMount.removeEventListener('pointerdown', onPointerDown);
      // Clean up window listeners just in case
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);

      if (meshRef.current) {
        scene.remove(meshRef.current);
      }
      
      if (currentMount && renderer.domElement) {
         currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      colorTexture.dispose();
      depthTexture.dispose();
    };
  }, [image, depthMap, meshDetail]);

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
