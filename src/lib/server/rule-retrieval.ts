import { cosineSimilarity, embed, embedMany } from "ai";
import type { AnalysisScope } from "../attendance";
import { activeRules, applicableRule, clubRules, keywordRules, type ClubRule } from "../rules";
import { createModel, type ModelConfig } from "./model";

export type RetrievedRules = {
  method: "vector" | "keyword";
  documents: ClubRule[];
  policy: ClubRule | null;
};

let index: { key: string; embeddings: Promise<number[][]> } | undefined;

function loadIndex(config: ModelConfig) {
  const key = `${config.baseURL} ${config.embedding}`;
  if (index?.key === key) return index.embeddings;

  const model = createModel(config).embeddingModel(config.embedding);
  const embeddings = embedMany({
    model,
    values: clubRules.map((rule) => `${rule.title}\n${rule.keywords.join(" ")}\n${rule.text}`),
    abortSignal: AbortSignal.timeout(12_000),
    maxRetries: 0,
  }).then((result) => result.embeddings);
  index = { key, embeddings };
  void embeddings.catch(() => {
    if (index?.embeddings === embeddings) index = undefined;
  });
  return embeddings;
}

export async function retrieveRules(
  question: string,
  scope: AnalysisScope,
  config: ModelConfig,
  signal: AbortSignal,
): Promise<RetrievedRules> {
  const policy = applicableRule(scope);
  const eligible = new Set(activeRules(scope).map((rule) => rule.id));

  try {
    const query = [question, scope.category, scope.channel].filter(Boolean).join(" ");
    const [vectors, { embedding }] = await Promise.all([
      loadIndex(config),
      embed({
        model: createModel(config).embeddingModel(config.embedding),
        value: query,
        abortSignal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        maxRetries: 0,
      }),
    ]);
    if (!embedding.length || vectors.length !== clubRules.length || vectors.some((vector) => vector.length !== embedding.length)) {
      throw new Error("Invalid embeddings");
    }

    const matches = clubRules.map((rule, position) => ({
      rule,
      score: cosineSimilarity(embedding, vectors[position]),
    })).filter(({ rule, score }) => eligible.has(rule.id) && !rule.criteria && Number.isFinite(score))
      .sort((a, b) => b.score - a.score);

    return { method: "vector", documents: [...(policy ? [policy] : []), ...matches.slice(0, 1).map(({ rule }) => rule)], policy };
  } catch {
    signal.throwIfAborted();
    return { method: "keyword", documents: keywordRules(question, scope), policy };
  }
}
