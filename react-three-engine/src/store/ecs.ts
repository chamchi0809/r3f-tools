import { createWorld, relation, trait } from 'koota';
import type { Trait as KootaTrait, World, Relation, Entity as KootaEntity } from 'koota';

export type EntityId = number;

export type TraitId = string;
export type TraitValue = unknown;
export type TraitKind = 'threejs' | 'custom';

export interface TraitDescriptor<T = TraitValue> {
  id: TraitId;
  kind: TraitKind;
  name?: string;
  value: T;
}

export interface EntityBlueprint {
  id: EntityId;
  name: string;
  type: 'group' | 'mesh';
  traitIds: TraitId[];
  children: EntityId[];
}

export interface SelectionState {
  selectedId: EntityId | null;
}

export const engineWorld: World = createWorld();

export const SelectionStateTrait: KootaTrait<() => SelectionState> = trait((): SelectionState => ({
  selectedId: null,
}));

export const EntityBlueprintTrait: KootaTrait<() => EntityBlueprint> = trait((): EntityBlueprint => ({
  id: 0,
  name: 'Entity',
  type: 'group',
  traitIds: [],
  children: [],
}));

export const TraitDescriptorTrait: KootaTrait<() => TraitDescriptor> = trait((): TraitDescriptor => ({
  id: 'trait',
  kind: 'custom',
  name: undefined,
  value: undefined,
}));

export const ChildOf: Relation<KootaTrait> = relation();

engineWorld.add(SelectionStateTrait);

export const selectionActions: {
  setSelectedId: (id: EntityId | null) => void;
  clearSelection: () => void;
  isSelected: (id: EntityId) => boolean;
} = {
  setSelectedId: (id: EntityId | null): void => engineWorld.set(SelectionStateTrait, { selectedId: id }),
  clearSelection: (): void => engineWorld.set(SelectionStateTrait, { selectedId: null }),
  isSelected: (id: EntityId): boolean => engineWorld.get(SelectionStateTrait)?.selectedId === id,
};

export function spawnEntityBlueprint(
  blueprint: Omit<EntityBlueprint, 'id'>,
  id?: EntityId,
): KootaEntity {
  const entity = engineWorld.spawn();
  const assignedId = id ?? entity.id();
  entity.add(EntityBlueprintTrait({
    ...blueprint,
    id: assignedId,
  }));
  return entity;
}

export function addChild(parent: KootaEntity, child: KootaEntity): void {
  child.add(ChildOf(parent));
  const parentBlueprint = parent.get(EntityBlueprintTrait);
  if (!parentBlueprint) return;
  parent.set(EntityBlueprintTrait, {
    ...parentBlueprint,
    children: [...parentBlueprint.children, child.id()],
  });
}

export function removeChild(parent: KootaEntity, child: KootaEntity): void {
  child.remove(ChildOf(parent));
  const parentBlueprint = parent.get(EntityBlueprintTrait);
  if (!parentBlueprint) return;
  parent.set(EntityBlueprintTrait, {
    ...parentBlueprint,
    children: parentBlueprint.children.filter((id) => id !== child.id()),
  });
}

export function updateEntityBlueprint(
  entity: KootaEntity,
  update: Partial<Omit<EntityBlueprint, 'id'>>,
): void {
  const current = entity.get(EntityBlueprintTrait);
  if (!current) return;
  entity.set(EntityBlueprintTrait, {
    ...current,
    ...update,
  });
}
