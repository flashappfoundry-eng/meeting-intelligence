export type WidgetHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  ctx: {
    baseUrl: string;
    userId?: string;
  },
) => Promise<TOutput> | TOutput;

export type WidgetConfig<TInput = unknown, TOutput = unknown> = {
  name: string;
  baseUrl: string;
  loadingMessage?: string;
  loadedMessage?: string;
  handler: WidgetHandler<TInput, TOutput>;
};

export type WidgetRegistry = Record<string, WidgetConfig<unknown, unknown>>;

export type WidgetServer = {
  __dxWidgets?: WidgetRegistry;
};

export function registerWidget<TServer extends object, TInput, TOutput>(
  server: TServer,
  config: WidgetConfig<TInput, TOutput>,
): TServer & Required<Pick<WidgetServer, "__dxWidgets">> {
  const s = server as TServer & WidgetServer;
  s.__dxWidgets ??= {};
  s.__dxWidgets[config.name] = config as WidgetConfig<unknown, unknown>;
  return s as TServer & Required<Pick<WidgetServer, "__dxWidgets">>;
}



