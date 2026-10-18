import { startPythonRuntime, type PythonRuntimeProcess } from "./python-runtime.js";

export type ExampleServices = PythonRuntimeProcess;

export async function startExampleServices(options: {
  readonly host: string;
  readonly runtimePort: number;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ExampleServices> {
  return startPythonRuntime({ host: options.host, port: options.runtimePort, env: options.env });
}
