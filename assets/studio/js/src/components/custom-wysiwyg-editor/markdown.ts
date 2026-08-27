/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

/**
 * Conversion between the HTML the editor works in and the markdown it can persist:
 * markdown-it one way, turndown the other.
 */

import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'

const renderer = new MarkdownIt({
  // raw HTML must survive: it is what carries the Pimcore element references
  html: true,
  // the editor emits a newline per <br>, so a single newline has to stay a line break
  breaks: true,
  linkify: false
})

const serializer = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**'
})

/**
 * Links and images dropped from the element tree carry `pimcore_id` / `pimcore_type`, and markdown
 * link syntax has nowhere to put them — turndown would reduce such a link to `[Foo](/foo)` and lose
 * the reference Pimcore matches to rewrite it to a public URL on output. Keeping the original tag
 * preserves it, and inline HTML is valid markdown.
 */
serializer.addRule('pimcoreReference', {
  filter: (node) => node.hasAttribute('pimcore_id') || node.hasAttribute('pimcore_type'),
  replacement: (_content, node) => (node as HTMLElement).outerHTML
})

export const htmlToMarkdown = (html: string): string => serializer.turndown(html).trim()

export const markdownToHtml = (markdown: string): string => renderer.render(markdown).trim()
