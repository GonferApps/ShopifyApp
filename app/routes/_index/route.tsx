import type { LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Se vier do Shopify com ?shop=..., manda para /app mantendo TODOS os params
  if (url.searchParams.get("shop")) {
    const target = new URL("/app", url.origin);
    target.search = url.search; // mantém embedded=1, hmac, host, id_token, shop, etc.

    throw Response.redirect(target.toString(), 302);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>A short heading about [your app]</h1>
        <p className={styles.text}>
          A tagline about [your app] that describes your value proposition.
        </p>

        {showForm ? (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        ) : null}

        <ul className={styles.list}>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and its benefit.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and its benefit.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and its benefit.
          </li>
        </ul>
      </div>
    </div>
  );
}