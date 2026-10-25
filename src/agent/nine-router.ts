import { createProvider, envApiKeyAuth, type Api, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const DEFAULT_9ROUTER_BASE_URL = "http://127.0.0.1:20128/v1";

export function nineRouterBaseUrl(): string {
	const url = process.env.NINEROUTER_URL?.trim();
	if (!url) return DEFAULT_9ROUTER_BASE_URL;
	return url.endsWith("/v1") ? url : `${url}/v1`;
}

export function nineRouterModel(id: string): Model<"openai-completions"> {
	const baseUrl = nineRouterBaseUrl();
	return {
		id,
		name: id,
		provider: "9router",
		baseUrl,
		api: "openai-completions",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	};
}

export const DEFAULT_9ROUTER_MODELS = [
	"free",
	"gfa",
	"deepseek",
	"nvidia/z-ai/glm-5.2",
	"cmc/zai-org/GLM-5.2",
	"cmc/deepseek/deepseek-v4-flash",
	"gh/gpt-4o-mini",
	"gh/claude-haiku-4.5",
	"ag/gemini-3.8-flash",
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
				const json = (await res.json()) as { data?: Array<{ id: string }> };
				if (Array.isArray(json.data) && json.data.length > 0) {
					return json.data.map((m) => nineRouterModel(m.id));
				}
			} catch {
				/* fall back to default combo list */
			}
			return DEFAULT_9ROUTER_MODELS.map((id) => nineRouterModel(id));
		},
		api: openAICompletionsApi(),
	});
}
