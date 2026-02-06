import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Modal,
  Tabs,
  Box,
  Badge,
  Divider,
} from "@shopify/polaris";

type TemplateCategory = "all" | "pricing" | "collections" | "ai";

type TemplateItem = {
  id: string;
  title: string;
  description: string;
  badge: {
    label: string;
    tone?: "info" | "success" | "warning" | "critical" | "attention" | "new";
  };
  category: TemplateCategory;
  onSelectPath: string;
};

function getBadgeTone(item: TemplateItem): TemplateItem["badge"]["tone"] {
  // Collections sempre laranja (Polaris: "attention")
  if (item.category === "collections") return "attention";
  return item.badge.tone ?? "info";
}

export default function Index() {
  var navigate = useNavigate();

  var [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  var [tabIndex, setTabIndex] = useState(0);

  // ✅ tabs corrigidos (tinhas "collection" duplicado e isso baralha o filtro)
  var tabs = useMemo(
    () => [
      { id: "all", content: "All categories", panelID: "templates-all" },
      { id: "ai", content: "AI", panelID: "templates-ai" },
      { id: "collections", content: "Collections", panelID: "templates-collections" },
      { id: "pricing", content: "Pricing", panelID: "templates-pricing" },
    ],
    [],
  );

  // ✅ ordem pedida:
  // 1) AI generator
  // 2) Criar coleção
  // 3) Secções de preços
  var allTemplates: TemplateItem[] = useMemo(
    () => [
      {
        id: "tmpl-ai-name-generator",
        title: "AI name generator",
        description:
          "Gera um novo título com estilo PT (ex.: nome feminino + ™), com preview antes de aplicar no Shopify.",
        badge: { label: "AI", tone: "success" },
        category: "ai",
        onSelectPath: "/app/titleedition",
      },
      {
        id: "tmpl-create-collections",
        title: "Criar coleções",
        description: "Cria coleções por texto separado por vírgulas (ex.: Meias,Sapatos,Chinelos).",
        badge: { label: "Collections", tone: "attention" },
        category: "collections",
        onSelectPath: "/app/colecaocreative",
      },
      {
        id: "tmpl-collection-discount",
        title: "Desconto por coleção",
        description:
          "Define o compareAtPrice a partir da % de desconto escolhida, mesmo quando está vazio, e mantém compareAt > price.",
        badge: { label: "Pricing", tone: "info" },
        category: "pricing",
        onSelectPath: "/app/descontocolecao",
      },
      {
        id: "tmpl-price-editor",
        title: "Editor de preço",
        description:
          "Forçar terminações (.95/.99) e arredondar por patamares (ex.: 30–34 → 34.xx) ao nível das variantes.",
        badge: { label: "Pricing", tone: "info" },
        category: "pricing",
        onSelectPath: "/app/productprices",
      },
    ],
    [],
  );

  var selectedCategory = (tabs[tabIndex]?.id || "all") as TemplateCategory;

  var filteredTemplates = useMemo(() => {
    if (selectedCategory === "all") return allTemplates;
    return allTemplates.filter((t) => t.category === selectedCategory);
  }, [allTemplates, selectedCategory]);

  var onCloseTemplates = useCallback(() => setIsTemplatesOpen(false), []);
  var onOpenTemplates = useCallback(() => setIsTemplatesOpen(true), []);
  var onTabChange = useCallback((index: number) => setTabIndex(index), []);

  function onSelectTemplate(item: TemplateItem) {
    setIsTemplatesOpen(false);
    navigate(item.onSelectPath);
  }

  return (
    <Page title="Welcome">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Get started
              </Text>

              <Text as="p" tone="subdued">
                Explore the task templates to get started with some examples.
              </Text>

              <Text as="p" tone="subdued">
                Please visit our help page if you need further assistance.
              </Text>

              <InlineStack align="end" gap="200">
                <Button onClick={() => navigate("/app/help")}>Help</Button>
                <Button variant="primary" onClick={onOpenTemplates}>
                  View templates
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={isTemplatesOpen}
        onClose={onCloseTemplates}
        title="Select a template"
        primaryAction={{
          content: "Close",
          onAction: onCloseTemplates,
        }}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">
              Choose a task template to use as a starting point.{" "}
              <em>This is a non-exhaustive list of examples.</em>
            </Text>

            <Tabs tabs={tabs} selected={tabIndex} onSelect={onTabChange}>
              <Box paddingBlockStart="200" paddingBlockEnd="200">
                <Divider />
              </Box>

              <BlockStack gap="200">
                {filteredTemplates.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No templates in this category.
                  </Text>
                ) : (
                  filteredTemplates.map((t) => (
                    <Box
                      key={t.id}
                      padding="300"
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="200"
                    >
                      <InlineStack align="space-between" blockAlign="start" gap="400">
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingSm">
                            {t.title}
                          </Text>
                          <Text as="p" tone="subdued">
                            {t.description}
                          </Text>
                        </BlockStack>

                        <BlockStack gap="200" align="end">
                          <Badge tone={getBadgeTone(t)}>{t.badge.label}</Badge>
                          <Button onClick={() => onSelectTemplate(t)}>Use template</Button>
                        </BlockStack>
                      </InlineStack>
                    </Box>
                  ))
                )}
              </BlockStack>
            </Tabs>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}