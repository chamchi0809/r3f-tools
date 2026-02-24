import React, { useMemo, useRef, useState } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, TransformControls } from '@react-three/drei'
import { WorldProvider, useQuery, useTrait } from 'koota/react'
import type { Entity as KootaEntity } from 'koota'
import {
  addChild,
  engineWorld,
  selectionActions,
  spawnEntityBlueprint,
  updateEntityBlueprint,
  EntityBlueprintTrait,
  SelectionStateTrait,
  TraitDescriptorTrait,
} from './store'
import type { EntityId, EntityBlueprint, TraitDescriptor } from './store/ecs'
import * as THREE from 'three/webgpu'

extend(THREE as any)

interface PrefabEntityNode {
  id: EntityId
  name: string
  value: EntityBlueprint
}

export default function App(): React.JSX.Element {
  return (
    <WorldProvider world={engineWorld}>
      <EngineApp />
    </WorldProvider>
  )
}

function EngineApp(): React.JSX.Element {
  const selectionState = useTrait(engineWorld, SelectionStateTrait)
  const selectedId = selectionState?.selectedId ?? null
  const entityBlueprints = useQuery(EntityBlueprintTrait)
  const traitDescriptors = useQuery(TraitDescriptorTrait)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [isTransforming, setIsTransforming] = useState(false)
  const meshRefs = useRef<Record<string, THREE.Object3D | null>>({})

  React.useEffect(() => {
    if (entityBlueprints.length === 0) {
      const rootEntity = spawnEntityBlueprint({
        name: 'Root Prefab',
        type: 'group',
        traitIds: [],
        children: [],
      })
    }
  }, [entityBlueprints.length])

  const selectedEntity = selectedId ? entityBlueprints.find((entity) => entity.id() === selectedId) : undefined
  const selectedValue = selectedEntity?.get(EntityBlueprintTrait)
  const selectedTraits = selectedValue
    ? selectedValue.traitIds
        .map((traitId) => traitDescriptors.find((trait) => trait.get(TraitDescriptorTrait)?.id === traitId))
        .map((entity) => entity?.get(TraitDescriptorTrait))
        .filter((trait): trait is TraitDescriptor => Boolean(trait))
    : []

  const handleSelectEntity = (id: EntityId) => {
    selectionActions.setSelectedId(id)
  }

  const handleAddChild = () => {
    const parentId = selectedId ?? entityBlueprints[0]?.id() ?? 0
    const name = prompt('Enter child name:')
    if (!name || name.trim() === '') return
    const childEntity = spawnEntityBlueprint({
      name,
      type: 'mesh',
      traitIds: [],
      children: [],
    })

    const parentEntity = entityBlueprints.find((entity) => entity.id() === parentId)
    if (parentEntity) {
      addChild(parentEntity, childEntity)
    }

    selectionActions.setSelectedId(childEntity.id())
    setStatusMessage(`Child "${name}" added`)
    setTimeout(() => setStatusMessage(''), 2000)
  }

  const handleRemoveEntity = () => {
    if (!selectedId) return
    const entity = entityBlueprints.find((item) => item.id() === selectedId)
    if (!entity) return
    entity.destroy()
    const newSelected = entityBlueprints.find((item) => item.id() !== selectedId)
    selectionActions.setSelectedId(newSelected?.id() ?? null)
  }

  const handleEntityTypeChange = (type: EntityBlueprint['type']) => {
    if (!selectedId) return
    if (!selectedEntity) return
    if (type === 'group') {
      updateEntityBlueprint(selectedEntity, {
        type: 'group',
        children: selectedValue?.type === 'group' ? selectedValue.children : [],
      })
      return
    }
    updateEntityBlueprint(selectedEntity, {
      type: 'mesh',
      children: [],
    })
  }

  const handleTraitAdd = () => {
    if (!selectedId) return
    const traitName = prompt('Trait name?')
    if (!traitName || traitName.trim() === '') return
    if (!selectedEntity || !selectedValue) return
    const traitEntity = engineWorld.spawn(TraitDescriptorTrait({
      id: createTraitId(),
      kind: 'custom',
      name: traitName,
      value: {},
    }))
    updateEntityBlueprint(selectedEntity, {
      traitIds: [...selectedValue.traitIds, traitEntity.get(TraitDescriptorTrait)!.id],
    })
  }

  const handleTraitRemove = (traitId: string) => {
    if (!selectedId) return
    if (!selectedEntity || !selectedValue) return
    const traitEntity = traitDescriptors.find((entity) => entity.get(TraitDescriptorTrait)?.id === traitId)
    if (traitEntity) traitEntity.destroy()
    updateEntityBlueprint(selectedEntity, {
      traitIds: selectedValue.traitIds.filter(id => id !== traitId),
    })
  }

  const handleTraitValueChange = (traitId: string, value: string) => {
    const traitEntity = traitDescriptors.find((entity) => entity.get(TraitDescriptorTrait)?.id === traitId)
    if (!traitEntity) return
    const trait = traitEntity.get(TraitDescriptorTrait)
    if (!trait) return
    traitEntity.set(TraitDescriptorTrait, {
      ...trait,
      value,
    })
  }

  const renderHierarchy = (entity: KootaEntity, depth = 0): React.JSX.Element | null => {
    const node = entity.get(EntityBlueprintTrait)
    if (!node) return null
    const paddingLeft = 8 + depth * 10
    const children = node.type === 'group' ? node.children : []

    return (
      <div key={node.id}>
        <div
          onClick={() => handleSelectEntity(node.id)}
          style={{
            padding: `6px 8px 6px ${paddingLeft}px`,
            cursor: 'pointer',
            background: selectedId === node.id ? '#4a90e2' : 'transparent',
            color: selectedId === node.id ? '#fff' : '#333',
            borderRadius: '4px',
            marginBottom: '2px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            border: selectedId === node.id ? 'none' : '1px solid transparent'
          }}
        >
          {node.name} <span style={{ opacity: 0.4, marginLeft: 'auto', fontSize: '10px' }}>{node.id.toString().slice(0, 4)}</span>
        </div>
        {children.map((childId: EntityId) => {
          const childEntity = entityBlueprints.find((item) => item.id() === childId)
          if (!childEntity) return null
          return renderHierarchy(childEntity, depth + 1)
        })}
      </div>
    )
  }

  const renderEntityNode = (entity: KootaEntity): React.JSX.Element | null => {
    const value = entity.get(EntityBlueprintTrait)
    if (!value) return null
    const isSelected = selectedId === value.id
    const refHandler = (ref: THREE.Object3D | null) => {
      meshRefs.current[value.id] = ref
    }

    if (value.type === 'group') {
      return (
        <group key={value.id} ref={refHandler} onClick={() => handleSelectEntity(value.id)}>
          {value.children.map((childId: EntityId) => {
            const childEntity = entityBlueprints.find((item) => item.id() === childId)
            if (!childEntity) return null
            return renderEntityNode(childEntity)
          })}
        </group>
      )
    }

    return (
      <mesh
        key={value.id}
        ref={refHandler}
        onClick={() => handleSelectEntity(value.id)}
        scale={isSelected ? 1.05 : 1}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={isSelected ? '#4a90e2' : '#cccccc'} />
      </mesh>
    )
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <div style={{ width: '280px', padding: '20px', borderRight: '1px solid #ccc' }}>
        <div style={{ marginBottom: '16px' }}>
          <button onClick={handleAddChild}>Add Child</button>
          <button onClick={handleRemoveEntity} disabled={!selectedId || selectedId === entityBlueprints[0]?.id()}>Delete Entity</button>
        </div>

        <div style={{ fontWeight: 'bold' }}>Hierarchy</div>
        <div>{entityBlueprints[0] ? renderHierarchy(entityBlueprints[0]) : null}</div>
      </div>

      <div style={{ width: '360px', padding: '20px', borderRight: '1px solid #ccc' }}>
        {statusMessage && <div>{statusMessage}</div>}
        {selectedEntity && selectedValue ? (
          <div>
            <h2>Inspector: {selectedValue.id}</h2>
            <div>
              <label>Type:</label>
              <select
                value={selectedValue.type}
                onChange={(e) => handleEntityTypeChange(e.target.value as EntityBlueprint['type'])}
              >
                <option value="group">Group</option>
                <option value="mesh">Mesh</option>
              </select>
            </div>

            <div>
              <h3>Traits</h3>
              <button onClick={handleTraitAdd}>Add Trait</button>
              {selectedTraits.map(trait => (
                <div key={trait.id} style={{ marginTop: '8px' }}>
                  <div>{trait.name ?? trait.id}</div>
                  <input
                    type="text"
                    value={String(trait.value ?? '')}
                    onChange={(e) => handleTraitValueChange(trait.id, e.target.value)}
                  />
                  <button onClick={() => handleTraitRemove(trait.id)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>Select an entity to inspect.</div>
        )}
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas
          gl={async (props) => {
            const renderer = new THREE.WebGPURenderer(props as any)
            await renderer.init()
            return renderer
          }}
        >
          <PerspectiveCamera makeDefault position={[0, 0, 5]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          {entityBlueprints[0] ? renderEntityNode(entityBlueprints[0]) : null}
          {selectedId !== null && meshRefs.current[selectedId] && (
            <TransformControls
              object={meshRefs.current[selectedId] as THREE.Object3D}
              mode={selectedValue?.type === 'group' ? 'translate' : 'translate'}
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

function createTraitId(): string {
  return `trait_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
