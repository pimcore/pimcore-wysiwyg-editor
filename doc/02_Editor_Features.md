---
title: Editor Features
---

# Editor Features

## Toolbar

The toolbar appears once the field has focus and stays visible while a control inside it (the
link popover, the code view) is open.

| Control | What it does |
|---|---|
| Undo / Redo | The browser's own undo history; every toolbar edit except applying the code view is a single undoable step. |
| Format | A dropdown for the current block: Paragraph or Heading 1–6. |
| Bold / Italic | Toggles on the selection. A button lights up when the caret sits in bold or italic text, including inside a heading, without reporting a heading itself as bold. |
| Bulleted list / Numbered list | Toggles the current block into a list, or back to a paragraph. |
| Indent / Outdent | Nests the current list item under the one before it, or lifts it back out. Only available inside a list, and only where a preceding (indent) or a nesting (outdent) item exists. |
| Blockquote | Toggles the current block into a `<blockquote>`. |
| Horizontal rule | Inserts a rule at the caret. |
| Insert link | Opens a popover for a URL, described below. |
| Remove formatting | Clears inline formatting from the selection. |
| Paste as plain text | Inserts the clipboard's text content, stripped of formatting, at the caret. Requires clipboard-read permission; if the browser withholds it, the editor shows a message pointing at the OS paste shortcut instead. |
| Code view | Opens the raw HTML in a modal for direct editing. |

## Links

Clicking **Insert link** with the caret outside any link opens a popover with a URL field and
an optional label field, offering **Insert**. With text selected, the label field is hidden and
the selection becomes the link's text.

Clicking it with the caret **inside an existing link** instead prefills the popover with that
link's current URL and offers **Update**, changing the link in place rather than nesting a new
one inside it. The button itself is highlighted while the caret is in a link. A selection that
starts inside a link but extends past it is treated as new text to link, not as an edit of that
link.

## Dragging elements from the tree

Dragging a document, asset or object from the Studio element tree onto the editor inserts it at
the drop position:

- A **document** (page, hardlink or link — a type Pimcore can generate a public URL for)
  becomes a link, using the current selection as its label if there is one.
- An **asset** that is not an image, or a **data object**, likewise becomes a link.
- An **image asset**, dropped with nothing selected, is inserted as the image itself rather
  than a link to it. An image already small enough to display at full size keeps its original
  file; a larger one gets a thumbnail sized to fit the editor.

## Element links and images

A link or image inserted this way is stored as a tag carrying the attributes Pimcore matches to
resolve it:

```html
<a href="/en/news" pimcore_id="123" pimcore_type="document">Label</a>
<img src="…" alt="Logo.png" pimcore_id="9" pimcore_type="asset" width="600">
```

Those attributes are what lets Pimcore

- rewrite the link or image to the element's public URL on output, filling the path in whenever
  it rewrites the value, whether the existing one is wrong or missing altogether,
- record the element as a dependency, so the Dependencies tab lists it and deleting the element
  warns that it is still referenced,
- remap the id when a tree is copied or imported.

Changing a link's address through the **Update** popover drops these attributes, since Pimcore
would otherwise rewrite the new address back to the original element's path on output.

## Numbered list display

A nested numbered list is shown numbered by its parent item — `1.1`, `1.2` under item `1`, and
`1.1.1` a level further down — rather than every level restarting at `1`. This is purely how the
editor displays the list; the stored markup is an ordinary nested `<ol>`, and a page numbers its
own lists with its own styling.

## Stored value

The editor works in HTML and stores the HTML it produces, unconverted. A document editable
stores exactly what the editor sends, and Pimcore writes it into the page as it stands.

### What the backend does to a data object value

A **data object** field does not store the value untouched: on save it runs the value through
Pimcore's wysiwyg sanitizer and `Tool\Text::wysiwygText()`. Two consequences worth knowing:

- The sanitizer's `img` allow list is `class, id, alt, style, src`, so a `width` on an image is
  dropped before `wysiwygText()` can size a thumbnail from it. This affects any editor that sets
  a width, the classic one included, and is not specific to this bundle. Allowing it needs
  `framework.html_sanitizer` configuration in the project.
- Attributes and tags outside the sanitizer's allow list are removed as well; `pimcore_id` and
  `pimcore_type` are allowed, so element references survive.

The code view edits the same HTML the field submits. For a data object field, what ends up
stored is that HTML after the sanitizer and rewriting above have run, not necessarily
byte-for-byte what was typed.
