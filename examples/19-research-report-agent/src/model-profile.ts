import type { ModelProfileVersionId, ModelProvider } from "@osva-ai/contracts";
import { isModelProvider } from "@osva-ai/contracts";
import type { OsvaClient } from "@osva-ai/sdk";
import { requireEnv } from "@osva-examples/utils";

export async function resolveModelProfileVersionId(
  client: OsvaClient,
  suffix: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ModelProfileVersionId> {
  const explicit = env.OSVA_MODEL_PROFILE_VERSION_ID?.trim();
  if (explicit !== undefined && explicit.length > 0) {
    return explicit as ModelProfileVersionId;
  }

  const provider = parseModelProvider(env);
  const model = requireEnv("OSVA_EXAMPLE_MODEL_ID", env);

  const profile = await client.modelProfiles.create({
    key: `examples-research-model-${suffix}`,
    name: `Examples Research Model ${suffix}`,
  });

  const version = await client.modelProfiles.createVersion(profile.id, { provider, model });

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
