// app/routes/app.billing.tsx
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
} from "@shopify/polaris";

type PlanKey = "starter" | "pro" | "business";

type Plan = {
  key: PlanKey;
  name: string;
  priceEur: number;
  description: string;
};

const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    priceEur: 7,
    description: "Essencial para começar.",
  },
  {
    key: "pro",
    name: "Pro",
    priceEur: 12,
    description: "Mais automações e limites mais altos.",
  },
  {
    key: "business",
    name: "Business",
    priceEur: 30,
    description: "Tudo desbloqueado + prioridades.",
  },
];

type ActiveSub = {
  id: string;
  name: string;
  status: string;
};

type LoaderData = {
  ok: true;
  shop: string;
  activeSubscription: ActiveSub | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  // Tenta descobrir subscription ativa (se existir)
  const query = `
    query CurrentAppInstallation {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `;

  const resp = await admin.graphql(query);
  const json = (await resp.json()) as any;

  const subs = (json?.data?.currentAppInstallation?.activeSubscriptions ?? []) as any[];
  const active = subs.find((s) => String(s?.status || "").toUpperCase() === "ACTIVE") || null;

  const activeSubscription = active
    ? {
        id: String(active.id),
        name: String(active.name),
        status: String(active.status),
      }
    : null;

  return {
    ok: true,
    shop: session.shop,
    activeSubscription,
  } satisfies LoaderData;
}

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Subscrição">
      <Layout>
        <Layout.Section>
          {data.activeSubscription ? (
            <Banner tone="success" title="Subscrição ativa">
              <p>
                Plano: <strong>{data.activeSubscription.name}</strong>{" "}
                <Badge tone="success">{data.activeSubscription.status}</Badge>
              </p>
            </Banner>
          ) : (
            <Banner tone="info" title="Sem subscrição ativa">
              <p>Escolhe um plano para ativar a app.</p>
            </Banner>
          )}

          <BlockStack gap="400">
            {PLANS.map((plan) => (
              <Card key={plan.key}>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        {plan.name}
                      </Text>
                      <Text as="p" tone="subdued">
                        {plan.description}
                      </Text>
                    </BlockStack>

                    <BlockStack gap="100" inlineAlign="end">
                      <Text as="p" variant="headingLg">
                        €{plan.priceEur}/mês
                      </Text>

                      <form method="post" action="/app/api/billing/subscribe">
                        <input type="hidden" name="plan" value={plan.key} />
                        <Button submit variant="primary" disabled={!!data.activeSubscription}>
                          Subscribe
                        </Button>
                      </form>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}