// app/routes/select-plan.tsx
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { json, redirect } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import React, { useCallback } from "react";
import { Page, Layout, Card, BlockStack, Text, Button, InlineStack } from "@shopify/polaris";

// ✅ IMPORTANTE: NADA de shopify.server aqui em cima no client

type LoaderData = {
  ok: true;
  shop: string;
  plans: Array<{ key: "STARTER" | "PRO" | "SCALE"; name: string; price: string }>;
};

export async function loader({ request }: LoaderFunctionArgs) {
  // ✅ shopify.server só dentro do loader/action
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);

  return json<LoaderData>({
    ok: true,
    shop: session.shop,
    plans: [
      { key: "STARTER", name: "Starter", price: "€7 / mês" },
      { key: "PRO", name: "Pro", price: "€12 / mês" },
      { key: "SCALE", name: "Scale", price: "€30 / mês" },
    ],
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);

  const form = await request.formData();
  const planKey = String(form.get("plan") || "");

  // Aqui chamas o teu endpoint de billing subscribe (ou fazes direto)
  // Exemplo: redirecionar para a rota que faz subscribe
  if (!["STARTER", "PRO", "SCALE"].includes(planKey)) {
    return json({ ok: false, error: "Plano inválido" }, { status: 400 });
  }

  return redirect(`/app/billing?plan=${planKey}&shop=${encodeURIComponent(session.shop)}`);
}

export default function SelectPlanRoute() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const onChoose = useCallback(
    (plan: string) => {
      const fd = new FormData();
      fd.set("plan", plan);
      submit(fd, { method: "post" });
    },
    [submit],
  );

  return (
    <Page title="Escolher plano">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="p" tone="subdued">
                Loja: {data.shop}
              </Text>

              <InlineStack gap="300" wrap>
                {data.plans.map((p) => (
                  <Card key={p.key} padding="400">
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingMd">{p.name}</Text>
                      <Text as="p" tone="subdued">{p.price}</Text>
                      <Button variant="primary" onClick={() => onChoose(p.key)}>
                        Escolher {p.name}
                      </Button>
                    </BlockStack>
                  </Card>
                ))}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
