"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiErrorMessage, parseJson } from "@/lib/api/client";
import {
  MAX_UPLOAD_BYTES,
  type IntentOption,
  type PublicDocument,
  type PublicExplanation,
  type PublicUnderstanding,
} from "@/lib/api/types";
import { ErrorNote, GhostButton, PrimaryButton } from "@/components/forms";

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: PublicDocument["status"]): string {
  switch (status) {
    case "VALIDATING":
      return "Checking PDF";
    case "UPLOADED":
      return "Queued";
    case "PROCESSING":
      return "Building understanding";
    case "READY":
      return "Ready";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

function PageChip({ page }: { page: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-2 py-0.5 text-xs font-medium text-forest">
      p. {page}
    </span>
  );
}

function ClaimGroup({
  title,
  claims,
}: {
  title: string;
  claims: PublicExplanation["claims"];
}) {
  if (claims.length === 0) {
    return null;
  }
  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-[0.22em] text-ink-soft">{title}</h3>
      <ul className="space-y-3">
        {claims.map((claim, index) => (
          <li key={`${claim.claimText}-${index}`} className="rounded-sm border border-ink/10 bg-paper-3 p-4">
            <p className="text-sm leading-relaxed text-ink">{claim.claimText}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {claim.pageNumber ? <PageChip page={claim.pageNumber} /> : null}
              {claim.conceptName ? (
                <span className="text-xs text-ink-soft">{claim.conceptName}</span>
              ) : null}
            </div>
            {claim.sourceExcerpt ? (
              <p className="mt-2 border-l-2 border-gold pl-3 text-xs italic text-ink-soft">
                {claim.sourceExcerpt}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function upsertDocument(list: PublicDocument[], next: PublicDocument): PublicDocument[] {
  const exists = list.some((item) => item.id === next.id);
  if (!exists) {
    return [next, ...list];
  }
  return list.map((item) => (item.id === next.id ? next : item));
}

export function CompanionStudio({ email }: { email: string }) {
  const router = useRouter();
  const [documents, setDocuments] = useState<PublicDocument[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [understanding, setUnderstanding] = useState<PublicUnderstanding | null>(null);
  const [intentOptions, setIntentOptions] = useState<IntentOption[]>([]);
  const [selectedIntent, setSelectedIntent] = useState<IntentOption | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [explanation, setExplanation] = useState<PublicExplanation | null>(null);
  const [busy, setBusy] = useState<"upload" | "intents" | "explain" | "signout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");

  const document = useMemo(
    () => documents.find((item) => item.id === selectedId) ?? null,
    [documents, selectedId],
  );

  function resetWorkspace() {
    setUnderstanding(null);
    setIntentOptions([]);
    setSelectedIntent(null);
    setCustomPrompt("");
    setExplanation(null);
    setError(null);
  }

  function selectDocument(id: string) {
    setSelectedId(id);
    resetWorkspace();
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/documents")
      .then(async (response) => {
        const payload = await parseJson<{ documents?: PublicDocument[]; error?: { message: string } }>(
          response,
        );
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setListError(apiErrorMessage(payload, "Could not load documents"));
          return;
        }
        setDocuments(payload.documents ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setListError("Could not load documents");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const documentId = selectedId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const response = await fetch(`/api/documents/${documentId}`);
      const payload = await parseJson<PublicDocument & { error?: { message: string } }>(response);
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setError(apiErrorMessage(payload, "Could not load this document"));
        return;
      }
      setDocuments((current) => upsertDocument(current, payload));
      if (payload.status === "READY" || payload.status === "FAILED") {
        return;
      }
      timer = setTimeout(() => {
        void poll();
      }, 2000);
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [selectedId]);

  const readyId = document?.status === "READY" ? document.id : null;

  useEffect(() => {
    if (!readyId) {
      return;
    }

    let cancelled = false;

    async function loadReady() {
      try {
        const [understandingRes, intentRes] = await Promise.all([
          fetch(`/api/documents/${readyId}/understanding`),
          fetch(`/api/documents/${readyId}/intent-options`),
        ]);
        const understandingPayload = await parseJson<
          PublicUnderstanding & { error?: { message: string } }
        >(understandingRes);
        const intentPayload = await parseJson<{
          options?: IntentOption[];
          error?: { message: string };
        }>(intentRes);
        if (cancelled) {
          return;
        }
        if (!understandingRes.ok) {
          throw new Error(apiErrorMessage(understandingPayload, "Understanding is not ready"));
        }
        if (!intentRes.ok) {
          throw new Error(apiErrorMessage(intentPayload, "Could not load intents"));
        }
        setUnderstanding(understandingPayload);
        setIntentOptions(intentPayload.options ?? []);
        setBusy((current) => (current === "intents" ? null : current));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load this material");
          setBusy((current) => (current === "intents" ? null : current));
        }
      }
    }

    void loadReady();
    return () => {
      cancelled = true;
    };
  }, [readyId]);

  async function onUpload(file: File) {
    setError(null);
    if (!isPdf(file)) {
      setError("Only PDF files are accepted.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("PDFs must be 20 MB or smaller.");
      return;
    }

    setBusy("upload");
    try {
      const form = new FormData();
      form.set("file", file);
      if (uploadTitle.trim()) {
        form.set("title", uploadTitle.trim());
      }
      const response = await fetch("/api/documents", {
        method: "POST",
        body: form,
      });
      const payload = await parseJson<PublicDocument & { error?: { message: string } }>(response);
      if (!response.ok) {
        setError(apiErrorMessage(payload, "Upload failed"));
        return;
      }
      setUploadTitle("");
      selectDocument(payload.id);
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onExplain() {
    if (!document) {
      return;
    }
    const option = selectedIntent;
    const prompt = option ? option.prompt : customPrompt.trim();
    const intentType = option ? option.intentType : "custom";
    if (!prompt) {
      setError("Choose an intent or write what you want explained.");
      return;
    }

    setBusy("explain");
    setError(null);
    try {
      const targetConceptId =
        option?.targetConceptName && understanding
          ? understanding.concepts.find(
              (concept) => concept.name.toLowerCase() === option.targetConceptName?.toLowerCase(),
            )?.id
          : undefined;
      const response = await fetch("/api/explanations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          intentType,
          prompt,
          targetConceptId,
          targetSection: option?.targetSection,
        }),
      });
      const payload = await parseJson<PublicExplanation & { error?: { message: string } }>(response);
      if (!response.ok) {
        setError(apiErrorMessage(payload, "Could not generate an explanation"));
        return;
      }
      setExplanation(payload);
    } catch {
      setError("Could not generate an explanation. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onSignOut() {
    setBusy("signout");
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const supported = useMemo(
    () => explanation?.claims.filter((claim) => claim.grounding === "supported") ?? [],
    [explanation],
  );
  const additions = useMemo(
    () => explanation?.claims.filter((claim) => claim.grounding === "explanatory_addition") ?? [],
    [explanation],
  );
  const analogies = useMemo(
    () => explanation?.claims.filter((claim) => claim.grounding === "analogy") ?? [],
    [explanation],
  );

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 px-6 py-5 lg:px-10">
        <div>
          <p className="font-serif text-2xl tracking-[0.18em] text-forest">KLARSINN</p>
          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-ink-soft">Companion</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-ink-soft">{email}</span>
          <GhostButton type="button" onClick={() => void onSignOut()} disabled={busy === "signout"}>
            Sign out
          </GhostButton>
        </div>
      </header>

      <div className="grid gap-8 px-6 py-8 lg:grid-cols-[minmax(16rem,20rem)_1fr] lg:px-10">
        <aside className="space-y-6">
          <section className="rounded-sm border border-ink/10 bg-paper-3 p-5 shadow-lift">
            <h2 className="font-serif text-xl text-forest">Upload a PDF</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Academic PDFs only, up to 20 MB and 50 pages. The file stays private; the companion never
              exposes a download URL.
            </p>
            <label className="mt-4 block text-sm font-medium">
              Title (optional)
              <input
                className="mt-2 h-10 w-full rounded-sm border border-ink/15 bg-paper px-3 text-sm outline-none focus:border-gold"
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Leave blank to use the filename"
              />
            </label>
            <label
              className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-sm border border-dashed border-gold/60 bg-paper px-4 py-8 text-center"
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) {
                  void onUpload(file);
                }
              }}
            >
              <span className="text-sm font-medium text-forest">Choose PDF</span>
              <span className="mt-1 text-xs text-ink-soft">or drop a file here</span>
              <input
                className="sr-only"
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy === "upload"}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void onUpload(file);
                  }
                }}
              />
            </label>
            {busy === "upload" ? <p className="mt-3 text-sm text-ink-soft">Uploading…</p> : null}
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-[0.22em] text-ink-soft">Your materials</h2>
            {listError ? <ErrorNote message={listError} /> : null}
            {documents.length === 0 && !listError ? (
              <p className="mt-3 text-sm text-ink-soft">No PDFs yet. Upload one to begin.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {documents.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => selectDocument(item.id)}
                      className={`w-full rounded-sm border px-3 py-3 text-left text-sm transition ${
                        selectedId === item.id
                          ? "border-gold bg-gold-soft/40"
                          : "border-ink/10 bg-paper-3 hover:border-gold/50"
                      }`}
                    >
                      <span className="block font-medium text-ink">{item.title}</span>
                      <span className="mt-1 block text-xs text-ink-soft">
                        {statusLabel(item.status)}
                        {item.pageCount ? ` · ${item.pageCount} pages` : ""} · {formatBytes(item.byteSize)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <main className="min-w-0 space-y-8">
          <ErrorNote message={error} />

          {!document && selectedId ? (
            <section className="rounded-sm border border-ink/10 bg-paper-3 p-8">
              <p className="text-sm text-ink-soft">Loading this PDF…</p>
            </section>
          ) : null}

          {!document && !selectedId ? (
            <section className="rounded-sm border border-ink/10 bg-paper-3 p-8">
              <h1 className="font-serif text-3xl text-forest">Start with the source</h1>
              <p className="mt-3 max-w-xl text-ink-soft">
                Upload a paper, chapter, or notes. KLARSINN reads the pages, builds a structured
                understanding, then explains only what you ask for — with page references back to the
                upload.
              </p>
            </section>
          ) : null}

          {document && document.status !== "READY" && document.status !== "FAILED" ? (
            <section className="rounded-sm border border-ink/10 bg-paper-3 p-8">
              <p className="text-xs uppercase tracking-[0.22em] text-gold">{statusLabel(document.status)}</p>
              <h1 className="mt-2 font-serif text-3xl text-forest">{document.title}</h1>
              <p className="mt-3 text-ink-soft">
                The companion is reading this PDF and grounding concepts to pages. This is not a
                summary pass — explanations stay locked until understanding is ready.
              </p>
              <div className="mt-6 h-1 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full w-2/3 animate-pulse bg-gold" />
              </div>
            </section>
          ) : null}

          {document?.status === "FAILED" ? (
            <section className="rounded-sm border border-clay/30 bg-clay/10 p-8">
              <h1 className="font-serif text-3xl text-forest">{document.title}</h1>
              <p className="mt-3 text-clay">
                {document.failureMessage ?? "This PDF could not be processed. Try another file within 20 MB and 50 pages."}
              </p>
            </section>
          ) : null}

          {document?.status === "READY" ? (
            <section className="space-y-6">
              <div className="rounded-sm border border-ink/10 bg-paper-3 p-8">
                <p className="text-xs uppercase tracking-[0.22em] text-gold">Understood</p>
                <h1 className="mt-2 font-serif text-3xl text-forest">
                  {understanding?.inferredTitle ?? document.title}
                </h1>
                {understanding?.overview ? (
                  <p className="mt-4 max-w-3xl leading-relaxed text-ink">{understanding.overview}</p>
                ) : null}
                {understanding && understanding.concepts.length > 0 ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {understanding.concepts.slice(0, 8).map((concept) => (
                      <span
                        key={concept.id}
                        className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-3 py-1 text-xs"
                      >
                        {concept.name}
                        {concept.pageNumbers.map((page) => (
                          <PageChip key={page} page={page} />
                        ))}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-sm border border-ink/10 bg-paper-3 p-8">
                <h2 className="font-serif text-2xl text-forest">What do you want explained?</h2>
                <p className="mt-2 text-sm text-ink-soft">
                  Intents are generated from this document. Choose one, or write a custom request.
                </p>
                {!understanding && !error ? (
                  <p className="mt-4 text-sm text-ink-soft">Loading intents…</p>
                ) : (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {intentOptions.map((option) => (
                      <button
                        key={`${option.intentType}-${option.label}`}
                        type="button"
                        onClick={() => {
                          setSelectedIntent(option);
                          setCustomPrompt("");
                          setExplanation(null);
                        }}
                        className={`rounded-sm border p-4 text-left transition ${
                          selectedIntent?.label === option.label &&
                          selectedIntent.prompt === option.prompt
                            ? "border-gold bg-gold-soft/40"
                            : "border-ink/10 hover:border-gold/60"
                        }`}
                      >
                        <span className="block font-medium text-ink">{option.label}</span>
                        <span className="mt-1 block text-sm text-ink-soft">{option.prompt}</span>
                      </button>
                    ))}
                  </div>
                )}
                <label className="mt-6 block text-sm font-medium">
                  Custom request
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-sm border border-ink/15 bg-paper p-3 text-sm outline-none focus:border-gold"
                    value={selectedIntent ? "" : customPrompt}
                    onChange={(event) => {
                      setCustomPrompt(event.target.value);
                      setSelectedIntent(null);
                      setExplanation(null);
                    }}
                    placeholder="Ask for a specific section, definition, or confusion to clear up."
                  />
                </label>
                <PrimaryButton
                  className="mt-5"
                  type="button"
                  disabled={busy === "explain"}
                  onClick={() => void onExplain()}
                >
                  {busy === "explain" ? "Writing explanation…" : "Explain from this source"}
                </PrimaryButton>
              </div>
            </section>
          ) : null}

          {explanation ? (
            <article className="space-y-8 rounded-sm border border-ink/10 bg-paper-3 p-8">
              <header>
                <p className="text-xs uppercase tracking-[0.22em] text-gold">Personalized explanation</p>
                <h2 className="mt-2 font-serif text-3xl text-forest">{explanation.intent.prompt}</h2>
                {explanation.personalizationNote ? (
                  <p className="mt-3 text-sm text-ink-soft">{explanation.personalizationNote}</p>
                ) : null}
                {explanation.usedInterest ? (
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-moss">
                    Analogy interest: {explanation.usedInterest}
                  </p>
                ) : null}
              </header>
              <div className="space-y-4 text-base leading-relaxed text-ink">
                {explanation.content.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
              <HairlineClaims />
              <ClaimGroup title="Supported by the source" claims={supported} />
              <ClaimGroup title="Explanatory additions" claims={additions} />
              <ClaimGroup title="Analogies" claims={analogies} />
            </article>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function HairlineClaims() {
  return <div className="h-px w-full bg-ink/10" />;
}
