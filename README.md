# The Orchestrator's Canvas

> *"O caos devora os fracos. Você tem a Vontade necessária para orquestrar a ordem?"*

**The Orchestrator's Canvas** é um manifesto interativo em 3D: o portfólio de um
Technical Product Manager contado como uma jornada, não como uma lista de
tópicos. Em vez de ler sobre arquitetura, performance e experiência, você
**atravessa** cada uma delas, direto no navegador, sem instalar nada.

Roda no desktop e no celular, com áudio, e se adapta sozinho ao poder da sua GPU.

### ▶ [Viva a experiência: trentproject.vercel.app](https://trentproject.vercel.app/)

---

## A jornada

### 1. A Ignição
Uma tela preta e um único toque. É ele que acende tudo, inclusive o áudio.

### 2. O Big Bang
Uma explosão inteira escrita num único shader: poeira estelar, ondas de choque
e brasas. É daí que nasce o universo da experiência.

### 3. A Yggdrasil Cósmica
Do feixe do Big Bang brota uma árvore feita de milhares de **linhas do tempo
torcidas**, sobre uma nebulosa viva. A árvore fala com você. Pendurados nos
galhos estão três **Frutos Cósmicos**, acorrentados. Cada um é um pilar do
trabalho de um TPM:

| Fruto | Pilar | Lema | Como você entra |
|:-:|---|---|---|
| 🟢 | **Architecture** | *Estruturas que seguram o caos* | **Tela Trincada**: a própria imagem racha e cai em cacos |
| 🔵 | **Performance** | *Cada milissegundo é uma decisão* | **Mergulho Warp**: a câmera acelera para dentro do fruto |
| 🟡 | **Experience** | *Tecnologia que se sente* | **Engolido**: um tecido líquido cresce e envolve a câmera |

Os frutos se libertam **em ordem**. Cada reino concluído entrega o item que
quebra as correntes do próximo. E o progresso fica salvo: quem volta encontra
a árvore como a deixou.

### 4. O Reino da Arquitetura: a Metrópole
Você pilota por uma cidade que se **constrói e se desconstrói em tempo real**
enquanto o manifesto aparece no caminho. No clímax a realidade dá glitch, a tela
vira vidro e explode contra a câmera em bullet-time, e os cacos viram poeira
digital. Com o ponteiro você orquestra essas partículas até forjar a
**Seiva Pura**, a chave do segundo fruto.

### 5. Performance e Experience
🚧 *Em construção.* As transições de entrada já existem; os reinos estão
chegando nas próximas fases.

---

## O que tem por baixo

Este projeto também é uma vitrine de engenharia: a meta é rodar liso numa GPU
integrada comum, não só numa placa de vídeo dedicada.

- **Qualidade adaptativa em dois níveis.** Primeiro o motor ajusta a resolução
  (DPR) em passos finos e quase imperceptíveis. Só quando isso se esgota ele troca
  de *tier* (`high`/`mid`/`low`), ligando ou desligando bloom, sombras e densidade
  de partículas. A política é assimétrica: cai na hora quando há travada e só
  sobe depois de folga confirmada, com trava contra oscilação.
- **Zero engasgo ao trocar de cena.** Os shaders da próxima cena são compilados
  e os buffers sobem para a GPU *enquanto a cena atual ainda roda*. O
  aquecimento respeita a variante certa de programa (tela vs. render target do
  pós-processamento), que é onde a maioria dos "primeiro frame travado" nasce.
- **Trabalho pesado fora do main thread.** A Yggdrasil (~5 MB de geometria) é
  gerada num **Web Worker** e os dados são *transferidos* em O(1), sem cópia.
- **Memória de GPU sob controle.** Cada cena descarta tudo o que criou ao sair;
  nada da intro sobrevive na VRAM depois que a árvore assume. Recursos
  compartilhados são marcados como persistentes e protegidos da coleta.
- **React fora do loop de render.** As cenas montam uma vez; a cada frame um
  "diretor" em TypeScript puro escreve direto nos uniforms. Nenhum componente
  re-renderiza por frame.
- **Partículas na GPU.** A forja da Seiva Pura simula as partículas com
  GPGPU (`GPUComputationRenderer`).
- **Cenas sob demanda.** Cada cena é um chunk JS separado, baixado só quando
  ela (ou a anterior, via preload em idle) é visitada.
- **Responsividade medida.** O primeiro toque retorna em poucos ms e só monta a
  intro depois do próximo paint (medido com a Long Animation Frames API), para
  manter o INP baixo.

## Stack

[Next.js 16](https://nextjs.org) · [React 19](https://react.dev) ·
[Three.js](https://threejs.org) · [React Three Fiber](https://r3f.docs.pmnd.rs) ·
[drei](https://drei.docs.pmnd.rs) · [postprocessing](https://github.com/pmndrs/postprocessing) ·
[Zustand](https://zustand.docs.pmnd.rs) · [Framer Motion](https://motion.dev) ·
[Tailwind CSS 4](https://tailwindcss.com) · TypeScript · GLSL

## Rodando localmente

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Para testar no celular pela mesma rede Wi-Fi, abra o endereço da sua máquina na
rede (ex.: `http://192.168.1.109:3000`). O projeto já libera as faixas de IP
privadas comuns no `next.config.ts`.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com hot reload |
| `npm run build` | Build de produção (o site inteiro é estático) |
| `npm run start` | Serve o build de produção |
| `npm run lint` | Verificação com ESLint |

## Estrutura

```
src/
├── app/       Entrada do Next.js (layout, página, estilos globais)
├── engine/    O motor: canvas, governador de performance, aquecimento de GPU,
│              coleta de recursos, áudio, stores (Zustand) e registro de cenas
├── scenes/    As cenas: intro (Big Bang), hub (Yggdrasil), reinos e transições
├── shaders/   Blocos GLSL reutilizáveis (noise, simplex, voronoi, feixe de energia)
└── ui/        A camada HTML por cima do 3D: diálogos, HUDs, carregamento
```

Toda cena é declarada primeiro em `src/engine/config/scenes.ts`. Esse manifesto é
a fonte de verdade para o preload, para a limpeza de memória e para a tipagem.

## Deploy

O site é publicado na [Vercel](https://vercel.com) em
[trentproject.vercel.app](https://trentproject.vercel.app/), a partir da branch
`main`: cada push gera um novo deploy automaticamente.
