import type { LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { useLoaderData } from "react-router";
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
} from "@shopify/polaris";

type ApiResult = {
  ok: boolean;
  mode?: "ai-edit-title";
  productId?: string;
  beforeTitle?: string;
  afterTitle?: string;
  applied?: boolean;
  errors?: string[];
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

// loader só para garantir auth
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { ok: true };
}

export default function Index() {
  useLoaderData<typeof loader>();

  var [aiProductId, setAiProductId] = useState<string>("");
  var [aiInstruction, setAiInstruction] = useState<string>(
    "Alterar o nome do produto para um nome feminino português e adicionar ™ ao nome, mantendo o resto do título igual.",
  );

  var [aiPreview, setAiPreview] = useState<{ before: string; after: string } | null>(null);
  var [isLoadingPreview, setIsLoadingPreview] = useState(false);
  var [isLoadingApply, setIsLoadingApply] = useState(false);

  var [error, setError] = useState<string | null>(null);

  async function onPreview() {
    setError(null);
    setAiPreview(null);
    setIsLoadingPreview(true);

    try {
      var data = await postJson<ApiResult>("/app/api/ai-edit-title", {
        productId: aiProductId,
        instruction: aiInstruction,
        apply: false,
      });

      setAiPreview({
        before: data.beforeTitle ?? "",
        after: data.afterTitle ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function onApply() {
    setError(null);
    setIsLoadingApply(true);

    try {
      var data = await postJson<ApiResult>("/app/api/ai-edit-title", {
        productId: aiProductId,
        instruction: aiInstruction,
        apply: true,
      });

      setAiPreview({
        before: data.beforeTitle ?? "",
        after: data.afterTitle ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setIsLoadingApply(false);
    }
  }

  return (
    <Page
      title="QuickEdit: AI Renomear Produto"
      subtitle="Gera um novo título com IA e aplica no Shopify."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                AI • Editar título do produto
              </Text>

              <Text as="p" tone="subdued">
                Faz preview com IA e depois aplica o novo título no Shopify.
              </Text>

              {error ? (
                <Banner tone="critical" title="Erro">
                  <p>{error}</p>
                </Banner>
              ) : null}

              <TextField
                label="Product ID (GID)"
                value={aiProductId}
                onChange={setAiProductId}
                autoComplete="off"
                placeholder="gid://shopify/Product/1234567890"
                helpText="No Shopify Admin, abre o produto e copia o Product ID (GID)."
              />

              <TextField
                label="Instruções"
                value={aiInstruction}
                onChange={setAiInstruction}
                multiline={3}
                autoComplete="off"
              />

              <InlineStack gap="200" align="end">
                <Button
                  loading={isLoadingPreview}
                  disabled={isLoadingApply || !aiProductId || !aiInstruction}
                  onClick={onPreview}
                >
                  Preview
                </Button>

                <Button
                  variant="primary"
                  loading={isLoadingApply}
                  disabled={isLoadingPreview || !aiPreview || !aiProductId}
                  onClick={onApply}
                >
                  Aplicar título
                </Button>
              </InlineStack>

              {aiPreview ? (
                <Banner tone="info" title="Preview">
                  <p>
                    <strong>Antes:</strong> {aiPreview.before}
                  </p>
                  <p>
                    <strong>Depois:</strong> {aiPreview.after}
                  </p>
                </Banner>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
