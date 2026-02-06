import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

import {
  formatPrice,
  parsePrice,
  shouldUpdate,
  type EndingValue,
} from "../utils/price-rules.server";

type ApiResult = {
  ok: boolean;
  mode: "round-tiers";
  ending: EndingValue;
  blockSize: number;
  updated: number;
  skipped: number;
  errors: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function endingCents(ending: EndingValue): number {
  return ending === "0.99" ? 0.99 : 0.95;
}

function countIntDigits(intPart: number): number {
  var n = Math.abs(Math.floor(intPart));
  if (n < 10) return 1;
  if (n < 100) return 2;
  if (n < 1000) return 3;
  if (n < 10000) return 4;
  return String(n).length;
}

/**
 * Regra nova (como nos teus exemplos):
 * - 2 dígitos: tier = blockSize (5 ou 10) -> topo do tier (34, 39, 44, 49...)
 * - 3 dígitos: tier = blockSize * 10 (50 ou 100) -> topo (349, 399, 449, 499...)
 * - 4 dígitos: tier = blockSize * 100 (500 ou 1000) -> topo (3499, 3999, 4499, 4999...)
 *
 * Preço final = topoInteiro + ending (.95/.99)
 */
function roundToTierTopByDigits(price: number, ending: EndingValue, blockSize: number): number {
  if (!Number.isFinite(price) || price <= 0) return price;

  var intPart = Math.floor(price);
  var digits = countIntDigits(intPart);

  // Se for 1 dígito (0–9), não faz sentido aplicar tiers -> mantém ending no inteiro atual
  if (digits <= 1) {
    return intPart + endingCents(ending);
  }

  var scalePow = Math.max(0, digits - 2); // 2->0, 3->1, 4->2, ...
  var scaledBlock = blockSize * Math.pow(10, scalePow);

  // base do tier
  var base = intPart - (intPart % scaledBlock);

  // topo do tier (ex.: +4, +49, +499, +4999...)
  var topInt = base + scaledBlock - 1;

  // (segurança) se por algum motivo top ficar abaixo do int atual, sobe um tier
  if (topInt < intPart) topInt = base + (2 * scaledBlock) - 1;

  return topInt + endingCents(ending);
}

function computeCompareAtTargetRoundTiers(params: {
  currentPrice: number;
  currentCompareAt: number | null;
  targetPrice: number;
  ending: EndingValue;
  blockSize: number;
}): number | null {
  const { currentPrice, currentCompareAt, targetPrice, ending, blockSize } = params;

  if (!currentCompareAt || currentCompareAt <= 0) return null;

  if (currentCompareAt <= currentPrice + 0.0001 || currentPrice <= 0) {
    const bumpRaw = targetPrice + 2;
    const bumped = roundToTierTopByDigits(bumpRaw, ending, blockSize);
    return bumped > targetPrice
      ? bumped
      : roundToTierTopByDigits(targetPrice + 5, ending, blockSize);
  }

  const ratio = currentPrice / currentCompareAt;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  const raw = targetPrice / ratio;
  let targetCompareAt = roundToTierTopByDigits(raw, ending, blockSize);

  if (targetCompareAt <= targetPrice + 0.0001) {
    targetCompareAt = roundToTierTopByDigits(targetPrice + 5, ending, blockSize);
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
    | { ending?: EndingValue; blockSize?: number }
    | null;

  const ending: EndingValue = body?.ending === "0.99" ? "0.99" : "0.95";
  const blockSize =
    typeof body?.blockSize === "number" && body.blockSize > 0
      ? Math.floor(body.blockSize)
      : 5;

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

      // ✅ NOVA REGRA (exatamente como nos teus exemplos)
      const targetPrice = roundToTierTopByDigits(currentPrice, ending, blockSize);

      const currentCompareAt =
        typeof compareAtStr === "string" ? parsePrice(compareAtStr) : null;

      const targetCompareAt = computeCompareAtTargetRoundTiers({
        currentPrice,
        currentCompareAt,
        targetPrice,
        ending,
        blockSize,
      });

      const shouldUpdatePrice = shouldUpdate(currentPrice, targetPrice);
      const shouldUpdateCompareAt =
        targetCompareAt !== null &&
        currentCompareAt !== null &&
        shouldUpdate(currentCompareAt, targetCompareAt);

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
    mode: "round-tiers",
    ending,
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