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
}

export function DepthWeaverScene({ image, depthMap, depthMultiplier, cameraDistance, meshDetail, blurIntensity }: DepthWeaverSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const materialRef = useRef<THREE.ShaderMaterial>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const meshRef = useRef<THREE.Mesh>();
  const keyRef = useRef(meshDetail);

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
    if (!mountRef.current || !image || !depthMap) return;
    setIsLoading(true);

    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 100);
    camera.position.z = cameraDistance;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    currentMount.appendChild(renderer.domElement);

    const loadingManager = new THREE.LoadingManager(() => {
        setIsLoading(false);
    });
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const colorTexture = textureLoader.load(image);
    const depthTexture = textureLoader.load(depthMap);
    
    colorTexture.colorSpace = THREE.SRGBColorSpace;
    
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


    let isDragging = false;
    const previousPointerPosition = { x: 0, y: 0 };
    const maxAngle = 0.26; // Approx 15 degrees

    const onPointerDown = (event: PointerEvent) => {
        isDragging = true;
        previousPointerPosition.x = event.clientX;
        previousPointerPosition.y = event.clientY;
        currentMount.style.cursor = 'grabbing';
    };

    const onPointerMove = (event: PointerEvent) => {
        if (!isDragging || !meshRef.current) return;
        const deltaX = event.clientX - previousPointerPosition.x;
        const deltaY = event.clientY - previousPointerPosition.y;

        meshRef.current.rotation.y = THREE.MathUtils.clamp(meshRef.current.rotation.y + deltaX * 0.005, -maxAngle, maxAngle);
        meshRef.current.rotation.x = THREE.MathUtils.clamp(meshRef.current.rotation.x + deltaY * 0.005, -maxAngle, maxAngle);

        previousPointerPosition.x = event.clientX;
        previousPointerPosition.y = event.clientY;
    };

    const onPointerUp = () => {
        isDragging = false;
        currentMount.style.cursor = 'grab';
    };

    currentMount.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    currentMount.style.cursor = 'grab';

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
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      
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
      <div ref={mountRef} className="absolute inset-0 w-full h-full z-0" />
    </>
  );
}
