---
title: Installation
---

# Installation

:::info

This bundle is supported since Pimcore Platform version 2026, requiring Pimcore Studio.

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
