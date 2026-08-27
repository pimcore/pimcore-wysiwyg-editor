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
 * Conversion between the HTML the editor works in and the markdown it can persist.
 *
 * markdown → HTML is markdown-it, configured to pass raw HTML through. The other direction has no
 * equivalent library (markdown-it only parses), so it is written here and covers what this editor
 * can produce: headings, bold, italic, lists (nested), blockquotes, links and images.
 *
 * Constructs markdown has no syntax for are carried as inline HTML, which markdown permits — that
 * is how links and images dropped from the element tree keep their `pimcore_id`/`pimcore_type`
 * attributes, the very thing Pimcore matches to rewrite them to public URLs on output.
 */

import MarkdownIt from 'markdown-it'

const renderer = new MarkdownIt({
  // raw HTML must survive: it is what carries the Pimcore element references
  html: true,
  // the editor emits a newline per <br>, so a single newline has to stay a line break
  breaks: true,
  linkify: false
})

/** Blocks that may sit inside a list item, which markdown has no syntax for. */
const BLOCK_IN_ITEM_PATTERN = /^(H[1-6]|BLOCKQUOTE)$/
/**
 * Indent per nesting level. CommonMark requires a nested list to start at or past the parent
 * item's content column — three characters for `1. `, so two spaces would not nest at all.
 */
const INDENT_WIDTH = 4

const escapeMarkdown = (text: string): string => text.replace(/([\\`*_[\]])/g, '\\$1')

const isElement = (node: Node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE

/** Elements markdown has no syntax for are emitted as-is. */
const keepAsHtml = (element: HTMLElement): string => element.outerHTML

const hasPimcoreReference = (element: HTMLElement): boolean =>
  element.hasAttribute('pimcore_id') || element.hasAttribute('pimcore_type')

const inlineToMarkdown = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdown(node.textContent ?? '')
  }

  if (!isElement(node)) {
    return ''
  }

  const children = Array.from(node.childNodes).map(inlineToMarkdown).join('')

  switch (node.nodeName) {
    case 'B':
    case 'STRONG':
      return children === '' ? '' : `**${children}**`
    case 'I':
    case 'EM':
      return children === '' ? '' : `*${children}*`
    case 'BR':
      return '\n'
    case 'A': {
      // an element reference has to survive the round trip, and only the raw tag carries it
      if (hasPimcoreReference(node)) {
        return keepAsHtml(node)
      }

      return `[${children}](${node.getAttribute('href') ?? ''})`
    }
    case 'IMG': {
      if (hasPimcoreReference(node)) {
        return keepAsHtml(node)
      }

      return `![${node.getAttribute('alt') ?? ''}](${node.getAttribute('src') ?? ''})`
    }
    default:
      return children
  }
}

const listToMarkdown = (list: HTMLElement, depth: number): string[] => {
  const ordered = list.nodeName === 'OL'
  const indent = ' '.repeat(depth * INDENT_WIDTH)
  const lines: string[] = []
  let index = 0

  Array.from(list.children).forEach((child) => {
    if (child.nodeName !== 'LI' || !isElement(child)) {
      return
    }

    index += 1

    const nestedLists = Array.from(child.children).filter((node) => node.nodeName === 'OL' || node.nodeName === 'UL')
    const ownContent = Array.from(child.childNodes)
      .filter((node) => !nestedLists.includes(node as Element))
      // markdown cannot express a heading or a quote inside a list item, so those keep their tags
      .map((node) => isElement(node) && BLOCK_IN_ITEM_PATTERN.test(node.nodeName)
        ? keepAsHtml(node)
        : inlineToMarkdown(node))
      .join('')
      .trim()

    lines.push(`${indent}${ordered ? `${index}.` : '-'} ${ownContent}`)

    nestedLists.forEach((nested) => {
      if (isElement(nested)) {
        lines.push(...listToMarkdown(nested, depth + 1))
      }
    })
  })

  return lines
}

const blockToMarkdown = (node: Node): string[] => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').trim()

    return text === '' ? [] : [escapeMarkdown(text)]
  }

  if (!isElement(node)) {
    return []
  }

  const headingMatch = /^H([1-6])$/.exec(node.nodeName)

  if (headingMatch !== null) {
    return [`${'#'.repeat(Number(headingMatch[1]))} ${inlineToMarkdown(node).trim()}`]
  }

  switch (node.nodeName) {
    case 'OL':
    case 'UL':
      return listToMarkdown(node, 0)
    case 'BLOCKQUOTE':
      return inlineToMarkdown(node)
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
    case 'P':
    case 'DIV': {
      const content = inlineToMarkdown(node).trim()

      return content === '' ? [] : [content]
    }
    case 'BR':
      return []
    default:
      return [keepAsHtml(node)]
  }
}

export const htmlToMarkdown = (html: string): string => {
  const container = document.createElement('div')
  container.innerHTML = html

  const blocks: string[] = []

  Array.from(container.childNodes).forEach((node) => {
    const lines = blockToMarkdown(node)

    if (lines.length > 0) {
      blocks.push(lines.join('\n'))
    }
  })

  return blocks.join('\n\n').trim()
}

export const markdownToHtml = (markdown: string): string => renderer.render(markdown).trim()
