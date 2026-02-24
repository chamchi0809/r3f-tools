/**
 * Prefab Component
 * 
 * Instantiates a prefab from the registry into the scene.
 */

import React from 'react'
import { useGLTF } from '@react-three/drei'
import { PrefabData, prefabRegistry } from '../prefabs/registry'

interface PrefabProps {
  data?: PrefabData
  prefabKey?: string
  id?: string
  onClick?: () => void
  highlighted?: boolean
}

function GLTFPrefab({ url, position, onClick, highlighted }: { url: string, position: [number, number, number], onClick?: () => void, highlighted?: boolean }) {
  const gltf = useGLTF(url)
  return (
    <primitive 
      object={gltf.scene.clone()} 
      position={position} 
      onClick={onClick}
      scale={highlighted ? 1.1 : 1}
    />
  )
}

export function Prefab({ data: dataProp, prefabKey, id: _id, onClick, highlighted }: PrefabProps): React.JSX.Element | null {
  // Load data from registry if prefabKey provided
  const data = dataProp ?? (prefabKey ? prefabRegistry.getByKey(prefabKey)?.data : undefined)
  
  // If no data available, render nothing
  if (!data) return null
  
  const position = data.position || [0, 0, 0]

  // Render shape
  if (data.type === 'shape' && data.shapeType) {
    const meshProps = {
      position,
      onClick,
      scale: highlighted ? 1.1 : 1
    }

    switch (data.shapeType) {
      case 'box':
        return (
          <mesh {...meshProps}>
            <boxGeometry />
            <meshStandardMaterial />
          </mesh>
        )
      case 'sphere':
        return (
          <mesh {...meshProps}>
            <sphereGeometry />
            <meshStandardMaterial />
          </mesh>
        )
      case 'plane':
        return (
          <mesh {...meshProps}>
            <planeGeometry args={[5, 5]} />
            <meshStandardMaterial />
          </mesh>
        )
    }
  }

  // Render light
  if (data.type === 'light' && data.lightType) {
    const intensity = data.intensity ?? 1.0
    const color = data.color ?? '#ffffff'

    switch (data.lightType) {
      case 'ambient':
        return <ambientLight intensity={intensity} color={color} />
      case 'directional':
        return (
          <group>
            <directionalLight position={position} intensity={intensity} color={color} />
            <mesh position={position} onClick={onClick}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshBasicMaterial color={highlighted ? '#00ffff' : '#ffff00'} />
            </mesh>
          </group>
        )
      case 'point':
        return (
          <group>
            <pointLight position={position} intensity={intensity} color={color} />
            <mesh position={position} onClick={onClick}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshBasicMaterial color={highlighted ? '#00ffff' : '#ff9900'} />
            </mesh>
          </group>
        )
    }
  }

  // Render model
  if (data.type === 'model' && data.url) {
    return <GLTFPrefab url={data.url} position={position} onClick={onClick} highlighted={highlighted} />
  }

  return null
}
