import type {
  AuthContextResourceV1,
  ModelProfileResourceV1,
  ModelProfileVersionId,
  ModelProfileVersionResourceV1,
  ModelProvider,
} from "@osva-ai/contracts";
import { isModelProvider } from "@osva-ai/contracts";
import type { OsvaHttpClient } from "@osva-ai/sdk";
import { requireEnv } from "@osva-examples/utils";

/**
 * OSVA 1.0 exposes model-profile registry types in `@osva-ai/contracts` but does not
 * ship a typed SDK resource client. These paths follow the same `/v1/<registry>` pattern
 * as agents, connectors, and knowledge sources.
 */
const MODEL_PROFILES_PATH = "/v1/model-profiles";

export async function resolveModelProfileVersionId(
  http: OsvaHttpClient,
  auth: AuthContextResourceV1,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ModelProfileVersionId> {
  const explicit = env.OSVA_MODEL_PROFILE_VERSION_ID?.trim();
  if (explicit !== undefined && explicit.length > 0) {
    return explicit as ModelProfileVersionId;
  }

  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || auth.workspaceId.slice(-8)).toLowerCase();
  const provider = parseModelProvider(env);
  const model = requireEnv("OSVA_EXAMPLE_MODEL_ID", env);

  const profile = await http.request<ModelProfileResourceV1>({
    method: "POST",
    path: MODEL_PROFILES_PATH,
    body: {
      key: `examples-model-${suffix}`,
      name: `Examples Model Profile ${suffix}`,
    },
  });

  const version = await http.request<ModelProfileVersionResourceV1>({
    method: "POST",
    path: `${MODEL_PROFILES_PATH}/${encodeURIComponent(profile.id)}/versions`,
    body: { provider, model },
  });

  return version.id;
}

function parseModelProvider(env: NodeJS.ProcessEnv): ModelProvider {
  const raw = requireEnv("OSVA_EXAMPLE_MODEL_PROVIDER", env).trim().toUpperCase();
  if (!isModelProvider(raw)) {
    throw new Error(
      `OSVA_EXAMPLE_MODEL_PROVIDER must be one of OPENAI, ANTHROPIC, or GOOGLE_GEMINI (received '${raw}').`,
    );
  }
  return raw;
}
