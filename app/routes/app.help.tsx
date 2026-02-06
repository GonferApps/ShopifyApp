import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Link,
  Box,
  Divider,
  Badge,
} from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { ok: true };
}

export default function HelpPage() {
  var supportEmail = "support@dropshipandle.com";

  // Ajusta estes links como quiseres
  var templatesUrl = "/app/templates";
  var subscriptionUrl = "/app/subscription";
  var privacyUrl = "/app/privacy";

  return (
    <Page title="Help">
      <Layout>
        <Layout.Section>
          <Box paddingBlockStart="400" paddingBlockEnd="400">
            <Layout>
              <Layout.Section>
                <Box paddingBlockEnd="400">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "16px",
                    }}
                  >
                    {/* Contact us */}
                    <Card>
                      <BlockStack gap="300">
                        <Text as="h2" variant="headingMd">
                          Contact us
                        </Text>

                        <Text as="p" tone="subdued">
                          If you have any questions or need help, you can chat with us or
                          send us an email at{" "}
                          <Link url={`mailto:${supportEmail}`}>{supportEmail}</Link>. We
                          will get back to you as soon as possible!
                        </Text>

                        <Text as="p" tone="subdued">
                          If you have feedback or suggestions for the app, you can send us
                          a quick note by clicking the button below. We would love to hear
                          from you!
                        </Text>

                        <InlineStack gap="200" align="end">
                          <Button
                            onClick={() => {
                              // exemplo: abre email de feedback
                              window.location.href = `mailto:${supportEmail}?subject=Feedback%20QuickBulkEdit&body=Escreve%20aqui%20o%20teu%20feedback...`;
                            }}
                          >
                            Send feedback
                          </Button>

                          <Button
                            variant="primary"
                            onClick={() => {
                              // exemplo: abre email “support”
                              window.location.href = `mailto:${supportEmail}?subject=Support%20QuickBulkEdit`;
                            }}
                          >
                            Contact support
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Card>

                    {/* Onboarding reset */}
                    <Card>
                      <BlockStack gap="300">
                        <Text as="h2" variant="headingMd">
                          Onboarding reset
                        </Text>

                        <Text as="p" tone="subdued">
                          Here you can reset your onboarding status.
                        </Text>

                        <Text as="p" tone="subdued">
                          This will allow you to see the guided tour again as if you are a
                          new user.
                        </Text>

                        <InlineStack align="end">
                          <Button disabled>Already reset</Button>
                        </InlineStack>
                      </BlockStack>
                    </Card>

                    {/* Templates */}
                    <Card>
                      <BlockStack gap="300">
                        <Text as="h2" variant="headingMd">
                          Templates
                        </Text>

                        <Text as="p" tone="subdued">
                          Explore the task templates to get started with some examples.
                        </Text>

                        <InlineStack align="end">
                          <Button url={templatesUrl}>View templates</Button>
                        </InlineStack>
                      </BlockStack>
                    </Card>

                    {/* Subscription */}
                    <Card>
                      <BlockStack gap="300">
                        <Text as="h2" variant="headingMd">
                          Subscription
                        </Text>

                        <Text as="p" tone="subdued">
                          You can change or cancel your subscription plan here.
                        </Text>

                        <InlineStack align="end">
                          <Button url={subscriptionUrl}>Change plan</Button>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  </div>
                </Box>

                <Divider />

                {/* Footer */}
                <Box paddingBlockStart="400">
                  <InlineStack align="center" gap="300">
                    <Text as="span" tone="subdued">
                      Email{" "}
                      <Link url={`mailto:${supportEmail}`}>{supportEmail}</Link> for help.
                    </Text>

                    <Badge tone="success">All services are online</Badge>
                  </InlineStack>

                  <Box paddingBlockStart="300">
                    <Text as="p" alignment="center" tone="subdued">
                      © 2022–2026 DROPSHIPANDLE LLC. By using this app, you agree to the{" "}
                      <Link url={privacyUrl}>Privacy Policy</Link>.
                    </Text>
                  </Box>
                </Box>
              </Layout.Section>
            </Layout>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}