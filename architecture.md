# Manga Translator MVP - Documento de Arquitetura

**Autor:** Manus AI
**Data:** 17 de Março de 2026
**Status:** Proposta de Arquitetura

---

## 1. Visão Geral do Problema

Leitores de mangá, manhwa e webtoon que falam português brasileiro enfrentam uma barreira significativa: a maioria dos títulos disponíveis em plataformas internacionais como o QToon está publicada apenas em inglês (ou coreano/japonês). As traduções para PT-BR, quando existem, dependem de grupos de scanlation que operam de forma descentralizada, com atrasos e cobertura limitada.

A proposta é criar uma **aplicação wrapper** que permita ao usuário colar a URL ou ID de um mangá do QToon e ler o conteúdo automaticamente traduzido para PT-BR, com o texto traduzido renderizado diretamente sobre as imagens originais.

---

## 2. Análise Técnica do QToon.com

### 2.1 Descobertas da Engenharia Reversa

A análise do site revelou que o QToon é construído com **Nuxt.js** (Vue SSR) e expõe dados ricos no client-side via o objeto `window.__NUXT__`. A tabela abaixo resume os endpoints e estruturas identificados:

| Recurso | Padrão de URL / Dados | Descrição |
|---|---|---|
| Página de detalhes | `https://qtoon.com/detail/{csid}` | Lista de capítulos, metadados do mangá |
| Página de leitura | `https://qtoon.com/reader/{csid}?chapter={esid}` | Renderiza as imagens do capítulo |
| Dados SSR | `window.__NUXT__.data` | Contém comic detail, episodes, resource group |
| CDN de imagens | `https://resource.qqtoon.com/resource/{hash}{index}.png` | Imagens dos painéis (publicamente acessíveis) |
| CDN de imagens (origin) | `https://resource.qqtoon.com/origin/{hash}.webp` | Imagens de capa/primeiro painel |

### 2.2 Estrutura de Dados Identificada

O objeto `__NUXT__` contém chaves de API internas que revelam toda a hierarquia de dados:

**Comic Detail** (`/api/w/comic/detail?csid={csid}`):

```
comic.csid          → ID único do mangá (ex: "c_4WzxXL3Kw514HBOAuzHvo")
comic.title         → Título (ex: "Merry Psycho")
comic.author        → Autor
comic.tags[]        → Gêneros
comic.total         → Total de episódios
comic.serialStatus  → Status (SERIALIZING, COMPLETED)
episodes[]          → Lista de episódios com esid, title, permissionFlag, coinLock, adLock
```

**Episode/Resource Group** (`/api/w/resource/group/rslv?token={token}&page=1`):

```
resources[].url     → URL pública da imagem no CDN
resources[].width   → Largura (tipicamente 800px)
resources[].height  → Altura (tipicamente 2174px, formato long-strip)
resources[].rgIdx   → Índice sequencial da imagem
resources[].esid    → ID do episódio
```

### 2.3 Acessibilidade das Imagens

As imagens hospedadas em `resource.qqtoon.com` são **publicamente acessíveis** sem autenticação. O teste via `curl` retornou HTTP 200 com headers de cache do Cloudflare. Isso significa que podemos fazer proxy ou download direto das imagens no backend sem necessidade de cookies ou tokens de sessão, **pelo menos para capítulos gratuitos**.

| Aspecto | Status |
|---|---|
| Imagens de capítulos gratuitos | Acessíveis diretamente via URL |
| Imagens de capítulos pagos (coinLock) | Provavelmente restritas ou com token temporário |
| Formato das imagens | WebP (via query param `x-oss-process`) |
| CDN | Cloudflare (cache HIT frequente) |
| CORS | Não testado, mas irrelevante se proxy via backend |

---

## 3. Arquitetura Proposta para o MVP

### 3.1 Visão Macro

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIO                                 │
│  Cola URL/ID do mangá → Seleciona capítulo → Lê traduzido      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React/Vue)                       │
│  - Input de URL/ID                                              │
│  - Seletor de capítulo                                          │
│  - Viewer de imagens (scroll vertical, long-strip)              │
│  - Toggle original/traduzido                                    │
│  - Indicador de progresso da tradução                           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js/Express)                  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Scraper      │  │  Tradutor    │  │  Cache/DB             │ │
│  │  Module       │  │  Module      │  │                       │ │
│  │              │  │              │  │  - Traduções prontas  │ │
│  │  - Cheerio    │  │  - Gemini    │  │  - Metadados de mangá│ │
│  │  - Puppeteer  │  │    Vision    │  │  - URLs de imagens   │ │
│  │  - Extrai     │  │  - Canvas    │  │                       │ │
│  │    __NUXT__   │  │    overlay   │  │  (SQLite/PostgreSQL)  │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  QToon CDN   │ │  Gemini API  │ │  S3/Storage  │
     │  (imagens)   │ │  (tradução)  │ │  (cache img) │
     └──────────────┘ └──────────────┘ └──────────────┘
```

### 3.2 Fluxo Principal (Happy Path)

O fluxo de uso do MVP segue uma sequência linear e previsível:

**Passo 1 - Input:** O usuário cola uma URL do QToon (ex: `https://qtoon.com/detail/c_4WzxXL3Kw514HBOAuzHvo`) ou apenas o ID (`c_4WzxXL3Kw514HBOAuzHvo`). O frontend extrai o `csid` via regex.

**Passo 2 - Fetch de Metadados:** O backend faz scraping da página de detalhes do QToon (via fetch + parse do HTML SSR com Cheerio) e extrai o objeto `__NUXT__` para obter a lista de episódios, título, capa e metadados.

**Passo 3 - Seleção de Capítulo:** O frontend exibe a lista de capítulos. O usuário seleciona um. O backend então navega para a página do reader e extrai as URLs das imagens do `__NUXT__` (array `resources`).

**Passo 4 - Tradução:** Para cada imagem do capítulo, o backend envia a imagem para a **API do Gemini 2.5 Flash** (visão) e recebe o texto traduzido com posições aproximadas.

**Passo 5 - Renderização:** O frontend exibe as imagens traduzidas em formato long-strip (scroll vertical), com opção de alternar para o original.

### 3.3 Componentes do Backend

#### 3.3.1 Scraper Module

Responsável por extrair dados do QToon. Duas abordagens possíveis:

| Abordagem | Prós | Contras |
|---|---|---|
| **HTTP fetch + Cheerio** | Leve, rápido, sem dependências pesadas | Nuxt SSR embute dados no HTML como `<script>`, pode ser parseado com regex/cheerio, mas é frágil |
| **Puppeteer (headless browser)** | Executa JS, acessa `__NUXT__` diretamente, mais confiável | Pesado (~300MB), lento (~2-5s por página), consome RAM |

**Recomendação para MVP:** Começar com **HTTP fetch + Cheerio** para extrair o `<script>` que contém `window.__NUXT__` do HTML renderizado pelo servidor. Se o QToon renderizar os dados no SSR (o que parece ser o caso), não precisamos de um browser headless. Fallback para Puppeteer se necessário.

#### 3.3.2 Tradutor Module (Gemini Vision)

Este é o coração da aplicação. O pipeline de tradução de cada imagem segue estas etapas:

```
Imagem Original (URL do QToon CDN)
      │
      ▼
┌─────────────────────┐
│  Gemini 2.5 Flash   │  Envia imagem + prompt
│  (Vision API)       │  → Extrai texto EN dos balões
│                     │  → Traduz para PT-BR
│                     │  → Retorna posições aproximadas
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Overlay Engine     │  Renderiza texto PT-BR sobre
│  (HTML/CSS ou       │  a imagem original
│   Canvas server)    │
└──────────┬──────────┘
           │
           ▼
     Imagem Traduzida
```

A grande vantagem do Gemini é que ele faz **OCR + tradução em uma única chamada**, eliminando a necessidade de um pipeline multi-etapa com ferramentas separadas.

**Exemplo de chamada à API do Gemini:**

```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function translateMangaPanel(imageUrl) {
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/webp",
              data: base64Image,
            },
          },
          {
            text: `Analise esta imagem de mangá/webtoon.
Para cada balão de fala ou texto visível em inglês:
1. Extraia o texto original em inglês
2. Traduza para português brasileiro (natural, coloquial)
3. Indique a posição aproximada (ex: "topo-centro", "meio-direita")

Retorne APENAS um JSON válido, sem markdown:
[
  {
    "original": "texto em inglês",
    "translated": "texto em português",
    "position": "descrição da posição",
    "type": "bubble|sfx|narration"
  }
]

Se não houver texto, retorne [].`,
          },
        ],
      },
    ],
  });

  return JSON.parse(response.text);
}
```

#### 3.3.3 Cache/DB

Traduções são operações que consomem tempo (2-5s por imagem). O cache é essencial para performance e economia:

```
Chave de cache: hash(csid + esid + image_index + target_lang)
Valor: texto extraído + texto traduzido + overlay_data (JSON)
```

Se outro usuário pedir o mesmo capítulo, a tradução já está pronta e é servida instantaneamente.

---

## 4. Por Que Gemini? Análise Comparativa de LLMs

### 4.1 Comparativo de Preços (Março 2026)

A tabela abaixo compara os modelos viáveis para o pipeline de tradução de mangá (todos suportam input de imagem):

| Modelo | Input / 1M tokens | Output / 1M tokens | Free Tier | Suporte a Visão |
|---|---|---|---|---|
| **Gemini 2.5 Flash** | $0.30 | $2.50 | **Sim, gratuito** | Sim |
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | **Sim, gratuito** | Sim |
| Gemini 3 Flash Preview | $0.50 | $3.00 | **Sim, gratuito** | Sim |
| Gemini 3.1 Flash-Lite Preview | $0.25 | $1.50 | **Sim, gratuito** | Sim |
| GPT-4.1-mini (OpenAI) | $0.40 | $1.60 | Não | Sim |
| GPT-4.1-nano (OpenAI) | $0.10 | $0.40 | Não | Sim |
| GPT-4o-mini (OpenAI) | $0.15 | $0.60 | Não | Sim |

Fonte: [Gemini API Pricing][1] e [OpenAI API Pricing][2]

### 4.2 Free Tier do Gemini - O Diferencial

O Google oferece um **free tier generoso** para a API do Gemini que não exige cartão de crédito, apenas uma conta Google [1]. Os limites do free tier são:

| Modelo | Requests por Dia (RPD) | Tokens por Minuto (TPM) |
|---|---|---|
| Gemini 2.5 Flash | ~500 | 250.000 |
| Gemini 2.5 Flash-Lite | ~1.000 | 250.000 |
| Gemini 3 Flash Preview | ~500 | 250.000 |

Com **500 RPD no Gemini 2.5 Flash**, é possível traduzir aproximadamente **16 capítulos por dia** (30 imagens cada) sem gastar absolutamente nada. Para uso pessoal ou um MVP em fase de validação, isso é mais que suficiente.

> **Nota importante:** No free tier, o Google pode usar o conteúdo das requisições para melhorar seus produtos [1]. No tier pago, esse uso é desativado.

### 4.3 Custo Estimado por Capítulo

Cada imagem de mangá consome aproximadamente ~1.000 tokens de input (imagem codificada) e ~200-400 tokens de output (JSON com texto traduzido). Para um capítulo típico com ~30 imagens:

| Cenário | Modelo | Custo por Capítulo | Custo por 100 Capítulos |
|---|---|---|---|
| **MVP (free tier)** | Gemini 2.5 Flash | **$0.00** | **$0.00** |
| **MVP (free tier)** | Gemini 2.5 Flash-Lite | **$0.00** | **$0.00** |
| Produção (pago) | Gemini 2.5 Flash-Lite | ~$0.015 | ~$1.50 |
| Produção (pago) | Gemini 2.5 Flash | ~$0.03 | ~$3.00 |
| Alternativa (pago) | GPT-4.1-mini | ~$0.06 | ~$6.00 |

Com apenas **$5 no tier pago do Gemini Flash-Lite**, seria possível traduzir mais de **3.000 capítulos**. Comparado ao OpenAI, onde os mesmos $5 renderiam ~830 capítulos com GPT-4.1-mini.

### 4.4 Qualidade: Gemini vs GPT para OCR de Mangá

Ambos os modelos são capazes de extrair texto de balões de fala em imagens de mangá com alta precisão. As diferenças práticas são sutis:

| Critério | Gemini 2.5 Flash | GPT-4.1-mini |
|---|---|---|
| OCR de texto em inglês | Excelente | Excelente |
| Tradução EN→PT-BR | Muito boa | Muito boa |
| Detecção de SFX (onomatopeias) | Boa | Boa |
| Retorno de coordenadas | Aproximado (ambos) | Aproximado (ambos) |
| Velocidade de resposta | ~2-4s por imagem | ~2-5s por imagem |
| Consistência de formato JSON | Boa (pode precisar de retry) | Boa (pode precisar de retry) |

Nenhum dos dois retorna bounding boxes pixel-perfect, o que é uma limitação compartilhada. Para overlay preciso, seria necessário combinar com OCR dedicado (Tesseract, Google Vision) em uma evolução futura.

### 4.5 Recomendação Final

| Fase do Projeto | Modelo Recomendado | Justificativa |
|---|---|---|
| **MVP / Validação** | Gemini 2.5 Flash (free tier) | Zero custo, qualidade suficiente, sem cartão de crédito |
| **Crescimento inicial** | Gemini 2.5 Flash-Lite (pago) | Mais barato possível, alto volume |
| **Produção com qualidade** | Gemini 2.5 Flash (pago) | Melhor equilíbrio qualidade/custo |
| **Fallback / Comparação** | GPT-4.1-mini | Se a qualidade do Gemini não atender |

---

## 5. Estratégias Alternativas de Tradução

Embora o Gemini Vision seja a recomendação principal, vale documentar as alternativas para evolução futura:

### 5.1 Abordagem A: LLM Multimodal (Recomendada)

> Enviar a imagem inteira para o Gemini 2.5 Flash e pedir que ele extraia o texto, traduza, e retorne as posições.

Esta é a abordagem mais simples e eficiente para o MVP. Uma única chamada de API resolve OCR + tradução. A limitação é que coordenadas de texto são aproximadas, não pixel-perfect.

### 5.2 Abordagem B: OCR Dedicado + LLM para Tradução

> Usar uma engine de OCR (Tesseract, Google Vision, PaddleOCR) para extrair texto com bounding boxes, depois traduzir via Gemini.

O Google Cloud Vision API [3] retorna bounding boxes precisos e custa ~$1.50 por 1.000 imagens. Combinado com o Gemini para tradução, oferece overlay mais preciso, mas adiciona complexidade e um segundo serviço externo.

### 5.3 Abordagem C: manga-image-translator (Open Source)

> Usar o projeto open-source manga-image-translator [4] que já resolve o pipeline completo: detecção de texto, OCR, tradução, inpainting e renderização.

Esta é a solução mais completa em termos de qualidade visual (inclui inpainting para remover texto original), mas requer infraestrutura com GPU para rodar localmente. É a melhor opção para evolução de longo prazo.

---

## 6. Estratégia de Overlay do Texto Traduzido

### 6.1 Opção 1: Painel Lateral de Texto (Recomendada para MVP)

Exibir a imagem original ao lado de uma coluna com o texto traduzido, sincronizado por posição de scroll. Não altera a imagem, é simples de implementar e sempre funciona corretamente.

### 6.2 Opção 2: Overlay via HTML/CSS

Posicionar `<div>` com o texto traduzido sobre a imagem usando CSS `position: absolute`. O Gemini retorna posições aproximadas que mapeamos para coordenadas relativas. Rápido e editável, mas o posicionamento pode ser impreciso.

### 6.3 Opção 3: Canvas Server-Side (Sharp/Canvas)

Usar a biblioteca `sharp` (Node.js) ou `node-canvas` para pintar retângulos brancos sobre os balões originais e renderizar o texto traduzido por cima, gerando uma nova imagem. Resultado visual limpo, mas requer bounding boxes precisos.

### 6.4 Recomendação

Para o MVP, combinar as opções 1 e 2: exibir a imagem original com um **painel lateral de texto traduzido** (sempre funcional) e, opcionalmente, tentar o overlay HTML/CSS para uma experiência mais imersiva. O usuário pode alternar entre os modos.

---

## 7. Gaps e Riscos Identificados

### 7.1 Gaps Técnicos

| Gap | Severidade | Mitigação |
|---|---|---|
| **Scraping frágil** - O QToon pode mudar a estrutura do `__NUXT__` a qualquer momento | Alta | Monitoramento + testes automatizados + fallback para Puppeteer |
| **Capítulos pagos** - Imagens com `coinLock` ou `adLock` podem não ser acessíveis | Alta | Limitar MVP a capítulos gratuitos; informar o usuário |
| **Rate limiting do Gemini** - Free tier tem limite de ~500 RPD | Média | Cache agressivo; se necessário, ativar billing ($0.10/1M tokens) |
| **Rate limiting do QToon** - O CDN pode bloquear requests em massa | Média | Implementar delays entre requests, cache agressivo, respeitar headers |
| **CORS** - Se o frontend tentar carregar imagens diretamente do qqtoon.com | Média | Proxy todas as imagens via backend |
| **Qualidade do overlay** - Posicionamento impreciso do texto traduzido | Média | Começar com painel lateral; evoluir para overlay com OCR dedicado |
| **Texto em coreano/japonês** - Alguns mangás têm SFX no idioma original | Baixa | Ignorar no MVP; futuramente detectar e traduzir |
| **Consistência do JSON** - Gemini pode retornar JSON malformado ocasionalmente | Baixa | Validação + retry automático (máx. 2 tentativas) |

### 7.2 Gaps Legais e Éticos

| Aspecto | Consideração |
|---|---|
| **Termos de Serviço** | Scraping do QToon provavelmente viola os ToS. O projeto deve ser tratado como ferramenta pessoal/educacional. |
| **Direitos autorais** | As imagens são propriedade dos autores/editoras. Redistribuir imagens (mesmo traduzidas) é legalmente questionável. |
| **Uso justo** | A tradução para uso pessoal pode ser argumentada como fair use em algumas jurisdições, mas não é garantido. |
| **Mitigação** | Não hospedar imagens permanentemente; funcionar como proxy em tempo real; não permitir download em massa. |
| **Free tier do Gemini** | No free tier, o Google usa os dados para melhorar produtos. Evitar enviar dados sensíveis. Para mangás públicos, isso não é um problema. |

### 7.3 Gaps de Produto

| Gap | Impacto |
|---|---|
| Sem suporte a outros sites além do QToon | Limita o público-alvo |
| Sem modo offline | Usuários não podem ler sem internet |
| Sem personalização de tradução (formalidade, gírias) | Tradução genérica pode não agradar todos |
| Sem sistema de feedback/correção de tradução | Erros de tradução ficam sem correção |

---

## 8. Possibilidades de Evolução

### 8.1 Curto Prazo (MVP → v1.0)

**Multi-source support:** Abstrair o scraper em uma interface que permita adicionar novos sites facilmente. Cada "source" implementa um adapter:

```typescript
interface MangaSource {
  name: string;
  parseUrl(url: string): { comicId: string };
  getComicDetail(comicId: string): Promise<ComicDetail>;
  getChapterImages(episodeId: string): Promise<ImageUrl[]>;
}

class QToonSource implements MangaSource { ... }
class WebtoonSource implements MangaSource { ... }  // futuro
class MangaDexSource implements MangaSource { ... }  // futuro
```

**Cache inteligente:** Se 10 usuários lerem o mesmo capítulo, a tradução é feita apenas uma vez. Com um banco de dados de traduções, o custo marginal por usuário tende a zero.

**Qualidade de overlay progressiva:** Começar com texto lateral, evoluir para overlay HTML, depois para inpainting com Canvas/Sharp.

### 8.2 Médio Prazo (v1.0 → v2.0)

**Tradução colaborativa:** Permitir que usuários corrijam traduções automáticas, criando um dataset de traduções revisadas que melhora o sistema ao longo do tempo.

**Múltiplos idiomas:** Expandir além de PT-BR para ES, FR, DE, etc. O pipeline de tradução via Gemini já suporta isso nativamente.

**Extensão de navegador:** Um userscript ou extensão Chrome que injeta a tradução diretamente na página do QToon, sem precisar de um site separado. Projetos como o Cotrans [5] já fazem isso.

**Upgrade de modelo:** Conforme o Google lança novos modelos Gemini (3.x, 4.x), a qualidade de OCR e tradução tende a melhorar sem mudanças na arquitetura. Basta trocar o nome do modelo na chamada de API.

### 8.3 Longo Prazo (v2.0+)

**OCR + Inpainting próprio:** Implementar detecção de balões, OCR e inpainting sem depender de APIs externas, usando modelos como o manga-image-translator [4] em infraestrutura própria com GPU.

**Comunidade:** Sistema de votação em traduções, rankings de mangás mais lidos, recomendações.

**API pública:** Oferecer uma API de tradução de mangá como serviço para outros desenvolvedores.

---

## 9. Stack Tecnológica Sugerida

| Camada | Tecnologia | Justificativa |
|---|---|---|
| **Frontend** | React + Tailwind CSS | Ecossistema maduro, componentes reutilizáveis |
| **Backend** | Node.js + Express | Mesmo runtime do frontend, bom para I/O assíncrono |
| **Scraping** | Cheerio (HTML parse) + Puppeteer (fallback) | Leve para SSR, robusto quando necessário |
| **Tradução (MVP)** | **Gemini 2.5 Flash (free tier)** | Zero custo, visão nativa, qualidade excelente |
| **Tradução (produção)** | **Gemini 2.5 Flash-Lite (pago)** | $0.10/1M tokens, altíssimo volume por centavos |
| **Banco de dados** | PostgreSQL | Cache de traduções, metadados, usuários |
| **Storage** | S3 (ou compatível) | Armazenar imagens traduzidas em cache |
| **Deploy** | Manus Hosting / Railway / Vercel | Simplicidade para MVP |

### 9.1 Como Obter a API Key do Gemini (Gratuito)

O processo para começar a usar o Gemini é simples e não requer cartão de crédito:

1. Acessar [Google AI Studio](https://ai.google.dev/) [1]
2. Fazer login com uma conta Google
3. Clicar em "Get API key" no menu superior
4. Gerar uma nova chave de API
5. Usar o modelo `gemini-2.5-flash` nas chamadas

A chave funciona imediatamente no free tier com os limites descritos na seção 4.2.

---

## 10. Estimativa de Custos

### 10.1 Custo por Capítulo

Considerando um capítulo típico com ~30 imagens:

| Item | Custo Unitário | Custo por Capítulo |
|---|---|---|
| Gemini 2.5 Flash (free tier) | $0.00 | **$0.00** |
| Gemini 2.5 Flash-Lite (pago) | ~$0.0005/imagem | ~$0.015 |
| Gemini 2.5 Flash (pago) | ~$0.001/imagem | ~$0.03 |
| Armazenamento S3 | ~$0.023/GB/mês | Desprezível |
| Bandwidth | ~$0.09/GB | ~$0.01 |

### 10.2 Custo Mensal Estimado

| Cenário | Capítulos/mês | Custo Gemini | Infra | Total |
|---|---|---|---|---|
| **Pessoal (free tier)** | ~480 (16/dia) | **$0.00** | $0 | **$0.00** |
| Pequena comunidade (pago) | 2.000 | $30-60 | $20 | ~$50-80/mês |
| Com cache (50% hit) | 2.000 | $15-30 | $20 | ~$35-50/mês |
| Com cache (80% hit) | 2.000 | $6-12 | $20 | ~$26-32/mês |

O cache é o fator mais importante para viabilidade econômica. Mangás populares serão traduzidos uma vez e servidos para todos os usuários subsequentes.

---

## 11. Modelo de Dados Simplificado

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│    comics    │     │    chapters      │     │   translations    │
├──────────────┤     ├──────────────────┤     ├───────────────────┤
│ id (PK)      │────<│ id (PK)          │────<│ id (PK)           │
│ source       │     │ comic_id (FK)    │     │ chapter_id (FK)   │
│ source_id    │     │ source_episode_id│     │ image_index       │
│ title        │     │ title            │     │ original_url      │
│ author       │     │ chapter_number   │     │ original_text     │
│ cover_url    │     │ is_free          │     │ translated_text   │
│ total_chaps  │     │ image_count      │     │ target_lang       │
│ created_at   │     │ created_at       │     │ overlay_data (JSON│
│ updated_at   │     │ updated_at       │     │ model_used        │
└──────────────┘     └──────────────────┘     │ created_at        │
                                               └───────────────────┘
```

O campo `overlay_data` armazena as posições e textos traduzidos em JSON para re-renderização no frontend sem precisar chamar a API novamente. O campo `model_used` registra qual modelo Gemini foi usado, permitindo re-traduzir com modelos melhores no futuro.

---

## 12. Endpoints da API (MVP)

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/manga/load` | Recebe URL/ID do QToon, retorna metadados + lista de capítulos |
| `GET` | `/api/manga/:comicId/chapters` | Lista capítulos de um mangá já carregado |
| `POST` | `/api/manga/:comicId/chapters/:chapterId/translate` | Inicia tradução de um capítulo (async) |
| `GET` | `/api/manga/:comicId/chapters/:chapterId/status` | Status da tradução (progresso: 5/30 imagens) |
| `GET` | `/api/manga/:comicId/chapters/:chapterId/images` | Retorna imagens com overlay data |
| `GET` | `/api/proxy/image` | Proxy para imagens do QToon CDN (evita CORS) |

---

## 13. Conclusão e Próximos Passos

O MVP é **tecnicamente viável e economicamente acessível** com o Gemini como engine de tradução. O free tier do Google elimina a barreira de custo inicial, permitindo validar a ideia sem investimento financeiro. As imagens do QToon são publicamente acessíveis, o Gemini 2.5 Flash é capaz de extrair e traduzir texto de mangá com qualidade aceitável, e o custo no tier pago é irrisório ($0.015 por capítulo).

Os maiores riscos são a **fragilidade do scraping** (dependência da estrutura do QToon) e a **qualidade do overlay** (posicionar texto traduzido precisamente sobre os balões). Ambos podem ser mitigados incrementalmente.

**Próximos passos recomendados:**

1. Gerar uma API key do Gemini (gratuito, 2 minutos)
2. Validar o pipeline de tradução com 5-10 imagens reais usando o Gemini 2.5 Flash
3. Implementar o scraper básico (fetch + cheerio) para extrair dados do QToon
4. Construir o frontend mínimo (input + viewer + texto lateral)
5. Adicionar cache de traduções no banco de dados
6. Iterar na qualidade do overlay baseado em feedback de usuários

---

## Referências

[1]: https://ai.google.dev/gemini-api/docs/pricing "Gemini Developer API Pricing - Google AI for Developers"
[2]: https://openai.com/api/pricing/ "OpenAI API Pricing"
[3]: https://cloud.google.com/vision/pricing "Google Cloud Vision API Pricing"
[4]: https://github.com/zyddnys/manga-image-translator "manga-image-translator - Open source manga/image translation tool"
[5]: https://cotrans.touhou.ai/ "Cotrans - Collaborative online manga translation platform"
[6]: https://ai.google.dev/gemini-api/docs/rate-limits "Gemini API Rate Limits"
