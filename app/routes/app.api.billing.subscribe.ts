// app/routes/app.api.billing.subscribe.ts
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type PlanKey = "starter" | "pro" | "business";

type PlanConfig = {
  name: string;
  amount: number;
  currencyCode: "EUR";
  interval: "EVERY_30_DAYS";
};

const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  starter: { name: "Starter", amount: 7, currencyCode: "EUR", interval: "EVERY_30_DAYS" },
  pro: { name: "Pro", amount: 12, currencyCode: "EUR", interval: "EVERY_30_DAYS" },
  business: { name: "Business", amount: 30, currencyCode: "EUR", interval: "EVERY_30_DAYS" },
};

function pickPlan(value: unknown): PlanKey | null {
  if (value === "starter" || value === "pro" || value === "business") return value;
  return null;
}

function getAppUrlFromRequest(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { admin } = await authenticate.admin(request);

  const form = await request.formData();
  const planKey = pickPlan(form.get("plan"));

  if (!planKey) {
    return new Response(JSON.stringify({ ok: false, error: "Plano inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const plan = PLAN_CONFIG[planKey];

  const appUrl = getAppUrlFromRequest(request);
  const returnUrl = `${appUrl}/app/billing`; // quando o merchant aprovar/recusar, volta aqui

  const mutation = `
    mutation CreateSubscription($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test) {
        confirmationUrl
        userErrors { field message }
      }
    }
  `;

  // Em dev store convém usar test: true.
  // Se quiseres controlar isto por env: process.env.NODE_ENV !== "production"
  const isTest = process.env.NODE_ENV !== "production";

  const variables = {
    name: `QuickEdit - ${plan.name} (€${plan.amount}/mês)`,
    returnUrl,
    test: isTest,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: plan.amount, currencyCode: plan.currencyCode },
            interval: plan.interval,
          },
        },
      },
    ],
  };

  const resp = await admin.graphql(mutation, { variables });
  const json = (await resp.json()) as any;

  const errs = json?.data?.appSubscriptionCreate?.userErrors ?? [];
  if (errs.length) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: errs.map((e: any) => e?.message).filter(Boolean).join(", "),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const confirmationUrl = String(json?.data?.appSubscriptionCreate?.confirmationUrl || "");
  if (!confirmationUrl) {
    return new Response(JSON.stringify({ ok: false, error: "Sem confirmationUrl." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ✅ manda para o approval screen da Shopify
  return new Response(null, {
    status: 302,
    headers: { Location: confirmationUrl },
  });
}