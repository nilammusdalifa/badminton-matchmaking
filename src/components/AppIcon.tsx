interface AppIconProps {
  size?: number;
}

/** The SmashMatch mark — same PNG used for the browser/home-screen icon,
 * reused inline wherever the app shows its own logo. */
export function AppIcon({ size = 20 }: AppIconProps) {
  return <img src="/icon.png" alt="" width={size} height={size} style={{ display: "block", objectFit: "contain" }} />;
}
