import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

export default function HeroScene() {
  const group = useRef();
  const docRef = useRef();
  const magRef = useRef();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // Parallax
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, (state.mouse.x * Math.PI) / 6, 0.1);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, (state.mouse.y * Math.PI) / 6, 0.1);

    // Orbiting document
    docRef.current.position.x = Math.sin(t * 0.8) * 2.8;
    docRef.current.position.z = Math.cos(t * 0.8) * 2.8;
    docRef.current.position.y = Math.sin(t * 1.5) * 0.5;
    docRef.current.rotation.y = t * 0.8;
    docRef.current.rotation.x = Math.sin(t * 2) * 0.2;
    
    // Orbiting magnifier
    magRef.current.position.x = Math.sin(t * 0.8 + Math.PI) * 2.8;
    magRef.current.position.z = Math.cos(t * 0.8 + Math.PI) * 2.8;
    magRef.current.position.y = Math.cos(t * 1.5) * 0.5;
    magRef.current.rotation.y = t * 0.8 + Math.PI;
    magRef.current.rotation.z = Math.sin(t * 2) * 0.2;
  });

  return (
    <group ref={group}>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.5, 1.5, 0.4, 6]} />
          <meshPhysicalMaterial 
            color="#0A66C2" 
            metalness={0.2} 
            roughness={0.1} 
            clearcoat={1} 
            clearcoatRoughness={0.1} 
          />
          <mesh position={[0, 0.21, 0]}>
            <cylinderGeometry args={[1.2, 1.2, 0.02, 6]} />
            <meshPhysicalMaterial color="#3399ff" metalness={0.5} roughness={0.2} />
          </mesh>
        </mesh>
      </Float>

      <group ref={docRef}>
        <Float speed={3} rotationIntensity={1} floatIntensity={2}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.2, 1.6, 0.1]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, 0.4, 0.06]}>
            <boxGeometry args={[0.8, 0.1, 0.02]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          <mesh position={[0, 0.1, 0.06]}>
            <boxGeometry args={[0.8, 0.1, 0.02]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          <mesh position={[0, -0.2, 0.06]}>
            <boxGeometry args={[0.8, 0.1, 0.02]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        </Float>
      </group>

      <group ref={magRef}>
        <Float speed={3} rotationIntensity={1} floatIntensity={2}>
          <mesh castShadow receiveShadow>
            <torusGeometry args={[0.6, 0.1, 16, 32]} />
            <meshPhysicalMaterial color="#333333" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0.5, -0.5, 0]} rotation={[0, 0, Math.PI / 4]}>
            <cylinderGeometry args={[0.08, 0.08, 1]} />
            <meshPhysicalMaterial color="#333333" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.55, 0.55, 0.05, 32]} />
            <meshPhysicalMaterial color="#88ccff" transmission={0.9} opacity={1} transparent roughness={0} />
          </mesh>
        </Float>
      </group>

      <Environment preset="city" />
      <ContactShadows position={[0, -2.5, 0]} opacity={0.4} scale={10} blur={2} far={4} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
    </group>
  );
}

