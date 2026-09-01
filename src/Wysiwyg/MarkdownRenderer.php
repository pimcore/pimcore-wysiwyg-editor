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

namespace Pimcore\Bundle\WysiwygEditor\Wysiwyg;

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\MarkdownConverter;

/**
 * Renders a value stored as markdown into the HTML a page shows.
 *
 * The editor holds HTML and converts on the way in and out, so nothing turns the markdown back into
 * HTML once it leaves for a reader — a heading reaches the page as `# Heading 1`. This is that
 * missing step, and it follows CommonMark, the same specification the editor parses with.
 */
final class MarkdownRenderer
{
    /**
     * A link or image may address an element by id instead of by path — see the editor's own
     * reader. Both the long and the short form are accepted, as they are there.
     */
    private const ELEMENT_URI = '@(href|src)="pimcore:(?:link:)?(document|asset|object):(\d+)"@i';

    private const LINK_OR_IMAGE_TAG = '@<(?:a|img)\b[^>]*>@i';

    private MarkdownConverter $converter;

    public function __construct()
    {
        $environment = new Environment([
            // Raw HTML has to survive: the editor stores a quote as a tag, because a data object
            // save escapes a leading ">", and it stores anything else markdown cannot express the
            // same way. Dropping it here would silently lose that content.
            'html_input' => 'allow',
            'allow_unsafe_links' => false,
            'renderer' => [
                // The editor treats a single newline as a line break, since that is what it writes
                // for each <br>. CommonMark leaves one as whitespace, which a browser collapses, so
                // without this a break made in the editor disappears from the page.
                'soft_break' => "<br />\n",
            ],
        ]);
        $environment->addExtension(new CommonMarkCoreExtension());

        $this->converter = new MarkdownConverter($environment);
    }

    /**
     * Converts stored markdown into HTML, leaving element addresses as the attributes Pimcore
     * resolves. `Pimcore\Tool\Text::wysiwygText()` turns those into public paths afterwards, so a
     * link written as an address reaches a reader pointing at the element's real location.
     */
    public function toHtml(?string $markdown): string
    {
        if ($markdown === null || trim($markdown) === '') {
            return '';
        }

        return $this->resolveElementUris($this->converter->convert($markdown)->getContent());
    }

    private function resolveElementUris(string $html): string
    {
        return preg_replace_callback(self::LINK_OR_IMAGE_TAG, static function (array $tag): string {
            $element = $tag[0];

            if (
                preg_match(self::ELEMENT_URI, $element, $address) !== 1 ||
                preg_match('@\bpimcore_id=@i', $element) === 1
            ) {
                return $element;
            }

            [, , $type, $id] = $address;

            // an image is emitted self-closing, and dropping only the ">" would leave the slash
            // stranded in the middle of the tag
            $close = str_ends_with($element, '/>') ? '/>' : '>';
            $body = substr($element, 0, -strlen($close));

            // the address is dropped: Text::wysiwygText fills in the element's own path, and does so
            // whether the attribute is wrong or missing altogether
            $body = preg_replace(self::ELEMENT_URI, '', $body) ?? $body;
            $body = rtrim((string)preg_replace('@\s+@', ' ', $body));

            return sprintf(
                '%s pimcore_id="%s" pimcore_type="%s"%s',
                $body,
                $id,
                strtolower($type),
                $close === '/>' ? ' />' : '>'
            );
        }, $html) ?? $html;
    }
}
