// app/routes/app.api.menu-add-collection.ts
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type ApiResult = {
  ok: boolean;
  mode: "menu-add-collection";
  menuId: string;
  collectionId: string;
  added: boolean;
  skipped: boolean;
  errors: string[];
};

type MenuItemNode = {
  id: string;
  title: string;
  type: string;
  url: string | null;
  resourceId: string | null;
  tags: string[];
  items: MenuItemNode[];
};

function toUpdateInput(item: MenuItemNode): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    url: item.url,
    resourceId: item.resourceId,
    tags: item.tags ?? [],
    items: (item.items ?? []).map(toUpdateInput),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { admin } = await authenticate.admin(request);

  const body = (await request.json().catch(() => null)) as
    | { menuId?: string; collectionId?: string; handle?: string; title?: string }
    | null;

  const menuId = String(body?.menuId || "");
  const collectionId = String(body?.collectionId || "");
  const handle = String(body?.handle || "").trim();
  const title = String(body?.title || "").trim();

  if (!menuId || !collectionId || !handle || !title) {
    return new Response(
      JSON.stringify({ ok: false, error: "menuId, collectionId, handle e title são obrigatórios." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // 1) Ler menu atual
  const menuQuery = `
    query MenuById($id: ID!) {
      menu(id: $id) {
        id
        title
        items {
          id
          title
          type
          url
          resourceId
          tags
          items {
            id
            title
            type
            url
            resourceId
            tags
            items {
              id
              title
              type
              url
              resourceId
              tags
            }
          }
        }
      }
    }
  `;

  const menuResp = await admin.graphql(menuQuery, { variables: { id: menuId } });
  const menuJson = (await menuResp.json()) as any;

  const menu = menuJson?.data?.menu;
  if (!menu?.id) {
    return new Response(JSON.stringify({ ok: false, error: "Menu não encontrado." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const existingItems: MenuItemNode[] = (menu.items ?? []).map((i: any) => ({
    id: String(i?.id || ""),
    title: String(i?.title || ""),
    type: String(i?.type || ""),
    url: typeof i?.url === "string" ? i.url : null,
    resourceId: typeof i?.resourceId === "string" ? i.resourceId : null,
    tags: Array.isArray(i?.tags) ? i.tags.map(String) : [],
    items: Array.isArray(i?.items)
      ? i.items.map((c: any) => ({
          id: String(c?.id || ""),
          title: String(c?.title || ""),
          type: String(c?.type || ""),
          url: typeof c?.url === "string" ? c.url : null,
          resourceId: typeof c?.resourceId === "string" ? c.resourceId : null,
          tags: Array.isArray(c?.tags) ? c.tags.map(String) : [],
          items: Array.isArray(c?.items)
            ? c.items.map((d: any) => ({
                id: String(d?.id || ""),
                title: String(d?.title || ""),
                type: String(d?.type || ""),
                url: typeof d?.url === "string" ? d.url : null,
                resourceId: typeof d?.resourceId === "string" ? d.resourceId : null,
                tags: Array.isArray(d?.tags) ? d.tags.map(String) : [],
                items: [],
              }))
            : [],
        }))
      : [],
  }));

  // 2) Evitar duplicados (por resourceId ou por url)
  const targetUrl = `/collections/${handle}`;
  const alreadyThere = existingItems.some(
    (it) => it.resourceId === collectionId || (it.url && it.url.endsWith(targetUrl)),
  );

  if (alreadyThere) {
    const result: ApiResult = {
      ok: true,
      mode: "menu-add-collection",
      menuId,
      collectionId,
      added: false,
      skipped: true,
      errors: [],
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3) Atualizar menu com novo item appended
  const updateItems = existingItems.map(toUpdateInput);

  updateItems.push({
    title,
    type: "COLLECTION",
    url: targetUrl,
    resourceId: collectionId,
    tags: [],
    items: [],
  });

  const menuUpdateMutation = `
    mutation MenuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { id }
        userErrors { field message }
      }
    }
  `;

  const updateResp = await admin.graphql(menuUpdateMutation, {
    variables: {
      id: menuId,
      title: String(menu.title || "Menu"),
      items: updateItems,
    },
  });

  const updateJson = (await updateResp.json()) as any;
  const userErrors = updateJson?.data?.menuUpdate?.userErrors ?? [];

  const errors: string[] = userErrors
    .map((e: any) => String(e?.message || ""))
    .filter((s: string) => s.length > 0);

  const result: ApiResult = {
    ok: true,
    mode: "menu-add-collection",
    menuId,
    collectionId,
    added: errors.length === 0,
    skipped: false,
    errors,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}