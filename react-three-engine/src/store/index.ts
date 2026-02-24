/**
 * Provides Koota-based state management for entities, selection, and traits
 */

export { getCustomTraitFactories, setCustomTraitFactories } from './traits';
export {
  engineWorld,
  selectionActions,
  spawnEntityBlueprint,
  updateEntityBlueprint,
  addChild,
  removeChild,
  SelectionStateTrait,
  EntityBlueprintTrait,
  TraitDescriptorTrait,
  ChildOf,
} from './ecs';
