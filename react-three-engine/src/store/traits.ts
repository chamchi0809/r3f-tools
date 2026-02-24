import type { TraitDescriptor, TraitId } from './ecs'

export type TraitFactory = () => TraitDescriptor
export type TraitFactoryMap = Record<string, TraitFactory>

let customTraitFactories: TraitFactoryMap = {}

export function setCustomTraitFactories(factories: TraitFactoryMap): void {
  customTraitFactories = { ...factories }
}

export function getCustomTraitFactories(): TraitFactoryMap {
  return { ...customTraitFactories }
}

export function resolveTraitById(traits: Record<TraitId, TraitDescriptor>, traitId: TraitId): TraitDescriptor | undefined {
  return traits[traitId]
}
