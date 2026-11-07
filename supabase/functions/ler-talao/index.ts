// ler-talao: recebe a fotografia de um talão, pede ao Claude a leitura linha a linha
// e devolve o resultado. Só para testadores autenticados, com limite diário.
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGENS = ["https://d73om.github.io"];
const LIMITE_DIARIO = 40;
const MODELO = "claude-sonnet-5-5";
const CATEGORIAS = [
  "alimentacao", "bebidas_alcoolicas", "limpeza", "higiene", "bebe", "animais", "casa",
  "eletronica", "roupa", "saude", "combustivel", "restauracao", "sacos_embalagens", "outros",
];

function cabecalhos(origem: string) {
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function chavePublica(): string {
  try {
    const chaves = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    const v = chaves.default ?? Object.values(chaves)[0];
    if (v) return String(v);
  } catch (_) { /* usa a chave antiga */ }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

const INSTRUCOES = [
  "És um leitor rigoroso de talões e faturas portuguesas. Lê as imagens e regista o documento chamando sempre a ferramenta registar_talao, uma única vez, sem escrever texto antes ou depois.",
  "Regras:",
  "- Valores em euros tal como impressos, com ponto decimal.",
  "- Cada artigo é uma linha. Um desconto ou promoção (valor negativo) que se aplica ao artigo anterior é subtraído ao valor desse artigo, sem criar outra linha. Se não for claro a que artigo pertence, cria uma linha negativa com a categoria do artigo anterior.",
  "- valor = o que se pagou pela linha (quantidade x preço, já com desconto).",
  "- descricao = nome legível em português (ex.: 'Lixívia Neoblanc' para 'NEOBLANC TRADICIONA'); descricao_original = texto como impresso.",
  "- taxa_iva em percentagem (0, 6, 13, 23, ou as taxas dos Açores e da Madeira). Se o talão usar letras (A, B, C), converte-as com o resumo do IVA.",
  "- categoria: escolhe pelo que o produto é, nunca pela taxa de IVA nem pela secção da loja. Usa o conhecimento de marcas (Aquafresh = higiene, Neoblanc = limpeza, Biscoff = alimentacao).",
  "- Sacos e depósitos de embalagens vão para sacos_embalagens.",
  "- confianca 'baixa' quando não tens a certeza da categoria ou do texto.",
  "- tem_nif_cliente = true só se estiver impresso um NIF do cliente; false se disser 'Consumidor final' ou nada.",
  "- iva = o resumo do IVA impresso (taxa, base, valor). Se não houver resumo, lista vazia.",
  "- Se as imagens forem partes consecutivas do mesmo talão, com sobreposição, não repitas linhas.",
  "- Se não for um talão ou fatura, ou estiver ilegível, devolve linhas vazias, total 0 e explica em avisos.",
].join("\n");

const FERRAMENTA = {
  name: "registar_talao",
  description: "Regista um talão ou fatura lido da imagem.",
  input_schema: {
    type: "object",
    properties: {
      loja: { type: "string", description: "Nome comercial e localidade, ex.: 'Lidl Tires'" },
      nif_loja: { type: ["string", "null"] },
      data: { type: ["string", "null"], description: "AAAA-MM-DD" },
      tipo_documento: { type: "string", description: "Fatura, Fatura simplificada, Fatura-recibo, etc." },
      tem_nif_cliente: { type: "boolean" },
      total: { type: "number" },
      iva: {
        type: "array",
        items: {
          type: "object",
          properties: { taxa: { type: "number" }, base: { type: "number" }, valor: { type: "number" } },
          required: ["taxa", "base", "valor"],
        },
      },
      linhas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descricao: { type: "string" },
            descricao_original: { type: "string" },
            quantidade: { type: ["number", "null"] },
            valor: { type: "number" },
            taxa_iva: { type: ["number", "null"] },
            categoria: { type: "string", enum: CATEGORIAS },
            confianca: { type: "string", enum: ["alta", "baixa"] },
          },
          required: ["descricao", "valor", "categoria", "confianca"],
        },
      },
      avisos: { type: "array", items: { type: "string" } },
    },
    required: ["loja", "tem_nif_cliente", "total", "iva", "linhas"],
  },
};

const r2 = (n: unknown) => Math.round(Number(n || 0) * 100) / 100;

Deno.serve(async (req) => {
  const h = cabecalhos(req.headers.get("origin") ?? "");
  const responder = (corpo: unknown, estado = 200) => new Response(JSON.stringify(corpo), { status: estado, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return responder({ erro: "metodo" }, 405);

  // 1. Quem é?
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return responder({ erro: "sem_sessao" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica(), {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false },
  });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return responder({ erro: "sem_sessao" }, 401);

  // 2. É testador e ainda tem leituras hoje?
  const { data: testador } = await sb.rpc("sou_testador");
  if (!testador) return responder({ erro: "nao_testador" }, 403);
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb.from("leituras").select("id", { count: "exact", head: true }).gte("criado_em", desde);
  if ((count ?? 0) >= LIMITE_DIARIO) return responder({ erro: "limite_diario" }, 429);

  // 3. Imagens
  let corpo: { imagens?: { data?: string }[] };
  try { corpo = await req.json(); } catch (_) { return responder({ erro: "pedido_invalido" }, 400); }
  const imagens = (corpo.imagens ?? []).filter((i) => typeof i?.data === "string" && i.data.length > 100);
  if (imagens.length < 1 || imagens.length > 6) return responder({ erro: "imagens" }, 400);
  if (imagens.some((i) => i.data!.length > 4_000_000)) return responder({ erro: "imagem_grande" }, 413);

  const conteudo = [
    ...imagens.map((i) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: i.data } })),
    { type: "text", text: imagens.length > 1 ? "Estas imagens são partes consecutivas do mesmo talão." : "Lê este talão." },
  ];

  // 4. Pedido ao Claude
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 12000,
      system: INSTRUCOES,
      tools: [FERRAMENTA],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: conteudo }],
    }),
  });
  const resposta = await r.json().catch(() => ({}));
  const uso = resposta?.usage ?? null;
  const bloco = (resposta?.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  await sb.from("leituras").insert({ sucesso: Boolean(r.ok && bloco) });
  if (!r.ok || !bloco) {
    console.error("Falha na leitura", r.status, resposta?.error?.type, resposta?.error?.message);
    return responder({ erro: "leitura_falhou", estado: r.status }, 502);
  }

  // 5. Limpar e verificar
  const t = bloco.input ?? {};
  const linhas = (Array.isArray(t.linhas) ? t.linhas : []).slice(0, 300).map((l: Record<string, unknown>, i: number) => ({
    ordem: i,
    descricao: String(l.descricao ?? "").slice(0, 300) || "Artigo",
    descricao_original: String(l.descricao_original ?? "").slice(0, 300),
    quantidade: l.quantidade == null ? null : Number(l.quantidade),
    valor: r2(l.valor),
    taxa_iva: l.taxa_iva == null ? null : Number(l.taxa_iva),
    categoria: CATEGORIAS.includes(String(l.categoria)) ? String(l.categoria) : "outros",
    confianca: l.confianca === "baixa" ? "baixa" : "alta",
  }));
  const total = r2(t.total);
  const soma = r2(linhas.reduce((s: number, l: { valor: number }) => s + l.valor, 0));
  const iva = (Array.isArray(t.iva) ? t.iva : []).map((x: Record<string, unknown>) => ({ taxa: Number(x.taxa), base: r2(x.base), valor: r2(x.valor) }));
  const talao = {
    loja: String(t.loja ?? "").slice(0, 200),
    nif_loja: t.nif_loja ? String(t.nif_loja).replace(/\s/g, "").slice(0, 20) : null,
    data: /^\d{4}-\d{2}-\d{2}$/.test(String(t.data)) ? String(t.data) : null,
    tipo_documento: String(t.tipo_documento ?? "").slice(0, 60),
    tem_nif_cliente: Boolean(t.tem_nif_cliente),
    total,
    iva,
    iva_total: r2(iva.reduce((s: number, x: { valor: number }) => s + x.valor, 0)),
    linhas,
    avisos: Array.isArray(t.avisos) ? t.avisos.slice(0, 5).map(String) : [],
  };
  return responder({ ok: true, talao, soma, soma_confere: Math.abs(soma - total) <= 0.05, uso });
});
