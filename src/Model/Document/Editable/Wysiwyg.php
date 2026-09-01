<?php
declare(strict_types=1);

/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

namespace Pimcore\Bundle\WysiwygEditor\Model\Document\Editable;

use Pimcore;
use Pimcore\Bundle\WysiwygEditor\Wysiwyg\MarkdownRenderer;
use Pimcore\Bundle\WysiwygEditor\Wysiwyg\PersistenceFormat;
use Pimcore\Model\Document\Editable\Wysiwyg as BaseWysiwyg;
use Pimcore\Tool\Text;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Renders a value the editor stored as markdown.
 *
 * Pimcore writes an editable's value into the page as it stands, which is right for HTML and leaves
 * markdown to be read as `# Heading 1`. Registered in place of the built-in `wysiwyg` editable so
 * the value is converted on its way to a reader; with `persistence_format: html` the value is
 * already HTML and this behaves exactly as the built-in one.
 */
class Wysiwyg extends BaseWysiwyg
{
    public function frontend(): string
    {
        $text = $this->text;

        if ($this->persistsMarkdown()) {
            $text = $this->getMarkdownRenderer()->toHtml($text);
        }

        // element references are resolved to public paths afterwards, exactly as for stored HTML
        return Text::wysiwygText($text, [
            'document' => $this->getDocument(),
            'context' => $this,
        ]);
    }

    private function persistsMarkdown(): bool
    {
        $container = self::getContainerOrNull();
        $configured = $container?->hasParameter(PersistenceFormat::PARAMETER) === true
            ? (string)$container->getParameter(PersistenceFormat::PARAMETER)
            : PersistenceFormat::default()->value;

        return $configured === PersistenceFormat::Markdown->value;
    }

    private function getMarkdownRenderer(): MarkdownRenderer
    {
        $container = self::getContainerOrNull();

        if ($container?->has(MarkdownRenderer::class) === true) {
            /** @var MarkdownRenderer $renderer */
            $renderer = $container->get(MarkdownRenderer::class);

            return $renderer;
        }

        // the loader builds an editable with `new`, so there is nothing injected to fall back on
        return new MarkdownRenderer();
    }

    private static function getContainerOrNull(): ?ContainerInterface
    {
        // no kernel outside a request, and getContainer() dereferences it unguarded
        return Pimcore::getKernel() === null ? null : Pimcore::getContainer();
    }
}
