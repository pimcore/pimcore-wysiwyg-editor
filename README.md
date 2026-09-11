# Pimcore WYSIWYG Editor

A lightweight, dependency-free rich text editor for Pimcore Studio, replacing the built-in
plain `contentEditable` field with a proper toolbar and editing behavior — no third-party
editor library involved.

## Features in a Nutshell

- Formatting: bold, italic, headings 1–6, bulleted and numbered lists with indent/outdent,
  blockquote, horizontal rule, remove formatting.
- Links and images inserted by dragging a document, asset or object from the Studio element
  tree, or by URL through the toolbar; an existing link can be edited in place.
- A code view to inspect and edit the raw HTML directly.
- Paste as plain text, undo/redo, and full keyboard/focus behavior matching a native field.
- Stores plain HTML — the field's value is exactly what a document or data object shows.

## Documentation Overview
- [Installation](./doc/01_Installation.md)
- [Editor Features](./doc/02_Editor_Features.md)
