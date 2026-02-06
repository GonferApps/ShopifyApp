import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate, PLAN_STARTER, PLAN_PRO, PLAN_SCALE } from "../shopify.server";

import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Badge,
} from "@shopify/polaris";

type LoaderData = {
  ok: true;
  hasActivePayment: boolean;
  activePlanName: string | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { billing } = await authenticate.admin(request);

  const check = await billing.check({
    plans: [PLAN_STARTER, PLAN_PRO, PLAN_SCALE],
    isTest: true, // em produção mete false
  });

  const active = check.appSubscriptions?.[0] ?? null;

  return {
    ok: true,
    hasActivePayment: Boolean(check.hasActivePayment),
    activePlanName: active ? String(active.name) : null,
  } satisfies LoaderData;
}

export async function action({ request }: ActionFunctionArgs) {
  const { billing } = await authenticate.admin(request);

  const body = await request.formData();
  const plan = String(body.get("plan") || "");

  const allowed = [PLAN_STARTER, PLAN_PRO, PLAN_SCALE];
  if (!allowed.includes(plan)) {
    return new Response(JSON.stringify({ ok: false, error: "Plano inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Redirect para a confirmação/pagamento no admin
  return billing.request({
    plan,
    isTest: true, // em produção mete false
    // se quiseres forçar o retorno:
    // returnUrl: "https://admin.shopify.com/store/XXX/apps/YYY/app/select-plan"
  });
}

function PlanCard(props: {
  title: string;
  price: string;
  perks: string[];
  isCurrent: boolean;
  planKey: string;
}) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingMd">
            {props.title}
          </Text>
          {props.isCurrent ? <Badge tone="success">Ativo</Badge> : null}
        </InlineStack>

        <Text as="p" variant="headingLg">
          {props.price}
        </Text>

        <BlockStack gap="150">
          {props.perks.map((p) => (
            <Text key={p} as="p" tone="subdued">
              • {p}
            </Text>
          ))}
        </BlockStack>

        <fetcher.Form method="post">
          <input type="hidden" name="plan" value={props.planKey} />
          <Button
            variant={props.isCurrent ? "secondary" : "primary"}
            submit
            disabled={props.isCurrent}
            loading={isSubmitting}
          >
            {props.isCurrent ? "Plano atual" : "Escolher plano"}
          </Button>
        </fetcher.Form>
      </BlockStack>
    </Card>
  );
}

export default function SelectPlanPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Subscrição">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Escolhe o teu plano
                </Text>
                <Text as="p" tone="subdued">
                  Vais ser redirecionado para o admin da Shopify para confirmar a subscrição.
                </Text>

                {data.hasActivePayment ? (
                  <Banner tone="success" title="Já tens uma subscrição ativa">
                    <p>
                      Plano atual: <strong>{data.activePlanName}</strong>
                    </p>
                  </Banner>
                ) : (
                  <Banner tone="info" title="Sem subscrição ativa">
                    <p>Escolhe um plano para continuares.</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>

            <Layout>
              <Layout.Section variant="oneThird">
                <PlanCard
                  title="Starter"
                  price="7€ / mês"
                  perks={["Force cents", "Round tiers", "Suporte básico"]}
                  isCurrent={data.activePlanName === PLAN_STARTER}
                  planKey={PLAN_STARTER}
                />
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <PlanCard
                  title="Pro"
                  price="12€ / mês"
                  perks={["Tudo do Starter", "Mais automações", "Prioridade no suporte"]}
                  isCurrent={data.activePlanName === PLAN_PRO}
                  planKey={PLAN_PRO}
                />
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <PlanCard
                  title="Scale"
                  price="30€ / mês"
                  perks={["Tudo do Pro", "Ferramentas avançadas", "Suporte premium"]}
                  isCurrent={data.activePlanName === PLAN_SCALE}
                  planKey={PLAN_SCALE}
                />
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}