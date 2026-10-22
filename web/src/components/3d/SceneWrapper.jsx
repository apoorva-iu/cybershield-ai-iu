import React, { useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { HeroIllustration } from '../illustrations';
import { useInView } from 'framer-motion';

const HeroScene = React.lazy(() => import('./Hero3D'));

export function SceneWrapper() {
  const [shouldRender3D, setShouldRender3D] = useState(false);
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: false });

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isLowEnd = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 4;
    
    let hasWebGL = false;
    try {
      const canvas = document.createElement('canvas');
      hasWebGL = !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch(e) {}

    if (!prefersReducedMotion && !isLowEnd && hasWebGL) {
      setShouldRender3D(true);
    }
  }, []);

  if (!shouldRender3D) {
    return <HeroIllustration style={{ width: '100%', height: '100%', maxWidth: '400px' }} />;
  }

  return (
    <div ref={ref} style={{ width: '100%', height: '400px', position: 'relative' }}>
      <Suspense fallback={<div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />}>
        {isInView && (
          <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
            <HeroScene />
          </Canvas>
        )}
      </Suspense>
    </div>
  );
}

