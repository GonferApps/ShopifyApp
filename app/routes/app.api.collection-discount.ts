import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

import {
  forceCents,
  formatPrice,
  parsePrice,
  roundToTierTop,
  shouldUpdate,
  type EndingValue,
} from "../utils/price-rules.server";

type ApiResult = {
  ok: boolean;
  mode: "collection-discount";
  collectionId: string;
  discountPercent: number;
  ending: EndingValue;
  rounding: "none" | "force-cents" | "round-tiers";
  blockSize: number;
  updated: number;
  skipped: number;
  errors: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// compareAt = price / (1 - D)
function computeCompareAtFromDiscount(price: number, discountPercent: number): number {
  var d = discountPercent / 100;
  var denom = 1 - d;
  if (denom <= 0) return price + 1;
  return price / denom;
}

function applyRounding(params: {
  value: number;
  ending: EndingValue;
  rounding: "none" | "force-cents" | "round-tiers";
  blockSize: number;
}): number {
  var { value, ending, rounding, blockSize } = params;

  if (rounding === "force-cents") return forceCents(value, ending);
  if (rounding === "round-tiers") return roundToTierTop(value, ending, blockSize);
  return value;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  var { admin } = await authenticate.admin(request);

  var body = (await request.json().catch(() => null)) as
    | {
        collectionId?: string;
        discountPercent?: number;
        ending?: EndingValue;
        rounding?: "none" | "force-cents" | "round-tiers";
        blockSize?: number;
      }
    | null;

  var collectionId = String(body?.collectionId || "");
  if (!collectionId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing collectionId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  var discountPercentRaw =
    typeof body?.discountPercent === "number"
      ? body.discountPercent
      : Number.parseFloat(String(body?.discountPercent || ""));

  // Mantém seguro: 1%..95%
  var discountPercent = clamp(Number.isFinite(discountPercentRaw) ? discountPercentRaw : 0, 1, 95);

  var ending: EndingValue = body?.ending === "0.99" ? "0.99" : "0.95";
  var rounding: "none" | "force-cents" | "round-tiers" =
    body?.rounding === "round-tiers"
      ? "round-tiers"
      : body?.rounding === "force-cents"
        ? "force-cents"
        : "none";

  var blockSize =
    typeof body?.blockSize === "number" && body.blockSize > 0 ? Math.floor(body.blockSize) : 5;

  var updated = 0;
  var skipped = 0;
  var errors: string[] = [];

  var query = `
    query CollectionProducts($id: ID!, $first: Int!, $after: String) {
      collection(id: $id) {
        id
        products(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              variants(first: 250) {
                edges {
                  node {
                    id
                    price
                    compareAtPrice
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  var updateMutation = `
    mutation UpdateVariantCompareAt($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price compareAtPrice }
        userErrors { field message }
      }
    }
  `;

  var afterCursor: string | null = null;
  var hasNextPage = true;

  while (hasNextPage) {
    var resp = await admin.graphql(query, {
      variables: { id: collectionId, first: 50, after: afterCursor },
    });

    var data = (await resp.json()) as any;

    var productsConn = data?.data?.collection?.products;
    var edges = productsConn?.edges ?? [];
    var pageInfo = productsConn?.pageInfo;

    for (var p = 0; p < edges.length; p += 1) {
      var productNode = edges[p]?.node;
      var productId = productNode?.id as string | undefined;
      if (!productId) continue;

      var variantEdges = productNode?.variants?.edges ?? [];
      for (var v = 0; v < variantEdges.length; v += 1) {
        var variant = variantEdges[v]?.node;
        var variantId = variant?.id as string | undefined;
        var priceStr = variant?.price as string | undefined;

        if (!variantId || !priceStr) {
          skipped += 1;
          continue;
        }

        var price = parsePrice(priceStr);
        if (price <= 0) {
          skipped += 1;
          continue;
        }

        // compareAt calculado a partir do price e da % de desconto
        var rawCompareAt = computeCompareAtFromDiscount(price, discountPercent);
        var targetCompareAt = applyRounding({
          value: rawCompareAt,
          ending,
          rounding,
          blockSize,
        });

        // garante compareAt > price
        if (targetCompareAt <= price + 0.0001) {
          var bumped = applyRounding({
            value: price + 2,
            ending,
            rounding,
            blockSize,
          });
          targetCompareAt = Math.max(bumped, price + 1);
        }

        var currentCompareAtStr = variant?.compareAtPrice as string | null | undefined;
        var currentCompareAt =
          typeof currentCompareAtStr === "string" ? parsePrice(currentCompareAtStr) : null;

        // ✅ regra pedida: define SEMPRE compareAt (mesmo se estava vazio)
        var needsUpdate =
          currentCompareAt === null ? true : shouldUpdate(currentCompareAt, targetCompareAt);

        if (!needsUpdate) {
          skipped += 1;
          continue;
        }

        var mutResp = await admin.graphql(updateMutation, {
          variables: {
            productId,
            variants: [
              {
                id: variantId,
                compareAtPrice: formatPrice(targetCompareAt),
              },
            ],
          },
        });

        var mutData = (await mutResp.json()) as any;
        var userErrors =
          mutData?.data?.productVariantsBulkUpdate?.userErrors ?? [];

        if (userErrors.length > 0) {
          errors.push(
            `Variant ${variantId}: ${userErrors
              .map((e: any) => e?.message)
              .filter(Boolean)
              .join(", ")}`,
          );
          skipped += 1;
        } else {
          updated += 1;
        }

        if (updated > 0 && updated % 40 === 0) {
          await sleep(350);
        }
      }
    }

    hasNextPage = Boolean(pageInfo?.hasNextPage);
    afterCursor = (pageInfo?.endCursor as string) ?? null;
  }

  var result: ApiResult = {
    ok: true,
    mode: "collection-discount",
    collectionId,
    discountPercent,
    ending,
    rounding,
    blockSize,
    updated,
    skipped,
    errors,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
