import type { LoaderFunctionArgs } from "react-router";
import { useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Select,
  Button,
  Text,
  Banner,
  Divider,
  InlineGrid,
  Badge,
  TextField,
} from "@shopify/polaris";

type EndingValue = "0.95" | "0.99";
type RoundingMode = "none" | "force-cents" | "round-tiers";
type CollectionOption = { label: string; value: string };

type ApiResult = {
  ok: boolean;
  mode: "collection-discount";
  collectionId: string;
  discountPercent: number;
  rounding: RoundingMode;
  ending: EndingValue;
  blockSize: number;
  updated: number;
  skipped: number;
  errors: string[];
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  var res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  var text = await res.text();
  var parsed = safeJson(text);

  if (!res.ok) {
    var message =
      parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as any).error)
        : text || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return (parsed as T) ?? ({} as T);
}

export async function loader({ request }: LoaderFunctionArgs) {
  var { admin } = await authenticate.admin(request);

  var query = `
    query Collections($first: Int!) {
      collections(first: $first) {
        edges { node { id title } }
      }
    }
  `;

  var resp = await admin.graphql(query, { variables: { first: 100 } });
  var data = (await resp.json()) as any;

  var edges = data?.data?.collections?.edges ?? [];
  var collections: CollectionOption[] = edges
    .map((e: any) => ({
      label: String(e?.node?.title || "Untitled"),
      value: String(e?.node?.id || ""),
    }))
    .filter((c: CollectionOption) => Boolean(c.value));

  return { collections };
}

export default function Index() {
  var { collections } = useLoaderData<typeof loader>();

  var [collectionId, setCollectionId] = useState<string>(collections?.[0]?.value || "");
  var [discountPercent, setDiscountPercent] = useState<string>("80");

  var [rounding, setRounding] = useState<RoundingMode>("force-cents");
  var [ending, setEnding] = useState<EndingValue>("0.99");
  var [blockSize, setBlockSize] = useState<string>("5");

  var [isLoading, setIsLoading] = useState(false);
  var [result, setResult] = useState<ApiResult | null>(null);
  var [error, setError] = useState<string | null>(null);

  var roundingOptions = useMemo(
    () => [
      { label: "Nenhum (valor exato)", value: "none" },
      { label: "Forçar terminação (.95/.99)", value: "force-cents" },
      { label: "Arredondar por patamares", value: "round-tiers" },
    ],
    [],
  );

  var endingOptions = useMemo(
    () => [
      { label: ".95", value: "0.95" },
      { label: ".99", value: "0.99" },
    ],
    [],
  );

  var blockSizeOptions = useMemo(
    () => [
      { label: "5 (30–34 → 34.xx, 35–39 → 39.xx)", value: "5" },
      { label: "10 (30–39 → 39.xx, 40–49 → 49.xx)", value: "10" },
    ],
    [],
  );

  async function onRun() {
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      var d = Number.parseFloat(discountPercent);
      if (!Number.isFinite(d) || d <= 0 || d >= 100) {
        throw new Error("A % de desconto tem de estar entre 1 e 99.");
      }

      var parsedBlockSize = Number.parseInt(blockSize, 10);
      var safeBlockSize =
        Number.isFinite(parsedBlockSize) && parsedBlockSize > 0 ? parsedBlockSize : 5;

      var data = await postJson<ApiResult>("/app/api/collection-discount", {
        collectionId,
        discountPercent: d,
        rounding,
        ending,
        blockSize: safeBlockSize,
      });

      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setIsLoading(false);
    }
  }

  var totals = useMemo(() => {
    return {
      updated: result?.updated ?? 0,
      skipped: result?.skipped ?? 0,
      errCount: result?.errors?.length ?? 0,
    };
  }, [result]);

  return (
    <Page
      title="QuickEdit: Desconto por coleção"
      subtitle="Calcula e define compareAtPrice a partir do price e da % de desconto."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                Desconto por coleção (compareAt)
              </Text>

              <Text as="p" tone="subdued">
                Ex.: price 34.95€ com 80% → compareAt = 34.95 / 0.20 = 174.75€ (com o arredondamento que escolheres).
              </Text>

              <Divider />

              {error ? (
                <Banner tone="critical" title="Erro">
                  <p>{error}</p>
                </Banner>
              ) : null}

              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <Card>
                  <BlockStack gap="300">
                    <Select
                      label="Coleção"
                      options={collections}
                      value={collectionId}
                      onChange={setCollectionId}
                    />

                    <TextField
                      label="% de desconto"
                      type="number"
                      value={discountPercent}
                      onChange={setDiscountPercent}
                      autoComplete="off"
                      helpText="Ex.: 80 → compareAt = price / 0.20"
                    />
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="300">
                    <Select
                      label="Arredondar compareAt"
                      options={roundingOptions}
                      value={rounding}
                      onChange={(v) => setRounding(v as RoundingMode)}
                    />

                    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                      <Select
                        label="Terminação"
                        options={endingOptions}
                        value={ending}
                        onChange={(v) => setEnding(v as EndingValue)}
                        disabled={rounding === "none"}
                      />

                      <Select
                        label="Patamares"
                        options={blockSizeOptions}
                        value={blockSize}
                        onChange={setBlockSize}
                        disabled={rounding !== "round-tiers"}
                      />
                    </InlineGrid>

                    <InlineStack align="end">
                      <Button
                        variant="primary"
                        loading={isLoading}
                        disabled={!collectionId}
                        onClick={onRun}
                      >
                        Aplicar desconto por coleção
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </InlineGrid>

              <Divider />

              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingMd">
                      Resultado
                    </Text>

                    {result ? (
                      <Badge
                        tone={
                          totals.errCount > 0 ? "critical" : totals.updated > 0 ? "success" : "info"
                        }
                      >
                        {totals.errCount > 0 ? "Com erros" : totals.updated > 0 ? "Aplicado" : "Sem alterações"}
                      </Badge>
                    ) : (
                      <Badge tone="info">Aguardando</Badge>
                    )}
                  </InlineStack>

                  {!result ? (
                    <Text as="p" tone="subdued">
                      Ainda não executaste.
                    </Text>
                  ) : (
                    <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                      <Card>
                        <BlockStack gap="100">
                          <Text as="p" tone="subdued">Updated</Text>
                          <Text as="p" variant="headingLg">{totals.updated}</Text>
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="100">
                          <Text as="p" tone="subdued">Skipped</Text>
                          <Text as="p" variant="headingLg">{totals.skipped}</Text>
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="100">
                          <Text as="p" tone="subdued">Errors</Text>
                          <Text as="p" variant="headingLg">{totals.errCount}</Text>
                        </BlockStack>
                      </Card>
                    </InlineGrid>
                  )}

                  {result?.errors?.length ? (
                    <Banner tone="warning" title="Avisos">
                      <ul>
                        {result.errors.slice(0, 8).map((m, i) => (
                          <li key={`${i}-${m}`}>{m}</li>
                        ))}
                      </ul>
                      {result.errors.length > 8 ? (
                        <Text as="p" tone="subdued">
                          (+ {result.errors.length - 8} mensagens)
                        </Text>
                      ) : null}
                    </Banner>
                  ) : null}
                </BlockStack>
              </Card>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
