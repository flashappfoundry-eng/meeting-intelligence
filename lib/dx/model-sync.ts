import * as React from "react";

export type ModelSyncProviderProps = {
  children?: React.ReactNode;
};

export function ModelSyncProvider(props: ModelSyncProviderProps) {
  return React.createElement(React.Fragment, null, props.children);
}

export type LLMTextProps = {
  value: string;
  children?: React.ReactNode;
};

export function LLMText(props: LLMTextProps) {
  void props.value;
  return React.createElement(React.Fragment, null, props.children);
}



