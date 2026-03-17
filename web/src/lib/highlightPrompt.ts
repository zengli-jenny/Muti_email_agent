import { escapeHtml } from '@/lib/utils'

/**
 * Lightweight syntax highlighting for prompt text.
 * Returns an HTML string for use with dangerouslySetInnerHTML.
 */
export function highlightPrompt(text: string): string {
  let html = escapeHtml(text)

  // # Headings
  html = html.replace(
    /^(#{1,3}\s.*)$/gm,
    '<span class="font-bold text-accent">$1</span>'
  )

  // `backtick vars`
  html = html.replace(
    /`([^`]+)`/g,
    '<span class="bg-accent-light/50 text-accent-hover rounded px-0.5">`$1`</span>'
  )

  // - list item dashes
  html = html.replace(
    /^(\s*)(-)(\s)/gm,
    '$1<span class="text-accent">-</span>$3'
  )

  return html
}
