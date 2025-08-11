"use client";

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface DepthWeaverSceneProps {
  image: string;
  depthMap: string;
  depthMultiplier: number;
  cameraDistance: number;
}

export function DepthWeaverScene({ image, depthMap, depthMultiplier, cameraDistance }: DepthWeaverSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const materialRef = useRef<THREE.ShaderMaterial>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();

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

    const geometry = new THREE.PlaneGeometry(2, 2, 256, 256);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: colorTexture },
        uDepthMap: { value: depthTexture },
        uDepthMultiplier: { value: depthMultiplier },
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
        varying vec2 vUv;
        
        void main() {
          gl_FragColor = texture2D(uTexture, vUv);
        }
      `,
    });
    materialRef.current = material;

    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

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
        if (!isDragging) return;
        const deltaX = event.clientX - previousPointerPosition.x;
        const deltaY = event.clientY - previousPointerPosition.y;

        plane.rotation.y = THREE.MathUtils.clamp(plane.rotation.y + deltaX * 0.005, -maxAngle, maxAngle);
        plane.rotation.x = THREE.MathUtils.clamp(plane.rotation.x + deltaY * 0.005, -maxAngle, maxAngle);

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
      if (currentMount && renderer.domElement) {
         currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      colorTexture.dispose();
      depthTexture.dispose();
    };
  }, [image, depthMap]);

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-primary mx-auto"></div>
            <p className="mt-4 text-lg font-semibold">Weaving your 3D scene...</p>
          </div>
        </div>
      )}
      <div ref={mountRef} className="absolute inset-0 w-full h-full z-0" />
    </>
  );
}
