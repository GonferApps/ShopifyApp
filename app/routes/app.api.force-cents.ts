import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

import {
  forceCents,
  formatPrice,
  parsePrice,
  shouldUpdate,
  type EndingValue,
} from "../utils/price-rules.server";

type EndingChoice = EndingValue | "no-cents";

type ApiResult = {
  ok: boolean;
  mode: "force-cents";
  ending: EndingChoice;
  updated: number;
  skipped: number;
  errors: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyEnding(value: number, ending: EndingChoice): number {
  if (ending === "no-cents") {
    // remover cêntimos -> preço inteiro
    return Math.floor(value + 1e-9);
  }
  return forceCents(value, ending);
}

function computeCompareAtTarget(params: {
  currentPrice: number;
  currentCompareAt: number | null;
  targetPrice: number;
  ending: EndingChoice;
}): number | null {
  const { currentPrice, currentCompareAt, targetPrice, ending } = params;

  if (!currentCompareAt || currentCompareAt <= 0) return null;

  // Se compareAt não for maior que price, trata como “mal definido”
  if (currentCompareAt <= currentPrice + 0.0001 || currentPrice <= 0) {
    if (ending === "no-cents") {
      const bumpInt = Math.floor(targetPrice) + 1;
      const forced = applyEnding(bumpInt, ending); // inteiro
      return forced > targetPrice ? forced : Math.floor(targetPrice) + 2;
    }

    const bump = Math.floor(targetPrice) + 1 + Number.parseFloat(ending);
    const forced = applyEnding(bump, ending);
    return forced > targetPrice ? forced : applyEnding(targetPrice + 2, ending);
  }

  // Preserva a relação (aprox. % desconto)
  const ratio = currentPrice / currentCompareAt; // ex: 0.45
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  const raw = targetPrice / ratio;
  let targetCompareAt = applyEnding(raw, ending);

  // Garante compareAt > price
  if (targetCompareAt <= targetPrice + 0.0001) {
    if (ending === "no-cents") {
      targetCompareAt = Math.floor(targetPrice) + 1;
    } else {
      targetCompareAt = applyEnding(targetPrice + 2, ending);
    }
  }

  return targetCompareAt;
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
    | { ending?: EndingChoice }
    | null;

  const ending: EndingChoice =
    body?.ending === "0.99" || body?.ending === "no-cents" ? body.ending : "0.95";

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  let afterCursor: string | null = null;
  let hasNextPage = true;

  const variantsQuery = `
    query Variants($first: Int!, $after: String) {
      productVariants(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            price
            compareAtPrice
            product { id }
          }
        }
      }
    }
  `;

  const updateMutation = `
    mutation UpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price compareAtPrice }
        userErrors { field message }
      }
    }
  `;

  while (hasNextPage) {
    const resp = await admin.graphql(variantsQuery, {
      variables: { first: 250, after: afterCursor },
    });

    const data = (await resp.json()) as any;
    const edges = data?.data?.productVariants?.edges ?? [];
    const pageInfo = data?.data?.productVariants?.pageInfo;

    for (let i = 0; i < edges.length; i += 1) {
      const node = edges[i]?.node;

      const variantId = node?.id as string | undefined;
      const priceStr = node?.price as string | undefined;
      const compareAtStr = node?.compareAtPrice as string | null | undefined;
      const productId = node?.product?.id as string | undefined;

      if (!variantId || !priceStr || !productId) {
        skipped += 1;
        continue;
      }

      const currentPrice = parsePrice(priceStr);
      if (currentPrice <= 0) {
        skipped += 1;
        continue;
      }

      const targetPrice = applyEnding(currentPrice, ending);

      const currentCompareAt =
        typeof compareAtStr === "string" ? parsePrice(compareAtStr) : null;

      const targetCompareAt = computeCompareAtTarget({
        currentPrice,
        currentCompareAt,
        targetPrice,
        ending,
      });

      const shouldUpdatePrice = shouldUpdate(currentPrice, targetPrice);
      const shouldUpdateCompareAt =
        targetCompareAt !== null &&
        currentCompareAt !== null &&
        shouldUpdate(currentCompareAt, targetCompareAt);

      // ✅ Se nem price nem compareAt mudam, não mexe
      if (!shouldUpdatePrice && !shouldUpdateCompareAt) {
        skipped += 1;
        continue;
      }

      const variantsInput: Record<string, unknown> = {
        id: variantId,
        price: formatPrice(targetPrice),
      };

      // ✅ Opção C: só mexe no compareAt se já existir e for preciso
      if (targetCompareAt !== null && currentCompareAt !== null && shouldUpdateCompareAt) {
        variantsInput.compareAtPrice = formatPrice(targetCompareAt);
      }

      const mutResp = await admin.graphql(updateMutation, {
        variables: {
          productId,
          variants: [variantsInput],
        },
      });

      const mutData = (await mutResp.json()) as any;
      const userErrors =
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

    hasNextPage = Boolean(pageInfo?.hasNextPage);
    afterCursor = (pageInfo?.endCursor as string) ?? null;
  }

  const result: ApiResult = {
    ok: true,
    mode: "force-cents",
    ending,
    updated,
    skipped,
    errors,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}