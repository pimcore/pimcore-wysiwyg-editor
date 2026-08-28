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
 * An element reference is written as a `pimcore:` address, so a value stored as markdown is
 * markdown throughout rather than markdown with anchors embedded in it. Reading accepts the address
 * and the tag alike, so a value written either way still loads.
 *
 * The trade-off is deliberate and applies to markdown storage only, which `htmlToMarkdown` is the
 * sole entry point for. Pimcore finds element references by matching `pimcore_id` / `pimcore_type`
 * on a tag, so with an address in their place it no longer records the link as a dependency,
 * rewrites it to a public URL, or remaps it when ids change. See doc/02_Configuration.md.
 */
serializer.addRule('pimcoreReference', {
  filter: (node) => node.hasAttribute('pimcore_id') || node.hasAttribute('pimcore_type'),
  replacement: (content, node) => {
    const element = node as HTMLElement
    const id = element.getAttribute('pimcore_id') ?? ''
    const type = element.getAttribute('pimcore_type') ?? ''

    if (id === '' || type === '') {
      return element.outerHTML
    }

    const address = `pimcore:link:${type}:${id}`

    return element.tagName === 'IMG'
      ? `![${element.getAttribute('alt') ?? ''}](${address})`
      : `[${content}](${address})`
  }
})

/**
 * Quotes are kept as a tag rather than as `> `.
 *
 * A data object field runs its value through Pimcore's wysiwyg sanitizer on save, which parses it
 * as HTML and escapes a leading `>` to `&gt;`. The quote is lost on the next load, and because
 * turndown then escapes the stray entity, every further save adds another backslash. A
 * `<blockquote>` passes the sanitizer untouched — it is on its allow list — and markdown permits
 * the inline HTML.
 */
serializer.addRule('blockquoteAsHtml', {
  filter: 'blockquote',
  replacement: (_content, node) => (node as HTMLElement).outerHTML
})

/** `[Label](pimcore:link:document:123)`, and the shorter `pimcore:document:123`. */
const ELEMENT_URI_VALUE = /^pimcore:(?:link:)?(?:document|asset|object):\d+$/i
const ELEMENT_URI = /(?:href|src)="pimcore:(?:link:)?(document|asset|object):(\d+)"/i
const LINK_OR_IMAGE_TAG = /<(?:a|img)\b[^>]*>/gi

// markdown-it normalises link targets through mdurl, which reorders the last two segments of
// `pimcore:link:document:123` into `pimcore:link:123:document`. These addresses are ours to read,
// so they are passed through untouched.
const normalizeLink = renderer.normalizeLink.bind(renderer)
renderer.normalizeLink = (url: string): string => ELEMENT_URI_VALUE.test(url) ? url : normalizeLink(url)

/**
 * Turns a `pimcore:` address into the attributes Pimcore reads.
 *
 * Writing `[Label](pimcore:link:document:123)` by hand is far easier than writing the anchor with
 * its attributes, so both forms are accepted. Only the tag is ever *written* back, though — see
 * `htmlToMarkdown` — so a stored value never contains the address, and Pimcore's dependency
 * tracking, link rewriting and id rewriting, which all match on those attributes, keep working.
 *
 * The address itself is not kept as the href: Pimcore fills in the element's real path when it
 * rewrites the value, and does so whether that attribute is wrong or missing entirely. An image is
 * the exception — it needs a source the editor can load, which the caller resolves.
 */
const resolveElementUris = (html: string, resolveAssetSrc?: AssetSrcResolver): string =>
  html.replace(LINK_OR_IMAGE_TAG, (tag) => {
    const match = ELEMENT_URI.exec(tag)

    if (match === null || /\bpimcore_id=/i.test(tag)) {
      return tag
    }

    const [, type, id] = match
    const selfClosing = tag.endsWith('/>')
    const body = tag
      .slice(0, tag.length - (selfClosing ? 2 : 1))
      .replace(ELEMENT_URI, '')
      .replace(/\s+/g, ' ')
      .trimEnd()

    // An image needs a source the browser can actually load. Pimcore substitutes the element's own
    // path, but only when it renders the value for a reader - the editor never sees that, and an
    // img without a src shows nothing at all.
    const source = tag.startsWith('<img') && type.toLowerCase() === 'asset' && resolveAssetSrc !== undefined
      ? ` src="${resolveAssetSrc(Number(id))}"`
      : ''

    return `${body}${source} pimcore_id="${id}" pimcore_type="${type}"${selfClosing ? ' />' : '>'}`
  })

export const htmlToMarkdown = (html: string): string => serializer.turndown(html).trim()

/**
 * Builds a loadable URL for an asset the editor has only an id for. Supplied by the caller so this
 * module stays free of the Studio SDK, and so it can be exercised without one.
 */
export type AssetSrcResolver = (assetId: number) => string

export const markdownToHtml = (markdown: string, resolveAssetSrc?: AssetSrcResolver): string =>
  resolveElementUris(renderer.render(markdown).trim(), resolveAssetSrc)
