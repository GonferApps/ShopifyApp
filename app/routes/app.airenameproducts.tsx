// app/routes/app.airenameproducts.tsx
import type { LoaderFunctionArgs } from "react-router";
import React, { useMemo, useState, useCallback } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";

import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Banner,
  Badge,
  Divider,
  Box,
  Checkbox,
} from "@shopify/polaris";

type ProductRow = {
  id: number; // legacyResourceId
  title: string;
  handle: string;
  imageUrl: string | null;
};

type LoaderData = {
  ok: true;
  products: ProductRow[];
};

type ApiItem = {
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
  items: ApiItem[];
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  var { admin } = await authenticate.admin(request);

  // últimos 250 para escolheres; se quiseres pagination a seguir, digo-te como.
  var query = `
    query Products($first: Int!) {
      products(first: $first, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            legacyResourceId
            title
            handle
            featuredImage { url }
          }
        }
      }
    }
  `;

  var resp = await admin.graphql(query, { variables: { first: 250 } });
  var json = (await resp.json()) as any;

  var products = (json?.data?.products?.edges ?? [])
    .map((e: any) => e?.node)
    .filter(Boolean)
    .map((n: any) => ({
      id: Number.parseInt(String(n.legacyResourceId || "0"), 10),
      title: String(n.title || ""),
      handle: String(n.handle || ""),
      imageUrl: typeof n?.featuredImage?.url === "string" ? n.featuredImage.url : null,
    }))
    .filter((p: any) => p.id > 0 && p.title);

  return { ok: true, products } satisfies LoaderData;
}

export default function AiRenameProductsPage() {
  var data = useLoaderData<typeof loader>();
  var revalidator = useRevalidator();

  var [query, setQuery] = useState("");
  var [instruction, setInstruction] = useState("");
  var [selected, setSelected] = useState<Record<number, boolean>>({});
  var [isLoading, setIsLoading] = useState(false);

  var [result, setResult] = useState<ApiResult | null>(null);
  var [error, setError] = useState<string | null>(null);

  var filtered = useMemo(() => {
    var q = query.trim().toLowerCase();
    if (!q) return data.products;
    return data.products.filter((p) => {
      return (
        p.title.toLowerCase().includes(q) ||
        p.handle.toLowerCase().includes(q) ||
        String(p.id).includes(q)
      );
    });
  }, [data.products, query]);

  var selectedIds = useMemo(() => {
    return Object.keys(selected)
      .map((k) => Number.parseInt(k, 10))
      .filter((id) => Boolean(selected[id]));
  }, [selected]);

  var selectedCount = selectedIds.length;

  var toggle = useCallback((id: number, value: boolean) => {
    // limite 50
    if (value && selectedCount >= 50) return;
    setSelected((prev) => ({ ...prev, [id]: value }));
  }, [selectedCount]);

  var toggleAllVisible = useCallback(() => {
    var max = 50;
    var next: Record<number, boolean> = { ...selected };
    var already = Object.keys(next).filter((k) => next[Number.parseInt(k, 10)]).length;

    // se já tens alguns marcados, este botão marca até preencher 50
    for (var i = 0; i < filtered.length; i += 1) {
      var id = filtered[i].id;
      if (already >= max) break;
      if (!next[id]) {
        next[id] = true;
        already += 1;
      }
    }

    setSelected(next);
  }, [filtered, selected]);

  var clearSelection = useCallback(() => {
    setSelected({});
  }, []);

  async function callApi(apply: boolean) {
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      var res = await fetch("/app/api/ai-rename-products-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          productIds: selectedIds,
          instruction,
          apply,
        }),
      });

      var text = await res.text();
      var parsed = safeJson(text);

      if (!res.ok) {
        var msg =
          parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
            ? String((parsed as any).error)
            : text || `Request failed (${res.status})`;
        setError(msg);
        return;
      }

      setResult((parsed as ApiResult) ?? null);

      // se aplicou, atualiza lista
      if (apply) revalidator.revalidate();
    } finally {
      setIsLoading(false);
    }
  }

  var onPreview = useCallback(async () => {
    if (!instruction.trim()) {
      setError("Escreve a instrução primeiro.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Seleciona pelo menos 1 produto.");
      return;
    }
    await callApi(false);
  }, [instruction, selectedIds]);

  var onApply = useCallback(async () => {
    if (!instruction.trim()) {
      setError("Escreve a instrução primeiro.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Seleciona pelo menos 1 produto.");
      return;
    }
    await callApi(true);
  }, [instruction, selectedIds]);

  return (
    <Page title="AI Rename Products">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Renomear produtos com IA
                </Text>

                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={selectedCount > 50 ? "critical" : "info"}>
                    Selecionados: {selectedCount}/50
                  </Badge>
                </InlineStack>
              </InlineStack>

              <Text as="p" tone="subdued">
                Escolhe até 50 produtos, escreve a instrução e faz <strong>Preview</strong> antes de aplicar.
              </Text>

              <TextField
                label="Pesquisar"
                value={query}
                onChange={setQuery}
                autoComplete="off"
                placeholder="título, handle ou ID"
              />

              <TextField
                label="Instrução para a IA"
                value={instruction}
                onChange={setInstruction}
                multiline={4}
                autoComplete="off"
                placeholder='Ex.: "Remove a palavra SALE do início e adiciona ™ no fim."'
              />

              <InlineStack gap="200" align="end">
                <Button onClick={toggleAllVisible} disabled={filtered.length === 0}>
                  Selecionar visíveis
                </Button>
                <Button onClick={clearSelection} disabled={selectedCount === 0}>
                  Limpar
                </Button>
                <Button
                  variant="secondary"
                  loading={isLoading}
                  disabled={selectedCount === 0 || !instruction.trim()}
                  onClick={onPreview}
                >
                  Preview
                </Button>
                <Button
                  variant="primary"
                  loading={isLoading || revalidator.state !== "idle"}
                  disabled={selectedCount === 0 || !instruction.trim()}
                  onClick={onApply}
                >
                  Aplicar
                </Button>
              </InlineStack>

              {error ? (
                <Banner tone="critical" title="Erro">
                  <p>{error}</p>
                </Banner>
              ) : null}

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Produtos
                </Text>

                <Box style={{ maxHeight: 520, overflowY: "auto" }}>
                  <BlockStack gap="150">
                    {filtered.map((p) => {
                      var checked = Boolean(selected[p.id]);
                      var disabled = !checked && selectedCount >= 50;

                      return (
                        <Box
                          key={p.id}
                          padding="200"
                          borderColor="border"
                          borderWidth="025"
                          borderRadius="200"
                          background="bg-surface"
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Checkbox
                                label=""
                                checked={checked}
                                disabled={disabled}
                                onChange={(v) => toggle(p.id, v)}
                              />
                              {p.imageUrl ? (
                                <img
                                  src={p.imageUrl}
                                  alt={p.title}
                                  style={{
                                    width: 44,
                                    height: 44,
                                    objectFit: "cover",
                                    borderRadius: 8,
                                    display: "block",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 8,
                                    background: "rgba(0,0,0,0.06)",
                                  }}
                                />
                              )}
                              <BlockStack gap="050">
                                <Text as="p" variant="bodyMd">
                                  {p.title}
                                </Text>
                                <Text as="p" tone="subdued" variant="bodySm">
                                  ID {p.id} • /{p.handle}
                                </Text>
                              </BlockStack>
                            </InlineStack>
                          </InlineStack>
                        </Box>
                      );
                    })}
                  </BlockStack>
                </Box>
              </BlockStack>

              {result ? (
                <>
                  <Divider />
                  <Banner tone={result.errors?.length ? "warning" : "success"} title="Resultado">
                    <p>
                      <strong>Updated:</strong> {result.updated} •{" "}
                      <strong>Skipped:</strong> {result.skipped}
                    </p>
                    {result.errors?.length ? (
                      <ul>
                        {result.errors.slice(0, 8).map((m, idx) => (
                          <li key={`${idx}-${m}`}>{m}</li>
                        ))}
                      </ul>
                    ) : null}
                  </Banner>

                  <Box style={{ maxHeight: 420, overflowY: "auto" }}>
                    <BlockStack gap="150">
                      {result.items.map((it) => (
                        <Box
                          key={it.productId}
                          padding="200"
                          borderColor="border"
                          borderWidth="025"
                          borderRadius="200"
                          background="bg-surface"
                        >
                          <Text as="p" variant="bodySm" tone="subdued">
                            ID {it.productId} {it.applied ? "• aplicado" : "• preview"}
                            {it.error ? ` • erro: ${it.error}` : ""}
                          </Text>
                          <Text as="p" variant="bodyMd">
                            <strong>Antes:</strong> {it.beforeTitle}
                          </Text>
                          <Text as="p" variant="bodyMd">
                            <strong>Depois:</strong> {it.afterTitle}
                          </Text>
                        </Box>
                      ))}
                    </BlockStack>
                  </Box>
                </>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}