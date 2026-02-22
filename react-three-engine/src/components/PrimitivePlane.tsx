import React, { forwardRef } from 'react'

interface PlaneProps {
  position?: [number, number, number]
  size?: [number, number]
  color?: string
  onClick?: (event: any) => void
  highlighted?: boolean
}

export const PrimitivePlane: React.ForwardRefExoticComponent<PlaneProps & React.RefAttributes<any>> = forwardRef<any, PlaneProps>(({ position = [0, 0, 0], size = [1, 1], color = 'lightblue', onClick, highlighted = false }, ref) => {
  return (
    <mesh ref={ref} position={position} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={highlighted ? '#00ffff' : color} side={2} />
    </mesh>
  )
})
