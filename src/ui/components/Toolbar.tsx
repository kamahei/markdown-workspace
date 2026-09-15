import type { ComponentChildren } from 'preact';

interface IconProps {
  path: string;
}

function Icon({ path }: IconProps) {
  return (
    <svg
      class="mw-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export const icons = {
  sidebar: 'M2 3h12v10H2zM6 3v10',
  reload: 'M14 8a6 6 0 1 1-1.8-4.3M14 2v4h-4',
  raw: 'M6 4 2.5 8 6 12M10 4l3.5 4L10 12',
  theme: 'M8 2a6 6 0 1 0 0 12A4.5 4.5 0 0 1 8 2z',
  workspace: 'M2 4.5h4.5l1.2 1.5H14v6.5H2zM2 4.5V12',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.6 10.6 14 14',
  close: 'M4 4l8 8M12 4l-8 8',
} as const;

interface ToolbarButtonProps {
  icon: keyof typeof icons;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  /** Shown next to the icon. Icon-only buttons rely on the label for a11y. */
  text?: string;
}

export function ToolbarButton({
  icon,
  label,
  onClick,
  pressed,
  text,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      class="mw-btn"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon path={icons[icon]} />
      {text ? <span>{text}</span> : null}
    </button>
  );
}

interface BreadcrumbProps {
  directory: string;
  name: string;
}

export function Breadcrumb({ directory, name }: BreadcrumbProps) {
  return (
    <div class="mw-breadcrumb">
      {/*
       * Direction is reversed so a long path truncates at the front, keeping
       * the part nearest the file visible. That is the half that identifies
       * the document.
       */}
      <span class="mw-breadcrumb-dir" title={directory}>
        {directory}
      </span>
      <span class="mw-breadcrumb-name">{name}</span>
    </div>
  );
}

interface ToolbarProps {
  children?: ComponentChildren;
  actions?: ComponentChildren;
}

export function Toolbar({ children, actions }: ToolbarProps) {
  return (
    <header class="mw-toolbar">
      {children}
      <div class="mw-toolbar-actions">{actions}</div>
    </header>
  );
}
