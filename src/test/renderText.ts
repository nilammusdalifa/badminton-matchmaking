import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Renders a component to the text a person would read: tags become spaces, entities are decoded, whitespace collapses. */
export function renderText(el: ReactElement): string {
  return renderToStaticMarkup(el)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
