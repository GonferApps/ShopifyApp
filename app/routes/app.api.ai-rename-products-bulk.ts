// app/routes/app.api.ai-rename-products-bulk.ts
import type { ActionFunctionArgs } from "react-router";
import OpenAI from "openai";
import { authenticate } from "../shopify.server";

type Body = {
  productIds: Array<number | string>; // ids numéricos (legacyResourceId)
  instruction: string;
  apply?: boolean; // false = preview, true = aplica
};

type ItemResult = {
  productId: number;
  beforeTitle: string;
  afterTitle: string;
  applied: boolean;
  error?: string;
};

type ApiResult = {
  ok: boolean;
  mode: "ai-rename-products-bulk";
  instruction: string;
  apply: boolean;
  requested: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: string[];
  items: ItemResult[];
};

function requireEnv(name: string): string {
  var v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function clampTitle(title: string): string {
  var t = String(title || "").replace(/\s+/g, " ").trim();
  if (t.length > 255) t = t.slice(0, 255).trim();
  return t;
}

function toIntId(v: number | string): number {
  var n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

function gidFromNumericProductId(id: number): string {
  return `gid://shopify/Product/${id}`;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  var { admin } = await authenticate.admin(request);
  var body = (await request.json().catch(() => null)) as Body | null;

  var instruction = String(body?.instruction || "").trim();
  var apply = Boolean(body?.apply);

  var rawIds = Array.isArray(body?.productIds) ? body!.productIds : [];
  var numericIds = rawIds.map(toIntId).filter((n) => n > 0);

  // hard limit 50
  if (numericIds.length > 50) numericIds = numericIds.slice(0, 50);

  if (numericIds.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "Seleciona pelo menos 1 produto." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!instruction) {
    return new Response(JSON.stringify({ ok: false, error: "instruction em falta" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1) Buscar títulos atuais (1 query por batch)
  var nodesQuery = `
    query ProductsByIds($ids: [ID!]!) {
      nodes(ids: $ids) {
        __typename
        ... on Product {
          id
          legacyResourceId
          title
        }
      }
    }
  `;

  var gids = numericIds.map(gidFromNumericProductId);

  var getResp = await admin.graphql(nodesQuery, { variables: { ids: gids } });
  var getData = (await getResp.json()) as any;

  var nodes = Array.isArray(getData?.data?.nodes) ? getData.data.nodes : [];

  var products = nodes
    .filter((n: any) => n && n.__typename === "Product")
    .map((n: any) => ({
      gid: String(n.id || ""),
      productId: Number.parseInt(String(n.legacyResourceId || "0"), 10),
      title: String(n.title || ""),
    }))
    .filter((p: any) => p.gid && p.productId > 0 && p.title);

  if (products.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Não consegui obter produtos para os IDs selecionados." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // 2) OpenAI: 1 chamada para gerar 50 títulos (JSON estrito)
  var openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  var model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  var system = `
És um editor de títulos de produtos e-commerce.
Tens de devolver APENAS JSON válido.
Sem markdown, sem texto extra.
`.trim();

  var user = `
INSTRUÇÃO GLOBAL:
${instruction}

PRODUTOS (id numérico + título atual):
${products.map((p) => `- ${p.productId}: ${p.title}`).join("\n")}

DEVOLVE EXATAMENTE ESTE FORMATO (JSON):
{
  "items": [
    { "productId": 123, "title": "NOVO TÍTULO" }
  ]
}

Regras:
- Mantém o sentido do título.
- Não uses linguagem ofensiva.
- 1 linha por item.
- Máximo 255 chars por title.
- Se não fizer sentido mudar, devolve o mesmo título.
`.trim();

  var completion = await openai.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  var raw = completion.choices?.[0]?.message?.content || "";
  var parsed = safeJson(raw);

  if (!parsed || !Array.isArray(parsed.items)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "A IA não devolveu JSON válido. Ajusta o prompt/model.",
        raw,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // map productId -> afterTitle
  var afterMap = new Map<number, string>();
  parsed.items.forEach((it: any) => {
    var pid = toIntId(it?.productId);
    var title = clampTitle(it?.title || "");
    if (pid > 0 && title) afterMap.set(pid, title);
  });

  // 3) Preparar resultados + aplicar (se apply=true)
  var updateMutation = `
    mutation UpdateProductTitle($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title }
        userErrors { field message }
      }
    }
  `;

  var errors: string[] = [];
  var items: ItemResult[] = [];

  var updated = 0;
  var skipped = 0;

  for (var i = 0; i < products.length; i += 1) {
    var p = products[i];
    var beforeTitle = p.title;
    var afterTitle = clampTitle(afterMap.get(p.productId) || beforeTitle);

    if (!afterTitle || afterTitle === beforeTitle) {
      skipped += 1;
      items.push({
        productId: p.productId,
        beforeTitle,
        afterTitle: beforeTitle,
        applied: false,
      });
      continue;
    }

    if (!apply) {
      items.push({
        productId: p.productId,
        beforeTitle,
        afterTitle,
        applied: false,
      });
      continue;
    }

    var mutResp = await admin.graphql(updateMutation, {
      variables: { input: { id: p.gid, title: afterTitle } },
    });

    var mutData = (await mutResp.json()) as any;
    var userErrors = mutData?.data?.productUpdate?.userErrors ?? [];

    if (userErrors.length > 0) {
      var msg = userErrors
        .map((e: any) => e?.message)
        .filter(Boolean)
        .join(", ");
      errors.push(`Product ${p.productId}: ${msg}`);
      items.push({
        productId: p.productId,
        beforeTitle,
        afterTitle,
        applied: false,
        error: msg,
      });
      skipped += 1;
      continue;
    }

    updated += 1;
    items.push({
      productId: p.productId,
      beforeTitle,
      afterTitle,
      applied: true,
    });
  }

  var result: ApiResult = {
    ok: errors.length === 0,
    mode: "ai-rename-products-bulk",
    instruction,
    apply,
    requested: numericIds.length,
    processed: products.length,
    updated,
    skipped,
    errors,
    items,
  };

  return new Response(JSON.stringify(result), {
    status: errors.length === 0 ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
}