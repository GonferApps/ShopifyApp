// app/routes/select-plan.tsx
import type { LoaderFunctionArgs } from "react-router";
import React, { useCallback, useMemo, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { redirect } from "@react-router/node";
import { authenticate } from "../shopify.server";

import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Box,
  Banner,
  InlineGrid,
} from "@shopify/polaris";

type LoaderData = {
  ok: true;
  shop: string;
  plans: Array<{
    key: "STARTER" | "PRO" | "SCALE";
    name: string;
    price: string;
  }>;
};

export async function loader({ request }: LoaderFunctionArgs) {
  // garante sessão (ajusta se o teu helper for outro)
  const { session } = await authenticate.admin(request);

  // se por algum motivo não houver shop, manda para auth
  if (!session?.shop) {
    throw redirect("/auth");
  }

  const data: LoaderData = {
    ok: true,
    shop: session.shop,
    plans: [
      { key: "STARTER", name: "Starter", price: "€7 / mês" },
      { key: "PRO", name: "Pro", price: "€12 / mês" },
      { key: "SCALE", name: "Scale", price: "€30 / mês" },
    ],
  };

  // ✅ sem json() — para não rebentar no Render
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default function SelectPlanPage() {
  const data = useLoaderData() as LoaderData;
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState<LoaderData["plans"][number]["key"] | null>(null);

  const onChoose = useCallback(
    async (planKey: LoaderData["plans"][number]["key"]) => {
      setError(null);
      setIsLoadingKey(planKey);

      try {
        const res = await fetch("/app/api/billing/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ planKey }),
        });

        const text = await res.text();
        let parsed: any = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }

        if (!res.ok) {
          const msg =
            parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
              ? String(parsed.error)
              : text || `Request failed (${res.status})`;
          setError(msg);
          return;
        }

        // backend deve devolver { ok: true, confirmationUrl?: string }
        if (parsed?.confirmationUrl) {
          window.top?.location.assign(parsed.confirmationUrl);
          return;
        }

        // fallback: volta para /app
        navigate("/app");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro desconhecido");
      } finally {
        setIsLoadingKey(null);
      }
    },
    [navigate],
  );

  const subtitle = useMemo(() => `Loja: ${data.shop}`, [data.shop]);

  return (
    <Page title="Escolher plano" subtitle={subtitle}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {error ? (
                <Banner tone="critical" title="Erro">
                  <p>{error}</p>
                </Banner>
              ) : null}

              <Text as="p" tone="subdued">
                Escolhe um plano para ativares a subscrição.
              </Text>

              <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                {data.plans.map((p) => (
                  <Box
                    key={p.key}
                    borderColor="border"
                    borderWidth="025"
                    borderRadius="200"
                    padding="300"
                    background="bg-surface"
                  >
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">
                        {p.name}
                      </Text>
                      <Text as="p" tone="subdued">
                        {p.price}
                      </Text>

                      <InlineStack align="end">
                        <Button
                          variant="primary"
                          loading={isLoadingKey === p.key}
                          onClick={() => onChoose(p.key)}
                        >
                          Escolher
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}