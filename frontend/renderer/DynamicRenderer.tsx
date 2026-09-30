export type DynamicRendererProps = {
  tree: unknown;
};

export function DynamicRenderer({ tree }: DynamicRendererProps) {
  return <div data-render-tree={JSON.stringify(tree)} />;
}
