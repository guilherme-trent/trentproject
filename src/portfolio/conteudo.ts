/**
 * Todo o texto do portfólio (a página principal). Editar aqui muda o site; os componentes só desenham.
 * Fonte de verdade dos fatos: ~/Documentos/trent-engine/perfil/ (fatos.md e as vitrines do GitHub).
 * Projetos no formato enxuto: proposta de valor, 3 benefícios, stack numa linha. Nada de roadmap.
 */

export const PESSOA = {
  nome: 'Guilherme Trent',
  cargo: 'Software Engineer · Technical Product Manager',
  frase:
    'Transito entre o código e a gestão: construo o produto e garanto que ele resolva o problema certo, no prazo e com a equipe alinhada.',
  local: 'Brasília, DF · remoto, híbrido ou presencial',
  email: 'trent.guilherme@gmail.com',
  linkedin: 'https://www.linkedin.com/in/guilhermetrent/',
  github: 'https://github.com/guilherme-trent',
  curriculo: '/curriculo-guilherme-trent.pdf',
};

/** O que eu faço, em três frentes. Sem números: a página não envelhece nem depende de um projeto só. */
export const PILARES = [
  { titulo: 'Código', texto: 'Sites, plataformas e aplicativos, do zero à produção.' },
  { titulo: 'Produto', texto: 'Visão de produto e arquitetura para resolver o problema certo.' },
  { titulo: 'Equipe', texto: 'Contratação, capacitação e operação, no prazo e com a equipe alinhada.' },
];

export interface Link {
  rotulo: string;
  href: string;
  /** Link interno do próprio site (abre na mesma aba). */
  interno?: boolean;
}

export interface Imagem {
  src: string;
  alt: string;
  legenda?: string;
}

export interface Projeto {
  id: string;
  nome: string;
  selo: string;
  proposta: string;
  beneficios: { titulo: string; texto: string }[];
  stack: string;
  /** A capa. Nas fichas de projeto, `legenda` aparece sobre a foto no carrossel. */
  imagem: Imagem;
  /** Mais telas do projeto, depois da capa: viram o carrossel da ficha. */
  galeria?: Imagem[];
  links: Link[];
}

export const DESTAQUE: Projeto = {
  id: 'orchestrator',
  nome: 'The Orchestrator',
  selo: 'experiência interativa em 3D',
  proposta:
    'Um portfólio contado como jornada: você atravessa arquitetura, desempenho e experiência em vez de ler sobre eles.',
  beneficios: [
    { titulo: 'Roda bem até em placa de vídeo integrada.', texto: 'A qualidade se ajusta sozinha, em tempo real, ao aparelho de quem visita.' },
    { titulo: 'Sem travar entre as cenas.', texto: 'A próxima cena é preparada enquanto a atual ainda roda.' },
    { titulo: 'Motor próprio, o Regente.', texto: 'Conduz as cenas, o tempo, a qualidade e a memória.' },
  ],
  stack: 'Next.js · React Three Fiber · Three.js · GLSL · Web Workers',
  imagem: { src: '/portfolio/arvore-capa.webp', alt: 'A Yggdrasil cósmica, a árvore de fios de luz da experiência The Orchestrator' },
  links: [
    { rotulo: 'Entrar na experiência', href: '/experiencia', interno: true },
    { rotulo: 'Código', href: 'https://github.com/guilherme-trent/trentproject' },
  ],
};

export const PROJETOS: Projeto[] = [
  {
    id: 'gamifica',
    nome: 'Gamifica · Dashboard Educacional',
    selo: 'em produção',
    proposta:
      'O registro oficial de inscrições e atendimentos de um projeto de educação tecnológica em escolas públicas do DF.',
    beneficios: [
      { titulo: 'Mais de 15 mil atendimentos registrados,', texto: 'usado pela equipe todos os dias.' },
      { titulo: 'Listas de presença lidas por foto com IA,', texto: 'com conferência automática do CPF antes de entrar no registro.' },
      { titulo: 'Dados de alunos protegidos no próprio banco:', texto: 'cada perfil vê só o que pode, como pede a LGPD.' },
    ],
    stack: 'React · TypeScript · Supabase / PostgreSQL · Vercel · API da Anthropic',
    imagem: { src: '/portfolio/gamifica.webp', alt: 'Visão geral do Dashboard do Gamifica: alunos, atendimentos, volume por trilha e atendimentos por região (dados fictícios)', legenda: 'Visão geral' },
    galeria: [
      { src: '/portfolio/gamifica/02.webp', alt: 'Lista de alunos com as 7 trilhas de cada um (dados fictícios)', legenda: 'Alunos' },
      { src: '/portfolio/gamifica/03.webp', alt: 'Ficha do aluno com a presença nas trilhas e os dados pessoais ocultos (dados fictícios)', legenda: 'Ficha do aluno' },
      { src: '/portfolio/gamifica/04.webp', alt: 'Envio da equipe em revisão, com aprovar, mudar local e rejeitar (dados fictícios)', legenda: 'Revisão e aprovação' },
      { src: '/portfolio/gamifica/05.webp', alt: 'Importação por foto: a equipe escolhe região, local e turma e fotografa a lista de presença', legenda: 'Importação por foto' },
    ],
    links: [{ rotulo: 'Ver o projeto', href: 'https://github.com/guilherme-trent/dashboard-gamifica' }],
  },
  {
    id: 'sunvoid',
    nome: 'SUNVOID',
    selo: 'em produção',
    proposta:
      'A plataforma da comunidade brasileira de Zenless Zone Zero: builds, tier list, times, guias e notícias num só lugar.',
    beneficios: [
      { titulo: 'Entra com a conta do Discord,', texto: 'e site e servidor conversam: cargos, avisos e notícias chegam sozinhos.' },
      { titulo: 'Tier list com o cálculo aberto:', texto: 'cada nota de 0 a 100 mostra de onde veio.' },
      { titulo: 'Painel para a equipe,', texto: 'com papéis, revisão e histórico de cada alteração.' },
    ],
    stack: 'Next.js · TypeScript · Neon / PostgreSQL · Better Auth · Cloudflare R2 · Vercel',
    imagem: { src: '/portfolio/sunvoid/noticias.webp', alt: 'Notícias do jogo reunidas num lugar só, e os criadores parceiros numa aba', legenda: 'Notícias' },
    galeria: [
      { src: '/portfolio/sunvoid/ofertas.webp', alt: 'Ofertas de jogos: grátis para resgatar e promoções escolhidas pela equipe', legenda: 'Ofertas' },
      { src: '/portfolio/sunvoid/apoie.webp', alt: 'Página de apoio: Pix pelo Mercado Pago, com cargos no Discord entregues sozinhos', legenda: 'Apoio com Pix' },
      { src: '/portfolio/sunvoid/builds.webp', alt: 'Build verificada do Lighter: discos, motores-W e atributos principais', legenda: 'Builds verificadas' },
      { src: '/portfolio/sunvoid/selecao.webp', alt: 'A seleção de agentes de SUNVOID no tema escuro, com o Pan Yinhu selecionado: retrato grande à esquerda e a grade de ícones à direita', legenda: 'Seleção de agentes' },
    ],
    // O código é privado: o projeto aponta para a vitrine.
    links: [
      { rotulo: 'Ver o site', href: 'https://sunvoid.com.br' },
      { rotulo: 'Ver o projeto', href: 'https://github.com/guilherme-trent/sunvoid' },
    ],
  },
  {
    id: 'vault',
    nome: 'Vault Project',
    selo: 'em desenvolvimento',
    proposta: 'Estúdio de personagens com IA para criadores de conteúdo.',
    beneficios: [
      { titulo: 'O mesmo personagem hiper-realista em todos os vídeos:', texto: 'ele vira a sua marca.' },
      { titulo: 'Três formas de fazer vídeo:', texto: 'grave você, colabore com convidados ou recrie uma trend.' },
      { titulo: 'Publique com tranquilidade:', texto: 'consentimento e direitos de imagem já vêm embutidos.' },
    ],
    stack: 'Node.js · TypeScript · Fastify · PostgreSQL · AWS · Pix',
    imagem: { src: '/portfolio/vault.webp', alt: 'Tela de novo vídeo do Vault Project, com os três modos: Grave você, Colaboração e Recriar trend', legenda: 'Novo vídeo' },
    galeria: [
      { src: '/portfolio/vault/02.webp', alt: 'Personagens: cada um nasce com 4 imagens de referência, com o mesmo rosto em todos os ângulos', legenda: 'Personagens' },
      { src: '/portfolio/vault/03.webp', alt: 'Fila de vídeos: a etapa de cada um, e um vídeo barrado pela proteção de consentimento, sem cobrança', legenda: 'Fila' },
      { src: '/portfolio/vault/04.webp', alt: 'Créditos: pacotes comprados por Pix e o extrato completo', legenda: 'Créditos' },
      { src: '/portfolio/vault/05.webp', alt: 'O que o convidado vê: lê o termo, tira a selfie e autoriza, sem precisar de conta', legenda: 'Convite do colaborador' },
    ],
    links: [{ rotulo: 'Ver o projeto', href: 'https://github.com/guilherme-trent/vault-project' }],
  },
  {
    id: 'cotton',
    nome: 'Cotton Project',
    selo: 'em desenvolvimento',
    proposta: 'O escritório do MEI na palma da mão.',
    beneficios: [
      { titulo: 'Contratos profissionais em poucos toques,', texto: 'de serviço ou de venda, prontos para enviar.' },
      { titulo: 'Vendas, clientes e estoque', texto: 'num só lugar.' },
      { titulo: 'Estatísticas claras', texto: 'de como o negócio está indo.' },
    ],
    stack: 'React Native (Expo) · TypeScript · Supabase',
    imagem: { src: '/portfolio/cotton.webp', alt: 'Três telas do aplicativo Cotton Project: itens de uma operação, faturamento com mapa de operações e clientes (dados fictícios)', legenda: 'Faturamento e clientes' },
    galeria: [
      { src: '/portfolio/cotton/02.webp', alt: 'Três telas do Cotton Project: painel, estatísticas e inventário (dados fictícios)', legenda: 'Painel e estatísticas' },
      { src: '/portfolio/cotton/03.webp', alt: 'Três telas de uma operação: cliente, fechamento com pagamento e perfil do negócio (dados fictícios)', legenda: 'Do cliente ao fechamento' },
      { src: '/portfolio/cotton/04.webp', alt: 'Os documentos que o app gera: contrato de prestação de serviços, recibo e relatório (dados fictícios)', legenda: 'Documentos gerados' },
    ],
    links: [{ rotulo: 'Ver o projeto', href: 'https://github.com/guilherme-trent/cotton-project' }],
  },
  {
    id: 'duelo',
    nome: 'Duelo AFK',
    selo: 'o jogo que acendeu a faísca',
    proposta:
      'Um duelo por turnos para 2 jogadores, feito em Python puro. Foi este jogo que me levou a dar aulas de desenvolvimento de jogos no Gamifica.',
    beneficios: [
      { titulo: '9 armas com personalidade,', texto: 'equilibradas por um simulador próprio.' },
      { titulo: 'O mesmo motor em Python no navegador:', texto: 'a versão web roda o código original, sem reescrever as regras.' },
      { titulo: 'Contra o computador, a dois no mesmo aparelho ou online.', texto: '' },
    ],
    stack: 'Python · Pyodide · JavaScript',
    imagem: { src: '/portfolio/duelo.webp', alt: 'O Duelo AFK no navegador: o terminal de combate narra o duelo, com a vida dos dois duelistas embaixo', legenda: 'Combate' },
    galeria: [
      { src: '/portfolio/duelo/menu.webp', alt: 'Menu do Duelo AFK: contra o computador, a dois, demonstração, como jogar e ranking', legenda: 'Menu' },
      { src: '/portfolio/duelo/armas.webp', alt: 'Escolha entre as 9 armas, cada uma com o seu dano e o seu efeito', legenda: '9 armas' },
      { src: '/portfolio/duelo/loja.webp', alt: 'A loja entre os duelos: forja, armadura, runas, poções e bomba de fumaça', legenda: 'Loja' },
    ],
    // Quando a V3 for publicada, entra o botão "Jogar" (o jogo abre dentro do site, em /duelo).
    links: [{ rotulo: 'Código', href: 'https://github.com/guilherme-trent/Game-PVP' }],
  },
];

/**
 * A ficha cifrada: o produto da Atomtech, sob acordo de confidencialidade. Nome, benefícios e stack não
 * existem nem no código: a página desenha símbolos que se embaralham sem parar e nunca se decifram.
 * `posicao` é onde ela entra na grade (fecha os pares no PC).
 */
export const CONFIDENCIAL = {
  selo: 'confidencial',
  posicao: 4,
  proposta:
    'Produto da Atomtech Energia Solar e Tecnologia, em que lidero produto e programação. Está sob acordo de confidencialidade, então a ficha fica cifrada.',
  /** Tamanho (em símbolos) de cada linha tarjada. */
  linhas: [34, 27, 31],
};

export const EXPERIENCIA = [
  {
    cargo: 'Coordenador',
    onde: 'Gamifica Tecnologia em Jogos · IBRES e Secretaria de Ciência, Tecnologia e Inovação do DF',
    quando: 'dez/2025 até hoje',
    texto: 'Equipes, logística, eventos e campeonatos de esports, contratação de mais de 50 profissionais, capacitação da equipe e os sistemas do projeto.',
  },
  {
    cargo: 'Parceiro de tecnologia',
    onde: 'Atomtech Energia Solar e Tecnologia',
    quando: 'mar/2026 até hoje',
    texto: 'Liderança de produto e de programação. Produto sob acordo de confidencialidade.',
  },
  {
    cargo: 'Professor de Desenvolvimento de Jogos',
    onde: 'Gamifica',
    quando: 'jan/2025 a nov/2025',
    texto: 'Curso completo de Unity 2D com C#, com planos de aula, materiais e videoaulas próprios. Campus Party 2025.',
  },
  {
    cargo: 'Engenheiro de Software',
    onde: 'Autônomo (MEI)',
    quando: '2022 até hoje',
    texto: 'Sites, plataformas e aplicativos para clientes.',
  },
  {
    cargo: 'Jovem Aprendiz e Estagiário',
    onde: 'Banco BRB',
    quando: '2020 a 2022',
    texto: 'Atendimento a Pessoa Jurídica e sistemas bancários internos.',
  },
];

export const CURIOSIDADE =
  'Mais de 3.000 TV Boxes apreendidas pela Receita Federal convertidas em minicomputadores Linux para escolas públicas.';

export const FORMACAO = [
  { curso: 'Tecnólogo em Análise e Desenvolvimento de Sistemas', onde: 'IESB', quando: '2023' },
  { curso: 'Pós em Arquitetura e Projetos de Cloud Computing', onde: 'Gran Faculdade', quando: 'em andamento' },
  { curso: 'Pós em Governança de TI', onde: 'Gran Faculdade', quando: 'em andamento' },
  { curso: 'Google Project Management', onde: 'Coursera', quando: 'em andamento' },
];

export const FERRAMENTAS = [
  'TypeScript', 'JavaScript', 'Python', 'C#',
  'React', 'Next.js', 'React Native', 'Node.js',
  'PostgreSQL', 'Supabase', 'Firebase',
  'Three.js e shaders', 'Vercel', 'GitHub Actions', 'APIs de IA',
];

/** O laboratório: experimentos que moram no site, fora da lista de projetos. */
export const LABORATORIO = {
  cidade: {
    nome: 'Cidade Neon',
    selo: 'experimento · parallax em canvas 2D',
    proposta:
      'Uma cidade viva, desenhada só com canvas 2D: role a página e a câmera desce das nuvens até perto da rua, com sete camadas de prédios em profundidade.',
    stack: 'Canvas 2D · TypeScript · React · sem bibliotecas',
    href: '/cidade',
    /** O "como foi feita", no fim da descida. */
    bastidores: [
      {
        titulo: 'Sete camadas, uma câmera.',
        texto: 'Cada camada sobe numa velocidade proporcional à sua proximidade, a mesma conta de uma câmera de verdade. Ao rolar, a câmera desce 300 m; os anéis da torre passam a ser vistos por baixo.',
      },
      {
        titulo: 'Desenhada uma vez, carimbada sempre.',
        texto: 'Prédios, janelas e letreiros são desenhados uma única vez, fora da tela. A cada quadro, só se desenha o que vive: 33 veículos, o trem, a chuva, os letreiros que falham.',
      },
      {
        titulo: 'Descarte de oclusão.',
        texto: 'Como nos motores de jogo: antes de pintar, a cidade calcula da frente para trás o que cada camada esconde, e as de trás só são pintadas onde aparecem. Numa placa de vídeo integrada, a taxa subiu de 40 para cerca de 55 quadros por segundo.',
      },
      {
        titulo: 'Rede de segurança.',
        texto: 'Se o aparelho não segura 48 quadros por segundo, a cidade tira primeiro o que menos se nota e, se ainda precisar, desenha com menos pixels. Fora da tela, ela para.',
      },
    ],
  },
};
