import React, { forwardRef } from 'react'

interface SphereProps {
  position?: [number, number, number]
  radius?: number
  color?: string
  onClick?: (event: any) => void
  highlighted?: boolean
}

export const PrimitiveSphere: React.ForwardRefExoticComponent<SphereProps & React.RefAttributes<any>> = forwardRef<any, SphereProps>(({ position = [0, 0, 0], radius = 1, color = 'hotpink', onClick, highlighted = false }, ref) => {
  return (
    <mesh ref={ref} position={position} onClick={onClick}>
      <sphereGeometry args={[radius, 32, 32]} />
      <meshStandardMaterial color={highlighted ? '#00ffff' : color} />
    </mesh>
  )
})
