import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type ApiResult = {
  ok: boolean;
  mode: "create-collections";
  created: number;
  skipped: number;
  errors: string[];
};

function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function splitNames(input: string): string[] {
  return input
    .split(",")
    .map((s) => normalizeName(s))
    .filter((s) => s.length > 0);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { admin } = await authenticate.admin(request);

  const body = (await request.json().catch(() => null)) as { names?: string } | null;
  const raw = String(body?.names || "");
  const names = splitNames(raw);

  if (names.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "Sem nomes para criar." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const unique = Array.from(new Set(names.map((n) => n.toLowerCase())))
    .map((lower) => names.find((n) => n.toLowerCase() === lower)!)
    .filter(Boolean);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  const existingQuery = `
    query {
      collections(first: 250) {
        edges {
          node { title }
        }
      }
    }
  `;

  const existingResp = await admin.graphql(existingQuery);
  const existingData = await existingResp.json();

  const existingTitles = (existingData?.data?.collections?.edges ?? [])
    .map((e: any) => String(e.node.title).toLowerCase());

  const mutation = `
    mutation CreateCollection($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id }
        userErrors { message }
      }
    }
  `;

  for (const title of unique) {
    if (existingTitles.includes(title.toLowerCase())) {
      skipped++;
      continue;
    }

    const resp = await admin.graphql(mutation, {
      variables: { input: { title } },
    });

    const json = await resp.json();
    const userErrors = json?.data?.collectionCreate?.userErrors ?? [];

    if (userErrors.length) {
      errors.push(`${title}: ${userErrors.map((e: any) => e.message).join(", ")}`);
      skipped++;
      continue;
    }

    created++;
  }

  const result: ApiResult = {
    ok: true,
    mode: "create-collections",
    created,
    skipped,
    errors,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}