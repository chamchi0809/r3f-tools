import React, { useState, useRef } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { PerspectiveCamera, TransformControls, OrbitControls, useGLTF } from '@react-three/drei'
import { PrimitiveBox, PrimitiveSphere, PrimitivePlane } from './components'
import { useSelectionStore } from './store'
import { prefabRegistry, PrefabData } from './prefabs/registry'
import { Prefab } from './components/Prefab'
import * as THREE from 'three/webgpu'

// Extend R3F with WebGPU types
extend(THREE as any)

type ShapeType = 'box' | 'sphere' | 'plane'
type LightType = 'ambient' | 'directional' | 'point'
interface Shape {
  id: string
  type: ShapeType
  position: [number, number, number]
}

interface Light {
  id: string
  type: LightType
  position?: [number, number, number]
  color?: string
  intensity?: number
}

interface GLTFModel {
  id: string
  url: string
  position: [number, number, number]
}

function GLTFModelComponent({ url, position, id: _id, onClick, highlighted }: { url: string, position: [number, number, number], id: string, onClick: () => void, highlighted: boolean }) {
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

export default function App(): React.JSX.Element {
  const [shapes, setShapes] = useState<Shape[]>([])
  const [lights, setLights] = useState<Light[]>([])
  const [models, setModels] = useState<GLTFModel[]>([])
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate')
  const [isTransforming, setIsTransforming] = useState(false)
  const selectedId = useSelectionStore(state => state.selectedId)
  const setSelectedId = useSelectionStore(state => state.setSelectedId)
  const meshRefs = useRef<Record<string, any>>({})
  const [savePath, setSavePath] = useState<string>('scene.json')
  const [prefabInstances, setPrefabInstances] = useState<Array<{ id: string, prefabKey: string }>>([])  
  const [prefabMessage, setPrefabMessage] = useState<string>('')

  // Fetch config on mount
  React.useEffect(() => {
    fetch('/config.json')
      .then(res => res.json())
      .then(config => {
        if (config.defaultSavePath) setSavePath(config.defaultSavePath)
      })
      .catch(() => {
        // Fallback to default if fetch fails
      })
  }, [])

  const addShape = (type: ShapeType) => {
    const id = Math.random().toString(36).substr(2, 9)
    const position: [number, number, number] = [
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      0
    ]
    setShapes([...shapes, { id, type, position }])
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      const id = Math.random().toString(36).substr(2, 9)
      const position: [number, number, number] = [0, 0, 0]
      setModels([...models, { id, url, position }])
    }
  }

  const addLight = (type: LightType) => {
    const id = Math.random().toString(36).substr(2, 9)
    const position: [number, number, number] = type === 'ambient' ? [0, 0, 0] : [
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8 + 3,
      (Math.random() - 0.5) * 8
    ]
    const newLight: Light = {
      id,
      type,
      position: type === 'ambient' ? undefined : position,
      color: '#ffffff',
      intensity: type === 'ambient' ? 0.5 : 1.0
    }
    setLights([...lights, newLight])
  }

  const saveScene = () => {
    const sceneData = {
      shapes,
      lights,
      models: models.map(m => ({ id: m.id, position: m.position })) // Exclude blob URLs
    }
    const blob = new Blob([JSON.stringify(sceneData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = savePath // Uses config.json defaultSavePath value
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadScene = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const sceneData = JSON.parse(e.target?.result as string)
          if (sceneData.shapes) setShapes(sceneData.shapes)
          if (sceneData.lights) setLights(sceneData.lights)
          if (sceneData.models) {
            // Note: Loaded models will have no URL (cannot restore blob URLs)
            setModels(sceneData.models)
          }
        } catch (err) {
          console.error('Failed to load scene:', err)
        }
      }
      reader.readAsText(file)
    }
  }

  const createPrefabFromSelected = () => {
    if (!selectedId) {
      setPrefabMessage('No entity selected')
      setTimeout(() => setPrefabMessage(''), 2000)
      return
    }

    const prefabKey = prompt('Enter prefab key:')
    if (!prefabKey || prefabKey.trim() === '') {
      return
    }

    // Check if key already exists
    if (prefabRegistry.has(prefabKey)) {
      setPrefabMessage(`Prefab key "${prefabKey}" already exists`)
      setTimeout(() => setPrefabMessage(''), 2000)
      return
    }

    // Find the selected entity
    const shape = shapes.find(s => s.id === selectedId)
    const light = lights.find(l => l.id === selectedId)
    const model = models.find(m => m.id === selectedId)

    let prefabData: PrefabData | null = null

    if (shape) {
      prefabData = {
        type: 'shape',
        shapeType: shape.type,
        position: shape.position
      }
    } else if (light) {
      prefabData = {
        type: 'light',
        lightType: light.type,
        position: light.position,
        color: light.color,
        intensity: light.intensity
      }
    } else if (model) {
      prefabData = {
        type: 'model',
        url: model.url,
        position: model.position
      }
    }

    if (prefabData) {
      prefabRegistry.add(prefabKey, prefabData)
      setPrefabMessage(`Prefab "${prefabKey}" created`)
      setTimeout(() => setPrefabMessage(''), 2000)
    }
  }

  const instantiatePrefab = (prefabKey: string) => {
    const prefabData = prefabRegistry.get(prefabKey)
    if (!prefabData) return

    const id = Math.random().toString(36).substr(2, 9)
    setPrefabInstances([...prefabInstances, { id, prefabKey }])
  }

  const deletePrefab = (prefabKey: string) => {
    if (window.confirm(`Delete prefab "${prefabKey}"?`)) {
      prefabRegistry.remove(prefabKey)
      // Remove all instances of this prefab
      setPrefabInstances(prefabInstances.filter(p => p.prefabKey !== prefabKey))
      setPrefabMessage(`Prefab "${prefabKey}" deleted`)
      setTimeout(() => setPrefabMessage(''), 2000)
    }
  }

  const exportToJSX = () => {
    const indent = '      '
    let jsx = `import { useGLTF } from '@react-three/drei'

export default function Scene() {
  return (
    <group>`

    // Add shapes
    shapes.forEach(shape => {
      const pos = `[${shape.position.join(', ')}]`
      switch (shape.type) {
        case 'box':
          jsx += `\n${indent}<mesh position={${pos}}>\n${indent}  <boxGeometry />\n${indent}  <meshStandardMaterial />\n${indent}</mesh>`
          break
        case 'sphere':
          jsx += `\n${indent}<mesh position={${pos}}>\n${indent}  <sphereGeometry />\n${indent}  <meshStandardMaterial />\n${indent}</mesh>`
          break
        case 'plane':
          jsx += `\n${indent}<mesh position={${pos}}>\n${indent}  <planeGeometry args={[5, 5]} />\n${indent}  <meshStandardMaterial />\n${indent}</mesh>`
          break
      }
    })

    // Add lights
    lights.forEach(light => {
      const intensity = light.intensity ?? 1.0
      const color = light.color ?? '#ffffff'
      switch (light.type) {
        case 'ambient':
          jsx += `\n${indent}<ambientLight intensity={${intensity}} color="${color}" />`
          break
        case 'directional':
          if (light.position) {
            const pos = `[${light.position.join(', ')}]`
            jsx += `\n${indent}<directionalLight position={${pos}} intensity={${intensity}} color="${color}" />`
          }
          break
        case 'point':
          if (light.position) {
            const pos = `[${light.position.join(', ')}]`
            jsx += `\n${indent}<pointLight position={${pos}} intensity={${intensity}} color="${color}" />`
          }
          break
      }
    })

    // Add models
    models.forEach((model, idx) => {
      const pos = `[${model.position.join(', ')}]`
      jsx += `\n${indent}<Model${idx} position={${pos}} />`
    })

    jsx += `
    </group>
  )
}`

    // Add model components if any
    if (models.length > 0) {
      jsx += `\n\n// Model components (replace 'MODEL_URL' with actual paths)`
      models.forEach((model, idx) => {
        jsx += `\nfunction Model${idx}(props) {
  const gltf = useGLTF('MODEL_URL') // Replace with actual path
  return <primitive object={gltf.scene} {...props} />
}`
      })
    }

    // Download as file
    const blob = new Blob([jsx], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Scene.jsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLightClick = (id: string) => {
    setSelectedId(id)
  }

  const handleShapeClick = (id: string) => {
    setSelectedId(id)
  }

  // Styles
  const buttonStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #ccc',
    borderRadius: '4px',
    color: '#333',
    padding: '8px',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    textAlign: 'center'
  }

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: '#666',
    marginBottom: '10px',
    letterSpacing: '0.05em'
  }

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', display: 'flex' }}>
      
      {/* Sidebar Tool Panel */}
      <div style={{
        width: '280px',
        height: '100%',
        background: '#f5f5f5',
        borderRight: '1px solid #ccc',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        color: '#333',
        overflowY: 'auto',
        boxSizing: 'border-box',
        zIndex: 10
      }}>

        {/* Create Section */}
        <div>
          <div style={sectionLabelStyle}>Create</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <button onClick={() => addShape('box')} style={buttonStyle}>Box</button>
            <button onClick={() => addShape('sphere')} style={buttonStyle}>Sphere</button>
            <button onClick={() => addShape('plane')} style={buttonStyle}>Plane</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <button onClick={() => addLight('ambient')} style={buttonStyle}>Amb</button>
            <button onClick={() => addLight('directional')} style={buttonStyle}>Dir</button>
            <button onClick={() => addLight('point')} style={buttonStyle}>Point</button>
          </div>
        </div>

        {/* Transform Tools (Contextual) */}
        {selectedId && (
          <div>
            <div style={sectionLabelStyle}>Transform</div>
            <div style={{ display: 'flex', background: '#e0e0e0', padding: '4px', borderRadius: '6px', gap: '4px' }}>
              {(['translate', 'rotate', 'scale'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setTransformMode(mode)}
                  style={{
                    flex: 1,
                    background: transformMode === mode ? '#fff' : 'transparent',
                    border: 'none',
                    color: transformMode === mode ? '#333' : '#666',
                    padding: '6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    textTransform: 'capitalize'
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prefabs Section */}
        <div>
          <div style={sectionLabelStyle}>Prefabs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
            <button onClick={createPrefabFromSelected} style={buttonStyle} disabled={!selectedId}>
              {selectedId ? 'Create Prefab' : 'Select Entity'}
            </button>
            {prefabMessage && (
              <div style={{ fontSize: '11px', color: prefabMessage.includes('exists') || prefabMessage.includes('No entity') ? '#d32f2f' : '#4caf50', padding: '4px', textAlign: 'center' }}>
                {prefabMessage}
              </div>
            )}
          </div>
          <div style={{ 
            maxHeight: '120px', 
            overflowY: 'auto', 
            background: '#fff', 
            borderRadius: '6px', 
            padding: '8px',
            border: '1px solid #ddd'
          }}>
            {prefabRegistry.getAll().map(prefab => (
              <div key={prefab.key} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                <button 
                  onClick={() => instantiatePrefab(prefab.key)}
                  style={{ ...buttonStyle, flex: 1, padding: '4px 8px' }}
                >
                  {prefab.key}
                </button>
                <button 
                  onClick={() => deletePrefab(prefab.key)}
                  style={{ ...buttonStyle, padding: '4px 8px', color: '#d32f2f' }}
                >
                  ✕
                </button>
              </div>
            ))}
            {prefabRegistry.getAll().length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: '#888', fontSize: '11px' }}>No prefabs</div>
            )}
          </div>
        </div>

        {/* Scene Actions */}
        <div>
           <div style={sectionLabelStyle}>Scene</div>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label style={buttonStyle}>
                  Import GLTF
                  <input type="file" accept=".gltf,.glb" onChange={handleFileSelect} style={{ display: 'none' }} />
                </label>
                <label style={buttonStyle}>
                  Load Scene
                  <input type="file" accept=".json" onChange={loadScene} style={{ display: 'none' }} />
                </label>
             </div>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
               <button onClick={saveScene} style={buttonStyle}>Save JSON</button>
               <button onClick={exportToJSX} style={buttonStyle}>Export JSX</button>
             </div>
           </div>
        </div>

        {/* Hierarchy */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
          <div style={sectionLabelStyle}>Hierarchy</div>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto', 
            background: '#fff', 
            borderRadius: '6px', 
            padding: '8px',
            border: '1px solid #ddd'
          }}>
            {[
              ...shapes.map(s => ({ ...s, category: 'shape', label: `${s.type}` })),
              ...lights.map(l => ({ ...l, category: 'light', label: `${l.type} light` })),
              ...models.map(m => ({ ...m, category: 'model', label: 'gltf model' })),
              ...prefabInstances.map(p => ({ ...p, category: 'prefab', label: `prefab: ${p.prefabKey}` }))
            ].map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  background: selectedId === item.id ? '#4a90e2' : 'transparent',
                  color: selectedId === item.id ? '#fff' : '#333',
                  borderRadius: '4px',
                  marginBottom: '2px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  border: selectedId === item.id ? 'none' : '1px solid transparent'
                }}
              >
                {item.label} <span style={{ opacity: 0.4, marginLeft: 'auto', fontSize: '10px' }}>{item.id.slice(0, 4)}</span>
              </div>
            ))}
            
            {shapes.length === 0 && lights.length === 0 && models.length === 0 && prefabInstances.length === 0 && (
               <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '12px' }}>Scene is empty</div>
            )}
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas
          gl={async (props) => {
            const renderer = new THREE.WebGPURenderer(props as any)
            await renderer.init()
            return renderer
          }}
        >
          <PerspectiveCamera makeDefault position={[0, 0, 5]} />
          
          {shapes.map(shape => {
            const ShapeComponent = (() => {
              switch (shape.type) {
                case 'box': return PrimitiveBox
                case 'sphere': return PrimitiveSphere
                case 'plane': return PrimitivePlane
                default: return null
              }
            })()
            if (!ShapeComponent) return null
            return (
              <ShapeComponent 
                key={shape.id} 
                ref={(ref: any) => { meshRefs.current[shape.id] = ref }}
                position={shape.position} 
                onClick={(_e: any) => {
                   handleShapeClick(shape.id)
                }} 
                highlighted={selectedId === shape.id} 
              />
            )
          })}
          
          {lights.map(light => {
            const isSelected = selectedId === light.id
            switch (light.type) {
              case 'ambient':
                return (
                  <ambientLight 
                    key={light.id} 
                    intensity={light.intensity}
                    color={light.color}
                  />
                )
              case 'directional':
                return (
                  <group key={light.id}>
                    <directionalLight 
                      position={light.position}
                      intensity={light.intensity}
                      color={light.color}
                    />
                    {light.position && (
                      <mesh 
                        position={light.position}
                        onClick={(_e) => {
                          handleLightClick(light.id)
                        }}
                      >
                        <sphereGeometry args={[0.2, 16, 16]} />
                        <meshBasicMaterial color={isSelected ? '#00ffff' : '#ffff00'} />
                      </mesh>
                    )}
                  </group>
                )
              case 'point':
                return (
                  <group key={light.id}>
                    <pointLight 
                      position={light.position}
                      intensity={light.intensity}
                      color={light.color}
                    />
                    {light.position && (
                      <mesh 
                        position={light.position}
                        onClick={(_e) => {
                          handleLightClick(light.id)
                        }}
                      >
                        <sphereGeometry args={[0.2, 16, 16]} />
                        <meshBasicMaterial color={isSelected ? '#00ffff' : '#ff9900'} />
                      </mesh>
                    )}
                  </group>
                )
              default:
                return null
            }
          })}
          
          {models.map(model => (
            <GLTFModelComponent
              key={model.id}
              url={model.url}
              position={model.position}
              id={model.id}
              onClick={() => handleShapeClick(model.id)}
              highlighted={selectedId === model.id}
            />
          ))}
          
          {prefabInstances.map(instance => {
            const prefabData = prefabRegistry.get(instance.prefabKey)
            if (!prefabData) return null
            return (
              <Prefab
                key={instance.id}
                data={prefabData}
                id={instance.id}
                onClick={() => handleShapeClick(instance.id)}
                highlighted={selectedId === instance.id}
              />
            )
          })}
          
          {selectedId && meshRefs.current[selectedId] && (
            <TransformControls
              object={meshRefs.current[selectedId]}
              mode={transformMode}
              onMouseDown={() => setIsTransforming(true)}
              onMouseUp={() => setIsTransforming(false)}
            />
          )}
          <OrbitControls makeDefault enabled={!isTransforming} />
        </Canvas>
      </div>
    </div>
  )
}
