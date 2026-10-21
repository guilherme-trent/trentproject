import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Testes no celular pela rede local: o dev server só aceita pedidos de
   * `localhost` por padrão e bloqueia os assets de desenvolvimento vindos de
   * outra origem (ex.: http://192.168.1.109:3000 aberto no telefone).
   * Faixas privadas comuns de Wi-Fi doméstico.
   */
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  /** Qualidades aceitas pelo next/image: 75 (padrão) e 90 (as telas dos projetos no portfólio, com texto miúdo). */
  images: { qualities: [75, 90] },
};

export default nextConfig;
