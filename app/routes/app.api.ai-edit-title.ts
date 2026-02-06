import type { ActionFunctionArgs } from "react-router";
import OpenAI from "openai";
import { authenticate } from "../shopify.server";

type Body = {
  productId: string;
  instruction: string;
  apply?: boolean; // false = preview | true = aplica no Shopify
};

type ApiResult = {
  ok: boolean;
  mode: "ai-edit-title";
  productId: string;
  beforeTitle: string;
  afterTitle: string;
  applied: boolean;
  errors: string[];
};

function requireEnv(name: string): string {
  var v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeOneLine(s: string): string {
  return String(s || "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function clampTitle(title: string): string {
  var t = normalizeOneLine(title);
  if (t.length > 255) t = t.slice(0, 255).trim();
  return t;
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

  var productId = normalizeOneLine(body?.productId || "");
  var instruction = normalizeOneLine(body?.instruction || "");
  var apply = Boolean(body?.apply);

  if (!productId) {
    return new Response(JSON.stringify({ ok: false, error: "productId em falta" }), {
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

  // 1) Buscar título atual
  var getQuery = `
    query GetProduct($id: ID!) {
      product(id: $id) { id title }
    }
  `;
  var getResp = await admin.graphql(getQuery, { variables: { id: productId } });
  var getData = (await getResp.json()) as any;

  var beforeTitle = String(getData?.data?.product?.title || "");
  if (!beforeTitle) {
    return new Response(JSON.stringify({ ok: false, error: "Não consegui obter o título do produto" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2) OpenAI (server-side)
  var openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  var model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  var system = `
És um editor de títulos para Shopify.
Devolve APENAS o título final (uma única linha).
Sem aspas, sem markdown, sem explicações.
Mantém o resto do título quando a instrução pedir.
`;
  var user = `
TÍTULO ATUAL:
${beforeTitle}

INSTRUÇÕES:
${instruction}

Regras:
- Se adicionares ™, adiciona só uma vez.
- Não devolvas nada além do título final.
`;

  var completion = await openai.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: system.trim() },
      { role: "user", content: user.trim() },
    ],
  });

  var raw = completion.choices?.[0]?.message?.content || "";
  var afterTitle = clampTitle(raw);

  if (!afterTitle) {
    return new Response(JSON.stringify({ ok: false, error: "A IA devolveu um título vazio" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3) Aplicar no Shopify (se apply)
  var errors: string[] = [];

  if (apply) {
    var mutation = `
      mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title }
          userErrors { field message }
        }
      }
    `;

    var mutResp = await admin.graphql(mutation, {
      variables: { input: { id: productId, title: afterTitle } },
    });

    var mutData = (await mutResp.json()) as any;
    var userErrors = mutData?.data?.productUpdate?.userErrors ?? [];

    if (userErrors.length > 0) {
      errors.push(
        ...userErrors
          .map((e: any) => e?.message)
          .filter(Boolean)
          .map((m: string) => `Shopify: ${m}`),
      );
    }
  }

  var result: ApiResult = {
    ok: errors.length === 0,
    mode: "ai-edit-title",
    productId,
    beforeTitle,
    afterTitle,
    applied: apply && errors.length === 0,
    errors,
  };

  return new Response(JSON.stringify(result), {
    status: errors.length === 0 ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
}
