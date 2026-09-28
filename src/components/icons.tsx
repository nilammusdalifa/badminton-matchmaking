import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function UsersIcon(props: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" strokeWidth="2.75" {...base} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function SessionNavIcon(props: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth="2.2" {...base} {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function MatchesNavIcon(props: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth="2.2" {...base} {...props}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 2v4M16 2v4" />
    </svg>
  );
}

export function RankingsNavIcon(props: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth="2.2" {...base} {...props}>
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M5 6H3a2 2 0 0 0 2 4M19 6h2a2 2 0 0 1-2 4" />
    </svg>
  );
}

export function ManageNavIcon(props: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth="2.2" {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function ShareNodesIcon(props: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" strokeWidth="2.75" {...base} {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.6l6.8-3.8M8.6 13.4l6.8 3.8" />
    </svg>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" {...base} {...props}>
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H4v1a4 4 0 0 0 4 4M16 5h4v1a4 4 0 0 1-4 4" />
      <path d="M10 15v2M14 15v2" />
      <path d="M8 21h8M9 21v-2.5a3 3 0 0 1 3-3 3 3 0 0 1 3 3V21" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2.2" {...base} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
