import React, { forwardRef } from 'react'

interface BoxProps {
  position?: [number, number, number]
  size?: [number, number, number]
  color?: string
  onClick?: (event: any) => void
  highlighted?: boolean
}

export const PrimitiveBox: React.ForwardRefExoticComponent<BoxProps & React.RefAttributes<any>> = forwardRef<any, BoxProps>(({ position = [0, 0, 0], size = [1, 1, 1], color = 'orange', onClick, highlighted = false }, ref) => {
  return (
    <mesh ref={ref} position={position} onClick={onClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={highlighted ? '#00ffff' : color} />
    </mesh>
  )
})
