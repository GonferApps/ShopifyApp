// app/routes/app.colecaocreative.tsx
import type { LoaderFunctionArgs } from "react-router";
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";

import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Button,
  Text,
  Banner,
  TextField,
  Box,
  Badge,
  Divider,
  Collapsible,
  InlineGrid,
  Icon,
  Select,
} from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";

type LoaderData = {
  ok: true;
  collections: Array<{
    id: string;
    title: string;
    handle: string;
    imageUrl: string | null;
    imageAlt: string | null;
  }>;
  menus: Array<{
    id: string;
    title: string;
    handle: string | null;
  }>;
};

type CreateCollectionsResult = {
  ok: boolean;
  mode: "create-collections";
  created: number;
  skipped: number;
  errors: string[];
};

type SetImageResult = {
  ok: boolean;
  mode: "collection-set-image";
  collectionId: string;
  updated: boolean;
  errors: string[];
};

type AddToMenuResult = {
  ok: boolean;
  mode: "menu-add-collection";
  menuId: string;
  collectionId: string;
  added: boolean;
  skipped: boolean;
  errors: string[];
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const query = `
    query CollectionsAndMenus($first: Int!, $menuFirst: Int!) {
      collections(first: $first) {
        edges {
          node {
            id
            title
            handle
            image {
              url
              altText
            }
          }
        }
      }
      menus(first: $menuFirst) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `;

  const resp = await admin.graphql(query, { variables: { first: 250, menuFirst: 50 } });
  const json = (await resp.json()) as any;

  const collections = (json?.data?.collections?.edges ?? []).map((e: any) => {
    const n = e?.node;
    return {
      id: String(n?.id || ""),
      title: String(n?.title || ""),
      handle: String(n?.handle || ""),
      imageUrl: typeof n?.image?.url === "string" ? n.image.url : null,
      imageAlt: typeof n?.image?.altText === "string" ? n.image.altText : null,
    };
  });

  const menus = (json?.data?.menus?.edges ?? []).map((e: any) => {
    const n = e?.node;
    return {
      id: String(n?.id || ""),
      title: String(n?.title || ""),
      handle: typeof n?.handle === "string" ? n.handle : null,
    };
  });

  return { ok: true, collections, menus } satisfies LoaderData;
}

function CollectionTile(props: {
  item: LoaderData["collections"][number];
  menuId: string;
  onSetImage: (collectionId: string, imageUrl: string, altText: string) => Promise<void>;
  onAddToMenu: (collectionId: string, handle: string, title: string) => Promise<void>;
  busyKey: string | null;
}) {
  const { item, menuId, onSetImage, onAddToMenu, busyKey } = props;

  const [imageUrl, setImageUrl] = useState("");
  const [altText, setAltText] = useState(item.title);
  const [editingImage, setEditingImage] = useState(false);

  const isBusyImage = busyKey === `img:${item.id}`;
  const isBusyMenu = busyKey === `menu:${item.id}`;

  return (
    <Box
      borderColor="border"
      borderWidth="025"
      borderRadius="200"
      padding="200"
      background="bg-surface"
      style={{ overflow: "hidden" }}
    >
      <BlockStack gap="200">
        <Box
          background="bg-surface-secondary"
          borderRadius="200"
          style={{
            width: "100%",
            aspectRatio: "16 / 10",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.imageAlt || item.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
              loading="lazy"
            />
          ) : (
            <Box
              padding="200"
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text as="span" tone="subdued" variant="bodySm">
                Sem imagem
              </Text>
            </Box>
          )}
        </Box>

        <BlockStack gap="100">
          <Text as="h4" variant="headingSm">
            {item.title}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            /{item.handle}
          </Text>
        </BlockStack>

        <InlineStack gap="200" align="start">
          <Button
            size="micro"
            onClick={() => setEditingImage((v) => !v)}
            disabled={isBusyImage || isBusyMenu}
          >
            {editingImage ? "Fechar" : "Adicionar imagem"}
          </Button>

          <Button
            size="micro"
            variant="primary"
            onClick={() => onAddToMenu(item.id, item.handle, item.title)}
            disabled={!menuId || isBusyMenu || isBusyImage}
            loading={isBusyMenu}
          >
            Adicionar ao menu
          </Button>
        </InlineStack>

        {editingImage ? (
          <Box paddingBlockStart="100">
            <BlockStack gap="200">
              <TextField
                label="URL da imagem"
                value={imageUrl}
                onChange={setImageUrl}
                autoComplete="off"
                placeholder="https://..."
                helpText="Dica: usa um link direto para a imagem (jpg/png/webp)."
              />

              <TextField
                label="Alt text"
                value={altText}
                onChange={setAltText}
                autoComplete="off"
              />

              <InlineStack gap="200" align="end">
                <Button
                  variant="primary"
                  size="micro"
                  loading={isBusyImage}
                  disabled={!imageUrl.trim() || isBusyMenu}
                  onClick={async () => {
                    await onSetImage(item.id, imageUrl.trim(), altText.trim() || item.title);
                    setImageUrl("");
                    setEditingImage(false);
                  }}
                >
                  Guardar imagem
                </Button>
              </InlineStack>
            </BlockStack>
          </Box>
        ) : null}
      </BlockStack>
    </Box>
  );
}

export default function ColecaoCreativePage() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const [collectionsCsv, setCollectionsCsv] = useState<string>("");
  const [result, setResult] = useState<CreateCollectionsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // ações novas
  const [menuId, setMenuId] = useState<string>(data.menus[0]?.id ?? "");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const helpText = useMemo(
    () => "Dica: também podes escrever com espaços: Meias, Sapatos, Chinelos",
    [],
  );

  const menuOptions = useMemo(() => {
    const base = data.menus.map((m) => ({
      label: m.title + (m.handle ? ` (${m.handle})` : ""),
      value: m.id,
    }));
    return base.length ? base : [{ label: "Sem menus disponíveis", value: "" }];
  }, [data.menus]);

  const onCreateCollections = useCallback(async () => {
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const res = await fetch("/app/api/create-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ names: collectionsCsv }),
        credentials: "same-origin",
      });

      const text = await res.text();
      const parsed = safeJson(text);

      if (!res.ok) {
        const msg =
          parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
            ? String((parsed as any).error)
            : text || `Request failed (${res.status})`;
        setError(msg);
        return;
      }

      setResult((parsed as CreateCollectionsResult) ?? null);
      revalidator.revalidate();
    } finally {
      setIsLoading(false);
    }
  }, [collectionsCsv, revalidator]);

  const onSetCollectionImage = useCallback(
    async (collectionId: string, imageUrl: string, altText: string) => {
      setActionError(null);
      setActionSuccess(null);
      setBusyKey(`img:${collectionId}`);

      try {
        const res = await fetch("/app/api/collection-set-image", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ collectionId, imageUrl, altText }),
          credentials: "same-origin",
        });

        const text = await res.text();
        const parsed = safeJson(text);

        if (!res.ok) {
          const msg =
            parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
              ? String((parsed as any).error)
              : text || `Request failed (${res.status})`;
          setActionError(msg);
          return;
        }

        const payload = parsed as SetImageResult;
        if (payload.errors?.length) {
          setActionError(payload.errors.join(" • "));
        } else {
          setActionSuccess("Imagem atualizada com sucesso.");
          revalidator.revalidate();
        }
      } finally {
        setBusyKey(null);
        setTimeout(() => setActionSuccess(null), 2500);
      }
    },
    [revalidator],
  );

  const onAddCollectionToMenu = useCallback(
    async (collectionId: string, handle: string, title: string) => {
      setActionError(null);
      setActionSuccess(null);

      if (!menuId) {
        setActionError("Seleciona um menu antes de adicionar.");
        return;
      }

      setBusyKey(`menu:${collectionId}`);

      try {
        const res = await fetch("/app/api/menu-add-collection", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ menuId, collectionId, handle, title }),
          credentials: "same-origin",
        });

        const text = await res.text();
        const parsed = safeJson(text);

        if (!res.ok) {
          const msg =
            parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
              ? String((parsed as any).error)
              : text || `Request failed (${res.status})`;
          setActionError(msg);
          return;
        }

        const payload = parsed as AddToMenuResult;

        if (payload.errors?.length) {
          setActionError(payload.errors.join(" • "));
          return;
        }

        if (payload.skipped) {
          setActionSuccess("Esta coleção já estava no menu.");
        } else {
          setActionSuccess("Coleção adicionada ao menu com sucesso.");
        }
      } finally {
        setBusyKey(null);
        setTimeout(() => setActionSuccess(null), 2500);
      }
    },
    [menuId],
  );

  useEffect(() => {
    // opcional: ao revalidar, manter estado do menuId
  }, [data.collections.length]);

  return (
    <Page title="Criar coleções">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Criar coleções por lista
              </Text>

              <Text as="p" tone="subdued">
                Cola nomes separados por vírgula (ex.: <strong>Meias,Sapatos,Chinelos</strong>).
                <br />
                Se já existir uma coleção com o mesmo nome, é ignorada.
              </Text>

              <TextField
                label="Nomes de coleções"
                value={collectionsCsv}
                onChange={setCollectionsCsv}
                multiline={4}
                autoComplete="off"
                placeholder="Meias,Sapatos,Chinelos"
                helpText={helpText}
              />

              <InlineStack gap="200" align="end">
                <Button
                  variant="primary"
                  loading={isLoading || revalidator.state !== "idle"}
                  disabled={!collectionsCsv.trim()}
                  onClick={onCreateCollections}
                >
                  Criar coleções
                </Button>
              </InlineStack>

              {error ? (
                <Banner tone="critical" title="Erro">
                  <p>{error}</p>
                </Banner>
              ) : null}

              {result ? (
                <Banner tone={result.errors?.length ? "warning" : "success"} title="Resultado">
                  <p>
                    <strong>Criadas:</strong> {result.created} •{" "}
                    <strong>Ignoradas:</strong> {result.skipped}
                  </p>

                  {result.errors && result.errors.length > 0 ? (
                    <ul>
                      {result.errors.slice(0, 10).map((msg, idx) => (
                        <li key={`${idx}-${msg}`}>{msg}</li>
                      ))}
                    </ul>
                  ) : null}
                </Banner>
              ) : null}

              {actionError ? (
                <Banner tone="critical" title="Ação falhou">
                  <p>{actionError}</p>
                </Banner>
              ) : null}

              {actionSuccess ? (
                <Banner tone="success" title="OK">
                  <p>{actionSuccess}</p>
                </Banner>
              ) : null}

              {/* ✅ Collapsible row: coleções existentes (grelha 3 por linha + imagem) */}
              <Box paddingBlockStart="200">
                <Box
                  borderColor="border"
                  borderWidth="025"
                  borderRadius="200"
                  padding="200"
                  background="bg-surface"
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h3" variant="headingSm">
                        Coleções existentes
                      </Text>
                      <Badge tone="info">{data.collections.length}</Badge>
                    </InlineStack>

                    <InlineStack gap="200" blockAlign="center">
                      <Box style={{ minWidth: 320 }}>
                        <Select
                          label="Menu destino"
                          labelHidden
                          options={menuOptions}
                          value={menuId}
                          onChange={setMenuId}
                          disabled={!data.menus.length}
                        />
                      </Box>

                      <button
                        type="button"
                        onClick={() => setCollectionsOpen((v) => !v)}
                        className="Polaris-Button Polaris-Button--pressable Polaris-Button--variantSecondary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"
                        style={{ paddingLeft: 10, paddingRight: 10 }}
                        aria-expanded={collectionsOpen}
                        aria-controls="collections-collapsible"
                      >
                        <InlineStack gap="150" blockAlign="center" wrap={false}>
                          <Text as="span" variant="bodySm">
                            {collectionsOpen ? "Esconder" : "Mostrar"}
                          </Text>
                          <span style={{ display: "inline-flex" }}>
                            <Icon source={collectionsOpen ? ChevronUpIcon : ChevronDownIcon} />
                          </span>
                        </InlineStack>
                      </button>
                    </InlineStack>
                  </InlineStack>

                  <Collapsible
                    open={collectionsOpen}
                    id="collections-collapsible"
                    transition={{ duration: "200ms", timingFunction: "ease" }}
                  >
                    <Box paddingBlockStart="200">
                      <Divider />

                      <Box paddingBlockStart="200">
                        {data.collections.length === 0 ? (
                          <Text as="p" tone="subdued">
                            Ainda não existem coleções.
                          </Text>
                        ) : (
                          <Box style={{ maxHeight: 560, overflowY: "auto", paddingRight: 6 }}>
                            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
                              {data.collections.map((c) => (
                                <CollectionTile
                                  key={c.id}
                                  item={c}
                                  menuId={menuId}
                                  onSetImage={onSetCollectionImage}
                                  onAddToMenu={onAddCollectionToMenu}
                                  busyKey={busyKey}
                                />
                              ))}
                            </InlineGrid>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </Collapsible>
                </Box>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}