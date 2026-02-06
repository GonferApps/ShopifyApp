// app/routes/app.productprices.tsx
import type { LoaderFunctionArgs } from "react-router";
import React, { useMemo, useState, useCallback } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";

import {
  Page,
  Layout,
  Box,
  Text,
  TextField,
  InlineStack,
  BlockStack,
  Banner,
  Divider,
  Badge,
  Select,
  Modal,
  List,
  Icon,
} from "@shopify/polaris";

import { QuestionCircleIcon } from "@shopify/polaris-icons";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { ok: true };
}

type Category = "ai" | "collections" | "pricing";
type Mode = "force-cents" | "round-tiers";
type EndingChoice = "0.00" | "0.95" | "0.99";

type ApiResult = {
  ok: boolean;
  mode?: "force-cents" | "round-tiers";
  ending?: string;
  blockSize?: number;
  updated?: number;
  skipped?: number;
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
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
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

/** Card “flat” (borda leve, branco, raio pequeno) */
function TaskCard(props: { children: React.ReactNode }) {
  return (
    <Box
      borderColor="border"
      borderWidth="025"
      borderRadius="200"
      background="bg-surface"
      padding="400"
    >
      {props.children}
    </Box>
  );
}

function CatPill(props: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        appearance: "none",
        border: "1px solid #dfe3e8",
        borderRadius: 4,
        padding: "6px 12px",
        fontSize: 11,
        letterSpacing: 0.3,
        background: props.active ? props.color : "#ffffff",
        color: props.active ? "#111827" : "#4b5563",
        cursor: "pointer",
        lineHeight: 1,
      }}
    >
      {props.label}
    </button>
  );
}

/** ✅ Tip row reutilizável (sem "margin: auto" no ícone) */
function TipRow(props: { text: React.ReactNode }) {
  return (
    <InlineStack gap="200" blockAlign="center" wrap={false}>
      <span
        className="Polaris-Icon Polaris-Icon--toneSubdued"
        aria-hidden="true"
        style={{
          margin: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-start",
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 20 20" className="Polaris-Icon__Svg" focusable="false">
          <path d="M10 2a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-1.5 0v-.5a.75.75 0 0 1 .75-.75Z" />
          <path d="M5.58 4.167a.75.75 0 0 0-1.06 1.06l.353.354a.75.75 0 1 0 1.061-1.06l-.353-.354Z" />
          <path d="M2 9.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Z" />
          <path d="M16 9.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Z" />
          <path d="M15.657 5.404a.75.75 0 0 0-1.06-1.06l-.354.353a.75.75 0 1 0 1.06 1.06l.354-.353Z" />
          <path
            fillRule="evenodd"
            d="M6.474 5.998a4.987 4.987 0 0 1 7.052 0c.95.95 1.46 2.103 1.46 3.298 0 1.194-.51 2.348-1.46 3.297a4.45 4.45 0 0 1-.053.053c-.473.455-.723.866-.723 1.24v1.114a2.5 2.5 0 0 1-2.5 2.5h-.5a2.5 2.5 0 0 1-2.5-2.5v-1.114c0-.374-.25-.785-.722-1.24a4.312 4.312 0 0 1-.054-.053c-.95-.95-1.46-2.103-1.46-3.297 0-1.195.51-2.349 1.46-3.298Zm5.992 1.06a3.487 3.487 0 0 0-4.932 0c-.705.707-1.02 1.492-1.02 2.238 0 .745.315 1.53 1.02 2.236l.034.033c.366.353.788.836 1.015 1.435h2.834c.227-.6.649-1.082 1.015-1.435l.034-.033c.705-.706 1.02-1.491 1.02-2.236 0-.746-.315-1.531-1.02-2.237Zm-1.216 7.442h-2.5v.5a1 1 0 0 0 1 1h.5a1 1 0 0 0 1-1v-.5Z"
          />
        </svg>
      </span>

      <Text as="span" tone="subdued" variant="bodySm">
        {props.text}
      </Text>
    </InlineStack>
  );
}

export default function ProductPricesTaskPage() {
  useLoaderData<typeof loader>();
  var navigate = useNavigate();

  var [taskName, setTaskName] = useState("");
  var [category, setCategory] = useState<Category>("pricing");

  var [mode, setMode] = useState<Mode>("force-cents");
  var [ending, setEnding] = useState<EndingChoice>("0.99");
  var [blockSize, setBlockSize] = useState("5");

  var [isRunning, setIsRunning] = useState(false);
  var [result, setResult] = useState<ApiResult | null>(null);
  var [error, setError] = useState<string | null>(null);
  var [draftSaved, setDraftSaved] = useState(false);

  var [roundHelpOpen, setRoundHelpOpen] = useState(false);
  var openRoundHelp = useCallback(() => setRoundHelpOpen(true), []);
  var closeRoundHelp = useCallback(() => setRoundHelpOpen(false), []);

  var blockSizeOptions = useMemo(
    () => [
      { label: "5 (30–34 → 34.xx, 35–39 → 39.xx)", value: "5" },
      { label: "10 (30–39 → 39.xx, 40–49 → 49.xx)", value: "10" },
    ],
    [],
  );

  var onSaveDraft = useCallback(() => {
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2200);
  }, []);

  var statusTone = useMemo(() => {
    if (!result) return "info" as const;
    if ((result.errors?.length ?? 0) > 0) return "critical" as const;
    if ((result.updated ?? 0) > 0) return "success" as const;
    return "info" as const;
  }, [result]);

  var runForceCents = useCallback(async () => {
    setError(null);
    setResult(null);
    setIsRunning(true);

    try {
      var endingPayload = ending === "0.00" ? "no-cents" : ending;

      var data = await postJson<ApiResult>("/app/api/force-cents", {
        ending: endingPayload,
      });

      setResult({ ...data, mode: "force-cents" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setIsRunning(false);
    }
  }, [ending]);

  var runRoundTiers = useCallback(async () => {
    setError(null);
    setResult(null);
    setIsRunning(true);

    var parsedBlockSize = Number.parseInt(blockSize, 10);
    var safeBlockSize =
      Number.isFinite(parsedBlockSize) && parsedBlockSize > 0 ? parsedBlockSize : 5;

    try {
      var endingForRound = ending === "0.00" ? "0.95" : ending;

      var data = await postJson<ApiResult>("/app/api/round-tiers", {
        ending: endingForRound,
        blockSize: safeBlockSize,
      });

      setResult({ ...data, mode: "round-tiers" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setIsRunning(false);
    }
  }, [blockSize, ending]);

  var onRun = useCallback(async () => {
    if (mode === "round-tiers") {
      await runRoundTiers();
      return;
    }
    await runForceCents();
  }, [mode, runForceCents, runRoundTiers]);

  return (
    <Page>
      <Box paddingBlockEnd="300">
        <InlineStack align="end" gap="200">
          <button
            type="button"
            onClick={() => navigate("/app/help")}
            className="Polaris-Button Polaris-Button--pressable Polaris-Button--variantSecondary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"
          >
            Help
          </button>

          <button
            type="button"
            onClick={onSaveDraft}
            className="Polaris-Button Polaris-Button--pressable Polaris-Button--variantSecondary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"
          >
            Save
          </button>

          <button
            type="button"
            onClick={onRun}
            disabled={isRunning}
            className="Polaris-Button Polaris-Button--pressable Polaris-Button--variantPrimary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"
          >
            Run
          </button>
        </InlineStack>
      </Box>

      <Layout>
        <Layout.Section>
          <Box style={{ maxWidth: 980, margin: "0 auto" }}>
            <BlockStack gap="400">
              <TaskCard>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingXs">
                    NAME YOUR TASK
                  </Text>

                  <TextField
                    label=""
                    labelHidden
                    value={taskName}
                    onChange={setTaskName}
                    autoComplete="off"
                    placeholder=""
                  />

                  <Box paddingBlockStart="200">
                    <Text as="h2" variant="headingXs">
                      CATEGORIA
                    </Text>

                    <Box paddingBlockStart="150">
                      <InlineStack gap="150" blockAlign="center">
                        <CatPill
                          label="AI"
                          active={category === "ai"}
                          color="#a7f3d0"
                          onClick={() => setCategory("ai")}
                        />
                        <CatPill
                          label="COLLECTIONS"
                          active={category === "collections"}
                          color="#fde68a"
                          onClick={() => setCategory("collections")}
                        />
                        <CatPill
                          label="PRICING"
                          active={category === "pricing"}
                          color="#bfdbfe"
                          onClick={() => setCategory("pricing")}
                        />
                      </InlineStack>
                    </Box>
                  </Box>
                </BlockStack>
              </TaskCard>

              <TaskCard>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Choose item type to edit
                  </Text>

                  <Box paddingBlockStart="150">
                    <InlineStack gap="600" wrap={false}>
                      <div>
                        <label
                          className="Polaris-Choice Polaris-RadioButton__ChoiceLabel"
                          htmlFor="mode-force"
                        >
                          <span className="Polaris-Choice__Control">
                            <span className="Polaris-RadioButton">
                              <input
                                id="mode-force"
                                name="edit-mode"
                                type="radio"
                                className="Polaris-RadioButton__Input"
                                value="force-cents"
                                checked={mode === "force-cents"}
                                onChange={() => setMode("force-cents")}
                              />
                              <span className="Polaris-RadioButton__Backdrop" />
                            </span>
                          </span>

                          <span className="Polaris-Choice__Label">
                            <span className="Polaris-Text--root Polaris-Text--bodyMd">
                              Force Cents
                            </span>
                          </span>
                        </label>
                      </div>

                      <div>
                        <label
                          className="Polaris-Choice Polaris-RadioButton__ChoiceLabel"
                          htmlFor="mode-round"
                        >
                          <span className="Polaris-Choice__Control">
                            <span className="Polaris-RadioButton">
                              <input
                                id="mode-round"
                                name="edit-mode"
                                type="radio"
                                className="Polaris-RadioButton__Input"
                                value="round-tiers"
                                checked={mode === "round-tiers"}
                                onChange={() => setMode("round-tiers")}
                              />
                              <span className="Polaris-RadioButton__Backdrop" />
                            </span>
                          </span>

                          <span className="Polaris-Choice__Label">
                            <span className="Polaris-Text--root Polaris-Text--bodyMd">
                              Round Tiers
                            </span>
                          </span>
                        </label>
                      </div>
                    </InlineStack>
                  </Box>
                </BlockStack>
              </TaskCard>

              {mode === "force-cents" ? (
                <TaskCard>
                  <BlockStack gap="250">
                    <Text as="h2" variant="headingXs">
                      ALTERAR TERMINAÇÃO DE PREÇO (CASAS DECIMAIS)
                    </Text>

                    <Box paddingBlockStart="150">
                      <InlineStack align="space-between" gap="600" wrap={false}>
                        <div>
                          <label
                            className="Polaris-Choice Polaris-RadioButton__ChoiceLabel"
                            htmlFor="ending-00"
                          >
                            <span className="Polaris-Choice__Control">
                              <span className="Polaris-RadioButton">
                                <input
                                  id="ending-00"
                                  name="ending"
                                  type="radio"
                                  className="Polaris-RadioButton__Input"
                                  value="0.00"
                                  checked={ending === "0.00"}
                                  onChange={() => setEnding("0.00")}
                                />
                                <span className="Polaris-RadioButton__Backdrop" />
                              </span>
                            </span>

                            <span className="Polaris-Choice__Label">
                              <span className="Polaris-Text--root Polaris-Text--bodyMd">.00</span>
                            </span>
                            
                          </label>
                        </div>

                        <div>
                          <label
                            className="Polaris-Choice Polaris-RadioButton__ChoiceLabel"
                            htmlFor="ending-95"
                          >
                            <span className="Polaris-Choice__Control">
                              <span className="Polaris-RadioButton">
                                <input
                                  id="ending-95"
                                  name="ending"
                                  type="radio"
                                  className="Polaris-RadioButton__Input"
                                  value="0.95"
                                  checked={ending === "0.95"}
                                  onChange={() => setEnding("0.95")}
                                />
                                <span className="Polaris-RadioButton__Backdrop" />
                              </span>
                            </span>

                            <span className="Polaris-Choice__Label">
                              <span className="Polaris-Text--root Polaris-Text--bodyMd">.95</span>
                            </span>
                          </label>
                        </div>

                        <div>
                          <label
                            className="Polaris-Choice Polaris-RadioButton__ChoiceLabel"
                            htmlFor="ending-99"
                          >
                            <span className="Polaris-Choice__Control">
                              <span className="Polaris-RadioButton">
                                <input
                                  id="ending-99"
                                  name="ending"
                                  type="radio"
                                  className="Polaris-RadioButton__Input"
                                  value="0.99"
                                  checked={ending === "0.99"}
                                  onChange={() => setEnding("0.99")}
                                />
                                <span className="Polaris-RadioButton__Backdrop" />
                              </span>
                            </span>

                            <span className="Polaris-Choice__Label">
                              <span className="Polaris-Text--root Polaris-Text--bodyMd">.99</span>
                            </span>
                          </label>
                        </div>
                      </InlineStack>
                    </Box>

                    <Box paddingBlockStart="300">
                      <TipRow
                        text={
                          <>
                            Recomendamos para moedas com 3 ou mais dígitos usar a terminação{" "}
                            <strong>.00</strong> num preço mais clean.
                          </>
                        }
                      />
                    </Box>
                  </BlockStack>
                </TaskCard>
              ) : null}

              {mode === "round-tiers" ? (
                <>
                  <TaskCard>
                    <BlockStack gap="200">
                      <InlineStack gap="100" blockAlign="center" wrap={false}>
                        <Text as="h2" variant="headingXs">
                          ARREDONDAR POR PATAMARES (ROUND TIERS)
                        </Text>

                        <button
                          type="button"
                          onClick={openRoundHelp}
                          className="Polaris-Button Polaris-Button--pressable Polaris-Button--variantPlain Polaris-Button--sizeMedium Polaris-Button--textAlignCenter Polaris-Button--iconOnly"
                          aria-label="How do the conditions work?"
                          style={{ padding: 0, minWidth: "auto", height: "auto", lineHeight: 1 }}
                        >
                          <span className="Polaris-Button__Icon">
                            <span className="Polaris-Icon" style={{ margin: 0 }}>
                              <Icon source={QuestionCircleIcon} />
                            </span>
                          </span>
                        </button>
                      </InlineStack>

                      <Select
                        label="Patamares (block size)"
                        options={blockSizeOptions}
                        value={blockSize}
                        onChange={setBlockSize}
                        helpText="Usado apenas no Round tiers."
                      />
                    </BlockStack>
                  </TaskCard>

                  <Modal
                    open={roundHelpOpen}
                    onClose={closeRoundHelp}
                    title="How do the conditions work?"
                    primaryAction={{ content: "Close", onAction: closeRoundHelp }}
                  >
                    <Modal.Section>
                      <BlockStack gap="400">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Exemplos práticos de como o Round Tiers decide para onde arredondar.
                        </Text>

                        <Text as="h3" variant="headingMd">
                          Exemplo de 2 dígitos
                        </Text>
                        <List type="number">
                          <List.Item>
                            <Text as="p">
                              Preço: <strong>32.95</strong> → dígitos inteiros: <strong>2</strong> →
                              dígito alterado: <strong>1</strong>. Se for menor que 5 →{" "}
                              <strong>34.95</strong>.
                            </Text>
                          </List.Item>
                          <List.Item>
                            <Text as="p">
                              Preço: <strong>37.95</strong> → dígitos inteiros: <strong>2</strong> →
                              dígito alterado: <strong>1</strong>. Se for maior que 5 →{" "}
                              <strong>39.95</strong>.
                            </Text>
                          </List.Item>
                        </List>

                        <Text as="h3" variant="headingMd">
                          Exemplo de 3 dígitos
                        </Text>
                        <List type="number">
                          <List.Item>
                            <Text as="p">
                              Preço: <strong>332.95</strong> → dígitos inteiros: <strong>3</strong> →
                              dígito alterado: <strong>2</strong>. Se for menor que 50 →{" "}
                              <strong>349.95</strong>.
                            </Text>
                          </List.Item>
                          <List.Item>
                            <Text as="p">
                              Preço: <strong>377.95</strong> → dígitos inteiros: <strong>3</strong> →
                              dígito alterado: <strong>2</strong>. Se for maior que 50 →{" "}
                              <strong>399.95</strong>.
                            </Text>
                          </List.Item>
                        </List>

                        <Text as="h3" variant="headingMd">
                          Exemplo de 4 dígitos
                        </Text>
                        <List type="number">
                          <List.Item>
                            <Text as="p">
                              Preço: <strong>3232.95</strong> → dígitos inteiros: <strong>4</strong> →
                              dígito alterado: <strong>3</strong>. Se for menor que 500 →{" "}
                              <strong>3499.95</strong>.
                            </Text>
                          </List.Item>
                          <List.Item>
                            <Text as="p">
                              Preço: <strong>3877.95</strong> → dígitos inteiros: <strong>4</strong> →
                              dígito alterado: <strong>3</strong>. Se for maior que 50 →{" "}
                              <strong>3999.95</strong>.
                            </Text>
                          </List.Item>
                        </List>
                      </BlockStack>
                    </Modal.Section>
                  </Modal>
                </>
              ) : null}

              <TaskCard>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingXs">
                    AQUI PODE CRIAR A TAREFA OU GUARDAR EM RASCUNHO
                  </Text>

                  <InlineStack gap="200">
                    <button
                      type="button"
                      onClick={onRun}
                      disabled={isRunning}
                      className="Polaris-Button Polaris-Button--pressable Polaris-Button--variantPrimary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"
                    >
                      {mode === "round-tiers" ? "Run round tiers" : "Run"}
                    </button>

                    <button
                      type="button"
                      onClick={onSaveDraft}
                      className="Polaris-Button Polaris-Button--pressable Polaris-Button--variantSecondary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"
                    >
                      Save
                    </button>

                    {draftSaved ? (
                      <Box paddingInlineStart="200">
                        <Badge tone="success">Saved</Badge>
                      </Box>
                    ) : null}
                  </InlineStack>
                </BlockStack>
              </TaskCard>

              {error ? (
                <Banner tone="critical" title="Erro">
                  <p>{error}</p>
                </Banner>
              ) : null}

              {result ? (
                <TaskCard>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingSm">
                        Resultado
                      </Text>
                      <Badge tone={statusTone}>
                        {(result.errors?.length ?? 0) > 0
                          ? "Com erros"
                          : (result.updated ?? 0) > 0
                            ? "Aplicado"
                            : "Sem alterações"}
                      </Badge>
                    </InlineStack>

                    <Divider />

                    <Text as="p" tone="subdued">
                      <strong>Modo:</strong> {result.mode ?? mode} •{" "}
                      <strong>Updated:</strong> {result.updated ?? 0} •{" "}
                      <strong>Skipped:</strong> {result.skipped ?? 0}
                    </Text>

                    {result.errors && result.errors.length > 0 ? (
                      <Banner tone="warning" title="Avisos">
                        <ul>
                          {result.errors.slice(0, 10).map((msg, idx) => (
                            <li key={`${idx}-${msg}`}>{msg}</li>
                          ))}
                        </ul>
                      </Banner>
                    ) : null}
                  </BlockStack>
                </TaskCard>
              ) : null}
            </BlockStack>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}