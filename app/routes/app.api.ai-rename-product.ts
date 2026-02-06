import type { ActionFunctionArgs } from "react-router";
import OpenAI from "openai";
import { authenticate } from "../shopify.server";

type Body = {
  productId: string;
  instruction: string;
  apply?: boolean; // false = preview, true = aplica
};

type ApiResult = {
  ok: boolean;
  mode: "ai-rename-product";
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

function clampTitle(title: string): string {
  var t = title.replace(/\s+/g, " ").trim();
  // Shopify title pode ir até 255 chars (regra prática)
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

  var productId = String(body?.productId || "").trim();
  var instruction = String(body?.instruction || "").trim();
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
  var getProductQuery = `
    query GetProduct($id: ID!) {
      product(id: $id) {
        id
        title
      }
    }
  `;

  var getResp = await admin.graphql(getProductQuery, { variables: { id: productId } });
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

  // Prompt bem controlado: pedir APENAS o título final, sem aspas, sem explicações
  var system = `
És um editor de títulos de produtos e-commerce.
Devolve APENAS o novo título final (uma única linha), sem aspas, sem markdown, sem explicações.
Mantém o sentido e evita linguagem ofensiva.
`;

  var user = `
TÍTULO ATUAL:
${beforeTitle}

INSTRUÇÕES:
${instruction}

Regras adicionais:
- Mantém o resto do título se a instrução pedir isso.
- Se adicionares ™, usa apenas um símbolo.
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

  // Evitar “no-op”
  if (afterTitle === beforeTitle) {
    var resultNoop: ApiResult = {
      ok: true,
      mode: "ai-rename-product",
      productId,
      beforeTitle,
      afterTitle,
      applied: false,
      errors: ["O título gerado é igual ao atual (sem alterações)."],
    };

    return new Response(JSON.stringify(resultNoop), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3) Aplicar se apply = true
  var errors: string[] = [];
  if (apply) {
    var updateMutation = `
      mutation UpdateProductTitle($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title }
          userErrors { field message }
        }
      }
    `;

    var mutResp = await admin.graphql(updateMutation, {
      variables: {
        input: {
          id: productId,
          title: afterTitle,
        },
      },
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
    mode: "ai-rename-product",
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

console.log("OPENAI_API_KEY exists?", Boolean(process.env.OPENAI_API_KEY));
