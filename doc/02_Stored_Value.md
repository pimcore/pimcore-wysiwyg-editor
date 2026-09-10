---
title: Stored value
---

# Stored value

The editor works in HTML and stores the HTML it produces, unconverted. A document editable stores
exactly what the editor sends, and Pimcore writes it into the page as it stands.

## Element links and images

A document, asset or object dropped from the element tree is stored as a tag carrying the
attributes Pimcore matches to resolve it:

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

## What the backend does to a data object value

A **data object** field does not store the value untouched: on save it runs the value through
Pimcore's wysiwyg sanitizer and `Tool\Text::wysiwygText()`. Two consequences worth knowing:

- The sanitizer's `img` allow list is `class, id, alt, style, src`, so a `width` on an image is
  dropped before `wysiwygText()` can size a thumbnail from it. This affects any editor that sets a
  width, the classic one included, and is not specific to this bundle. Allowing it needs
  `framework.html_sanitizer` configuration in the project.
- Attributes and tags outside the sanitizer's allow list are removed as well; `pimcore_id` and
  `pimcore_type` are allowed, so element references survive.

The source view edits the same HTML the field stores, so what you edit is what is saved.
