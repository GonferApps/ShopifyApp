// app/routes/app.api.collection-set-image.ts
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type ApiResult = {
  ok: boolean;
  mode: "collection-set-image";
  collectionId: string;
  updated: boolean;
  errors: string[];
};

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { admin } = await authenticate.admin(request);

  const body = (await request.json().catch(() => null)) as
    | { collectionId?: string; imageUrl?: string; altText?: string }
    | null;

  const collectionId = String(body?.collectionId || "");
  const imageUrl = String(body?.imageUrl || "").trim();
  const altText = String(body?.altText || "").trim();

  if (!collectionId || !imageUrl) {
    return new Response(JSON.stringify({ ok: false, error: "collectionId e imageUrl são obrigatórios." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const mutation = `
    mutation SetCollectionImage($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection {
          id
          image { src altText }
        }
        userErrors { field message }
      }
    }
  `;

  const resp = await admin.graphql(mutation, {
    variables: {
      input: {
        id: collectionId,
        image: {
          src: imageUrl,
          altText: altText || null,
        },
      },
    },
  });

  const json = (await resp.json()) as any;
  const userErrors = json?.data?.collectionUpdate?.userErrors ?? [];

  const errors: string[] = userErrors
    .map((e: any) => String(e?.message || ""))
    .filter((s: string) => s.length > 0);

  const result: ApiResult = {
    ok: true,
    mode: "collection-set-image",
    collectionId,
    updated: errors.length === 0,
    errors,
  };

  return new Response(JSON.stringify(result), {
    status: errors.length ? 200 : 200,
    headers: { "Content-Type": "application/json" },
  });
}