import { create } from 'zustand';
import { EQUIPMENT } from '@/engine/store/useProgressStore';

/**
 * A voz da Yggdrasil — o roteiro e o estado do diálogo.
 *
 * Ponte entre a UI HTML (que mostra a fala e os botões) e a cena WebGL (que
 * reage à escolha): a UI publica a escolha aqui; a HubScene assina e age
 * (despertar um fruto, responder). Nenhum dos dois conhece o outro.
 */

export type DialogueAction = 'accept-call' | 'refuse-call';

export interface DialogueChoice {
  label: string;
  action: DialogueAction;
}

export interface DialogueLine {
  id: string;
  /** Rótulo pequeno acima da fala (quem fala / onde). */
  speaker: string;
  text: string;
  choices?: readonly DialogueChoice[];
  /** Falas sem escolha somem sozinhas depois deste tempo (ms). */
  holdMs?: number;
}

export const LINES = {
  call: {
    id: 'call',
    speaker: 'Yggdrasil',
    text: 'O caos devora os fracos. Você tem a Vontade necessária para orquestrar a ordem?',
    choices: [
      { label: 'Sim', action: 'accept-call' },
      { label: 'Não', action: 'refuse-call' },
    ],
  },
  refuse: {
    id: 'refuse',
    speaker: 'Yggdrasil',
    text: 'Então a ordem esperará. Toque o primeiro fruto quando a Vontade despertar.',
    holdMs: 5200,
  },
  awakened: {
    id: 'awakened',
    speaker: 'Yggdrasil',
    text: 'O primeiro fruto despertou. Toque-o, e atravesse.',
    holdMs: 5200,
  },
  'sealed-order': {
    id: 'sealed-order',
    speaker: 'Yggdrasil',
    text: 'Cada fruto amadurece a seu tempo. Desperte o anterior primeiro.',
    holdMs: 4600,
  },
  'sealed-2': {
    id: 'sealed-2',
    speaker: 'Yggdrasil',
    text: `Vontade não basta para estas correntes. Traga a ${EQUIPMENT.seiva_pura.name} do Reino da Arquitetura.`,
    holdMs: 5600,
  },
  'ready-2': {
    id: 'ready-2',
    speaker: 'Yggdrasil',
    text: `A ${EQUIPMENT.seiva_pura.name} pulsa em você. Toque o segundo fruto e dissolva suas correntes.`,
    holdMs: 6200,
  },
  'sealed-3': {
    id: 'sealed-3',
    speaker: 'Yggdrasil',
    text: `Estas correntes só cedem ao ${EQUIPMENT['equipment-y'].name}, forjado no Reino da Performance.`,
    holdMs: 5600,
  },
} as const satisfies Record<string, DialogueLine>;

export type LineId = keyof typeof LINES;

interface DialogueState {
  line: DialogueLine | null;
  /** Última escolha feita (com carimbo, para escolhas repetidas dispararem de novo). */
  choice: { action: DialogueAction; at: number } | null;
  say: (id: LineId) => void;
  choose: (action: DialogueAction) => void;
  dismiss: () => void;
}

export const useHubDialogue = create<DialogueState>()((set) => ({
  line: null,
  choice: null,
  say: (id) => set({ line: LINES[id] }),
  choose: (action) => set({ line: null, choice: { action, at: performance.now() } }),
  dismiss: () => set({ line: null }),
}));
