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

Either format renders correctly in a document. Pimcore writes an editable's stored value into the
page as it stands, which would show markdown as its own source, so the bundle replaces the built-in
`wysiwyg` editable with one that converts the value on its way to a reader. It parses CommonMark,
the same specification the editor itself parses, so a page shows what the editor showed.

What still differs is how an element link is stored — see the table above. Under `markdown` such a
link is invisible to Pimcore's dependency tracking, so `html` remains the safer choice where that
matters. `markdown` suits values consumed by an API or rendered by a frontend that converts the
markdown itself.

### Addressing an element by id

A link or image can address a Pimcore element by id, which is easier to write by hand than the
anchor with its attributes:

```markdown
[Link-Text](pimcore:link:document:12356)
[Datasheet](pimcore:link:asset:9)
![Alt](pimcore:asset:9)
```

`document`, `asset` and `object` are accepted, with or without the `link:` part. Reading turns an
address into `pimcore_id` / `pimcore_type`, and reading a tag works just as well, so a value written
either way loads correctly.

What gets *written* follows the format:

| `persistence_format` | An element link is stored as |
|---|---|
| `markdown` | `[Label](pimcore:link:document:123)` |
| `html` | `<a href="…" pimcore_id="123" pimcore_type="document">Label</a>` |

**This is the one place where `markdown` gives something up.** Pimcore finds element references by
matching `pimcore_id` / `pimcore_type` on a tag. An address is invisible to that, so under
`markdown` such a link is:

- not recorded as a dependency — the Dependencies tab stays empty, and deleting a linked element
  warns nobody that it is still referenced,
- not remapped when ids change, as when a tree is copied or imported.

The link itself still reaches a reader pointing at the right place: rendering turns the address into
the attributes Pimcore matches, so the URL is rewritten on output as it is for stored HTML. What is
missing is Pimcore's record of the reference, not the reference itself.

Choose `html` if those matter. Under `html`, Pimcore also fills in the element's real path whenever
it rewrites the value, whether the existing path is wrong or missing altogether.

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
