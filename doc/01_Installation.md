---
title: Installation
---

# Installation

:::info

This bundle requires Pimcore Platform version 2026.2 or later (`pimcore/pimcore` ^2026.1, `pimcore/studio-ui-bundle` ^2026.2) and Pimcore Studio.

:::

## Bundle Installation

To install the Pimcore WYSIWYG Editor bundle, follow the three steps below:

1) Install the required dependency:

```bash
composer require pimcore/pimcore-wysiwyg-editor
```

2) Make sure the bundle is enabled in the `config/bundles.php` file. The following line should
   be added:

```php
use Pimcore\Bundle\WysiwygEditor\PimcoreWysiwygEditor;
// ...
return [
    // ...
    PimcoreWysiwygEditor::class => ['all' => true],
    // ...
];
```

3) Install the bundle:

```bash
bin/console pimcore:bundle:install PimcoreWysiwygEditor
```

Once installed, the bundle replaces the wysiwyg field's editor everywhere Pimcore Studio
renders one — document editables, data object fields, translations, and the class editor's
default-value preview. No further configuration is needed, and no other wysiwyg bundle
(for example a TinyMCE bundle) should be active at the same time, since both would try to
render the same field.

## Frontend Build

The compiled Studio frontend ships as a single archive (`build-dist/build-<id>.zip`) rather than a
committed `public/studio/build/` directory. `pimcore/studio-ui-bundle` extracts it into
`public/studio/build/` automatically during cache warmup, so no extra step is needed for a
standard installation.

:::caution

Read-only filesystem deployments must run `bin/console cache:warmup` (or `cache:clear`) during the
build/deploy phase, while the bundle directory (usually under `vendor/`) is still writable. When
`assets:install` runs in copy mode, run `cache:warmup` before it, otherwise no frontend assets are
copied. If the filesystem becomes read-only before the first warmup, the bundle fails with
`BuildArchiveNotWritableException` because there is no build to serve.

:::
