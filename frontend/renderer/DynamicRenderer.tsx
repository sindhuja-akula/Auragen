export type DynamicRendererProps = {
  tree: unknown;
};

export function DynamicRenderer({ tree }: DynamicRendererProps) {
  return {
    type: 'div',
    props: {
      'data-render-tree': JSON.stringify(tree),
    },
  };
}
