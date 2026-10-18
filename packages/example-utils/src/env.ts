export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

export function optionalPositiveIntEnv(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw.length === 0) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function parseJsonEnv<T = unknown>(name: string, fallback: T, env: NodeJS.ProcessEnv = process.env): T {
  const raw = env[name]?.trim();
  if (raw === undefined || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${name} must contain valid JSON.`);
  }
}
