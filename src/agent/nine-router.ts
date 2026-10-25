import { createProvider, envApiKeyAuth, type Api, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const DEFAULT_9ROUTER_BASE_URL = "http://127.0.0.1:20128/v1";

export function nineRouterBaseUrl(): string {
	const url = process.env.NINEROUTER_URL?.trim();
	if (!url) return DEFAULT_9ROUTER_BASE_URL;
	return url.endsWith("/v1") ? url : `${url}/v1`;
}

interface ModelMeta {
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input: ("text" | "image")[];
}

const KNOWN_METADATA: Record<string, Partial<ModelMeta>> = {
	gfa: { contextWindow: 1048576, maxTokens: 65536, reasoning: true, input: ["text", "image"] },
	deepseek: { contextWindow: 1000000, maxTokens: 384000, reasoning: true, input: ["text", "image"] },
	free: { contextWindow: 128000, maxTokens: 64000, reasoning: true, input: ["text"] },
	"ag/gemini-3.8-flash": { contextWindow: 1048576, maxTokens: 65536, reasoning: true, input: ["text", "image"] },
	"cmc/zai-org/GLM-5.2": { contextWindow: 1000000, maxTokens: 384000, reasoning: true, input: ["text"] },
	"cmc/deepseek/deepseek-v4-flash": { contextWindow: 1000000, maxTokens: 384000, reasoning: true, input: ["text"] },
	"nvidia/z-ai/glm-5.2": { contextWindow: 200000, maxTokens: 128000, reasoning: true, input: ["text"] },
	"gh/claude-haiku-4.5": { contextWindow: 200000, maxTokens: 64000, reasoning: true, input: ["text", "image"] },
	"gh/gpt-4o-mini": { contextWindow: 128000, maxTokens: 16384, reasoning: false, input: ["text", "image"] },
};

const modelMetaCache = new Map<string, ModelMeta>();

function resolveModelMeta(id: string, raw?: {
	context_length?: number;
	max_completion_tokens?: number;
	capabilities?: { contextWindow?: number; maxOutput?: number; reasoning?: boolean; vision?: boolean };
}): ModelMeta {
	const known = KNOWN_METADATA[id] ?? {};
	const cw = raw?.context_length ?? raw?.capabilities?.contextWindow ?? known.contextWindow ?? 128000;
	const mo = raw?.max_completion_tokens ?? raw?.capabilities?.maxOutput ?? known.maxTokens ?? 16384;
	const reasoning = raw?.capabilities?.reasoning ?? known.reasoning ?? true;
	const hasVision = raw?.capabilities?.vision ?? (known.input?.includes("image") ?? false);
	const input: ("text" | "image")[] = hasVision ? ["text", "image"] : ["text"];

	const meta: ModelMeta = {
		contextWindow: cw,
		maxTokens: mo,
		reasoning,
		input,
	};
	modelMetaCache.set(id, meta);
	return meta;
}

export function nineRouterModel(id: string): Model<"openai-completions"> {
	const baseUrl = nineRouterBaseUrl();
	const meta = modelMetaCache.get(id) ?? resolveModelMeta(id);
	return {
		id,
		name: id,
		provider: "9router",
		baseUrl,
		api: "openai-completions",
		reasoning: meta.reasoning,
		input: meta.input,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: meta.contextWindow,
		maxTokens: meta.maxTokens,
	};
}

export const DEFAULT_9ROUTER_MODELS = [
	"gfa",
	"free",
	"deepseek",
	"ag/gemini-3.8-flash",
	"cmc/zai-org/GLM-5.2",
	"cmc/deepseek/deepseek-v4-flash",
	"gh/gpt-4o-mini",
	"gh/claude-haiku-4.5",
	"nvidia/z-ai/glm-5.2",
];

export function nineRouterProvider() {
	const baseUrl = nineRouterBaseUrl();
	return createProvider({
		id: "9router",
		name: "9Router",
		baseUrl,
		auth: {
			apiKey: envApiKeyAuth("9Router API key", ["NINEROUTER_KEY", "OPENAI_API_KEY"]),
		},
		models: DEFAULT_9ROUTER_MODELS.map((id) => nineRouterModel(id)),
		fetchModels: async () => {
			try {
				const res = await fetch(`${nineRouterBaseUrl()}/models`);
				if (!res.ok) return DEFAULT_9ROUTER_MODELS.map((id) => nineRouterModel(id));
				const json = (await res.json()) as {
					data?: Array<{
						id: string;
						context_length?: number;
						max_completion_tokens?: number;
						capabilities?: { contextWindow?: number; maxOutput?: number; reasoning?: boolean; vision?: boolean };
					}>;
				};
				if (Array.isArray(json.data) && json.data.length > 0) {
					return json.data.map((m) => {
						resolveModelMeta(m.id, m);
						return nineRouterModel(m.id);
					});
				}
			} catch {
				/* fall back to default combo list */
			}
			return DEFAULT_9ROUTER_MODELS.map((id) => nineRouterModel(id));
		},
		api: openAICompletionsApi(),
	});
}
