export type Signal = {
  name: string;
  value: number;
};

export function createSignal(name: string, value: number): Signal {
  return { name, value };
}
