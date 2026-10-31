import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Testes no celular pela rede local: o dev server só aceita pedidos de
   * `localhost` por padrão e bloqueia os assets de desenvolvimento vindos de
   * outra origem (ex.: http://192.168.1.109:3000 aberto no telefone).
   * Faixas privadas comuns de Wi-Fi doméstico.
   */
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  /**
   * Imagens servidas como estão, sem o otimizador da Vercel: a cota grátis dele acaba no mês e, a partir
   * daí, toda imagem que ainda não estava no cache volta como 402 (tela em branco no carrossel). Os
   * arquivos já são WebP no tamanho certo (o maior tem ~270 KB), então o otimizador quase não economizava.
   */
  images: { unoptimized: true },
};

export default nextConfig;
