import type { ComponentChildren, JSX } from "preact";

interface WidgetBaseProps {
  size: "small" | "medium" | "large";
  accent?: string | null;
  children: ComponentChildren;
  class?: string;
}

const SIZE_CLASSES = {
  small: "widget--small",
  medium: "widget--medium",
  large: "widget--large",
};

export function WidgetBase({ size, accent, children, class: extraClass }: WidgetBaseProps) {
  return (
    <div
      class={["widget", SIZE_CLASSES[size], extraClass].filter(Boolean).join(" ")}
      style={accent ? { "--widget-accent": accent } as JSX.CSSProperties : undefined}
    >
      {accent && <div class="widget__accent" />}
      <div class="widget__content">{children}</div>
    </div>
  );
}
