---
title: Configuration
---

# Configuration

## Persistence format

The editor always works in HTML internally. `persistence_format` decides what it stores:

```yaml
# config/config.yaml
pimcore_wysiwyg_editor:
    persistence_format: markdown # markdown (default) | html
```

| Value | Stored value |
|---|---|
| `markdown` (default) | Markdown, converted on load and save |
| `html` | The HTML the editor produces, unconverted |

Constructs markdown has no syntax for are kept as inline HTML, which markdown allows. That covers
headings and quotes inside a list item, and — importantly — links and images dropped from the
element tree, whose `pimcore_id` / `pimcore_type` attributes are what lets Pimcore rewrite them to
public URLs on output.

### Choosing a format

`html` is the safer choice for **document editables**. Pimcore writes an editable's stored value
into the page as-is, so markdown would reach the frontend as literal `# text` unless the template
converts it first.

`markdown` suits values consumed by an API or rendered by a frontend that does its own markdown
conversion — a headless setup, for instance.

### Addressing an element by id

A link or image can address a Pimcore element by id, which is easier to write by hand than the
anchor with its attributes:

```markdown
[Link-Text](pimcore:link:document:12356)
[Datasheet](pimcore:link:asset:9)
![Alt](pimcore:asset:9)
```

`document`, `asset` and `object` are accepted, with or without the `link:` part. The address is only
an input form: it is turned into `pimcore_id` / `pimcore_type` when read, and only the tag is ever
written back, so a stored value never contains it. That matters, because those attributes are what
Pimcore matches for dependency tracking, link rewriting and id rewriting — an address left as a
plain URL would be invisible to all three.

The address does not need to name a path. Pimcore fills in the element's real one whenever it
rewrites the value, whether the existing path is wrong or missing altogether.

### What the backend does to a stored value

A **document editable** stores exactly what the editor sends.

A **data object** field does not: on save it runs the value through Pimcore's wysiwyg sanitizer and
`Tool\Text::wysiwygText()`. Two consequences worth knowing:

- Quotes are stored as `<blockquote>` rather than `> `. The sanitizer parses the value as HTML and
  escapes a leading `>`, which would lose the quote and add a backslash on every further save.
- The sanitizer's `img` allow list is `class, id, alt, style, src`, so a `width` on an image is
  dropped before `wysiwygText()` can size a thumbnail from it. This affects any editor that sets a
  width, the classic one included, and is not specific to this bundle. Allowing it needs
  `framework.html_sanitizer` configuration in the project.

The source view follows the setting: it edits markdown where the field stores markdown, and HTML
where it stores HTML, so what you edit is what is saved.

Changing the setting does not migrate anything: existing values stay in the format they were saved
in and will be read as though written in the new one.
