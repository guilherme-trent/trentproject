import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * A progressão mitológica: quais frutos da Yggdrasil já despertaram e o que o
 * jogador trouxe de dentro de cada reino.
 *
 * Regra: um fruto acorrentado só se liberta quando o jogador tem o
 * equipamento que o reino ANTERIOR concede. O primeiro não pede nada além da
 * resposta ao chamado da árvore ("Sim").
 *
 *   fruto 1 (Architecture)  ← o chamado da árvore
 *   fruto 2 (Performance)   ← a Seiva Pura, condensada no fim do fruto 1
 *   fruto 3 (Experience)    ← equipamento concedido ao concluir o fruto 2
 *
 * Persistido no localStorage (só os campos de progressão): quem volta encontra
 * a árvore como a deixou. Fora do navegador (SSR) o persist não tem storage
 * e o estado inicial é o padrão — o mesmo do primeiro frame no cliente.
 */

export type FruitSlot = 1 | 2 | 3;

export const EQUIPMENT = {
  seiva_pura: {
    name: 'Seiva Pura',
    description: 'O caos orquestrado, condensado na essência viva da Yggdrasil. Dissolve as correntes do segundo fruto.',
  },
  title_software_engineer: {
    name: 'Título: Software Engineer',
    description: 'O mesmo nome — mas não está mais em um papel. Está em você.',
  },
  'equipment-y': {
    name: 'Equipamento Y',
    description: 'Forjado no Reino da Performance. Estilhaça as correntes do terceiro fruto.',
  },
} as const;

export type EquipmentId = keyof typeof EQUIPMENT;

/** O que cada fruto exige para quebrar as correntes (`null` = só a vontade). */
export const FRUIT_REQUIREMENT: Record<FruitSlot, EquipmentId | null> = { 1: null, 2: 'seiva_pura', 3: 'equipment-y' };
/** O que concluir cada fruto concede. */
export const FRUIT_REWARD: Record<FruitSlot, EquipmentId | null> = { 1: 'seiva_pura', 2: 'equipment-y', 3: null };

interface ProgressState {
  fruit1Unlocked: boolean;
  fruit2Unlocked: boolean;
  fruit3Unlocked: boolean;
  /** Itens adquiridos dentro das fases, em ordem de aquisição. */
  equipment: EquipmentId[];

  isUnlocked: (fruit: FruitSlot) => boolean;
  /** O jogador pode quebrar as correntes deste fruto agora? */
  canUnlock: (fruit: FruitSlot) => boolean;
  unlockFruit: (fruit: FruitSlot) => void;
  grantEquipment: (item: EquipmentId) => void;
  /** Concluir o reino de um fruto concede o equipamento do próximo. */
  completeFruit: (fruit: FruitSlot) => void;
  reset: () => void;
}

export const PROGRESS_STORAGE_KEY = 'orchestrator-progress';

/** QA: apaga a progressão salva e recomeça a experiência do zero (intro incluída). */
export function resetRitual() {
  useProgressStore.persist.clearStorage();
  window.location.reload();
}

const UNLOCK_KEY = { 1: 'fruit1Unlocked', 2: 'fruit2Unlocked', 3: 'fruit3Unlocked' } as const satisfies Record<FruitSlot, keyof ProgressState>;

const INITIAL = { fruit1Unlocked: false, fruit2Unlocked: false, fruit3Unlocked: false, equipment: [] as EquipmentId[] };

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      isUnlocked: (fruit) => get()[UNLOCK_KEY[fruit]],

      canUnlock: (fruit) => {
        const state = get();
        if (state.isUnlocked(fruit)) return false;
        // Os frutos se abrem em ordem: o anterior precisa estar desperto.
        if (fruit > 1 && !state.isUnlocked((fruit - 1) as FruitSlot)) return false;
        const requirement = FRUIT_REQUIREMENT[fruit];
        return requirement === null || state.equipment.includes(requirement);
      },

      unlockFruit: (fruit) => set((state) => (state[UNLOCK_KEY[fruit]] ? state : { [UNLOCK_KEY[fruit]]: true })),

      grantEquipment: (item) => set((state) => (state.equipment.includes(item) ? state : { equipment: [...state.equipment, item] })),

      completeFruit: (fruit) => {
        const reward = FRUIT_REWARD[fruit];
        if (reward) get().grantEquipment(reward);
      },

      reset: () => set(INITIAL),
    }),
    {
      name: PROGRESS_STORAGE_KEY,
      version: 5,
      // A recompensa do fruto 1 já se chamou 'equipment-x' (v1) e 'prisma_ordem' (v2, v4); desde a v5
      // é a Seiva Pura. Quem a forjou com outro nome a mantém. (Na v3 a chave era o título: quem só
      // tem o título não forjou nada e refaz a Forja.)
      migrate: (persisted) => {
        const state = persisted as { equipment?: string[] };
        if (state.equipment)
          state.equipment = [...new Set(state.equipment.map((id) => (id === 'equipment-x' || id === 'prisma_ordem' ? 'seiva_pura' : id)))];
        return state as ProgressState;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: ({ fruit1Unlocked, fruit2Unlocked, fruit3Unlocked, equipment }) => ({
        fruit1Unlocked,
        fruit2Unlocked,
        fruit3Unlocked,
        equipment,
      }),
    },
  ),
);
