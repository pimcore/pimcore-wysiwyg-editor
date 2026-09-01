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

namespace Pimcore\Bundle\WysiwygEditor\Tests\Unit\Wysiwyg;

use Codeception\Test\Unit;
use Pimcore\Bundle\WysiwygEditor\Wysiwyg\MarkdownRenderer;

class MarkdownRendererTest extends Unit
{
    private MarkdownRenderer $renderer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->renderer = new MarkdownRenderer();
    }

    /**
     * The reported case: a heading typed into the source view reached the page as `# Heading 1`.
     */
    public function testRendersAHeadingRatherThanItsMarkdown(): void
    {
        $html = $this->renderer->toHtml('# Heading 1');

        $this->assertStringContainsString('<h1>Heading 1</h1>', $html);
        $this->assertStringNotContainsString('# Heading 1', $html);
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public function markdownProvider(): array
    {
        return [
            'heading level 2' => ['## Heading 2', '<h2>Heading 2</h2>'],
            'heading level 6' => ['###### Heading 6', '<h6>Heading 6</h6>'],
            'bold' => ['Some **bold** text', '<strong>bold</strong>'],
            'italic' => ['Some *italic* text', '<em>italic</em>'],
            'paragraph' => ['Just text', '<p>Just text</p>'],
            'unordered list' => ["- alpha\n- beta", '<li>alpha</li>'],
            'ordered list' => ["1. one\n2. two", '<ol>'],
            'plain link' => ['[Site](https://example.com)', '<a href="https://example.com">Site</a>'],
        ];
    }

    /**
     * @dataProvider markdownProvider
     */
    public function testRendersMarkdownConstructs(string $markdown, string $expected): void
    {
        $this->assertStringContainsString($expected, $this->renderer->toHtml($markdown));
    }

    public function testRendersANestedListAsNestedMarkup(): void
    {
        $html = $this->renderer->toHtml("1.  A\n    1.  B\n2.  C");

        // B belongs inside A's item, not as a sibling of it
        $this->assertMatchesRegularExpression('@<li>A\s*<ol>\s*<li>B</li>\s*</ol>\s*</li>@', $html);
    }

    /**
     * The editor stores a quote as a tag, since a data object save escapes a leading `>`. Dropping
     * raw HTML here would lose it, along with anything else markdown cannot express.
     */
    public function testKeepsInlineHtml(): void
    {
        $html = $this->renderer->toHtml('<blockquote>quoted text</blockquote>');

        $this->assertStringContainsString('<blockquote>quoted text</blockquote>', $html);
    }

    public function testKeepsInlineHtmlAlongsideMarkdown(): void
    {
        $html = $this->renderer->toHtml("# Title\n\n<blockquote>note</blockquote>");

        $this->assertStringContainsString('<h1>Title</h1>', $html);
        $this->assertStringContainsString('<blockquote>note</blockquote>', $html);
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: string}>
     */
    public function elementAddressProvider(): array
    {
        return [
            'document, long form' => ['[Label](pimcore:link:document:12356)', '12356', 'document'],
            'document, short form' => ['[Label](pimcore:document:12356)', '12356', 'document'],
            'asset' => ['[Datasheet](pimcore:link:asset:9)', '9', 'asset'],
            'object' => ['[Product](pimcore:link:object:42)', '42', 'object'],
        ];
    }

    /**
     * An element address carries the attributes Pimcore matches to resolve a link to its public
     * path. Without them the link would reach a reader pointing at `pimcore:link:…`.
     *
     * @dataProvider elementAddressProvider
     */
    public function testTurnsAnElementAddressIntoAttributesPimcoreResolves(
        string $markdown,
        string $expectedId,
        string $expectedType
    ): void {
        $html = $this->renderer->toHtml($markdown);

        $this->assertStringContainsString(sprintf('pimcore_id="%s"', $expectedId), $html);
        $this->assertStringContainsString(sprintf('pimcore_type="%s"', $expectedType), $html);
        $this->assertStringNotContainsString('pimcore:link:', $html);
        $this->assertStringNotContainsString('href="pimcore:', $html);
    }

    public function testTurnsAnImageAddressIntoAttributesPimcoreResolves(): void
    {
        $html = $this->renderer->toHtml('![Alt](pimcore:link:asset:9)');

        $this->assertStringContainsString('<img', $html);
        $this->assertStringContainsString('alt="Alt"', $html);
        $this->assertStringContainsString('pimcore_id="9"', $html);
        $this->assertStringContainsString('pimcore_type="asset"', $html);
        $this->assertStringNotContainsString('src="pimcore:', $html);
    }

    /**
     * An image is emitted self-closing, and the address sits among its attributes; removing it has
     * to leave a tag a browser can still parse.
     */
    public function testLeavesAnImageTagWellFormed(): void
    {
        $html = $this->renderer->toHtml('![Alt](pimcore:link:asset:9)');

        $this->assertMatchesRegularExpression('@<img(?: [a-z_]+="[^"]*")+ ?/>@', $html);
        // a slash stranded among the attributes rather than closing the tag
        $this->assertStringNotContainsString('/ pimcore_id', $html);
        $this->assertDoesNotMatchRegularExpression('@<img\s\s@', $html);
    }

    public function testLeavesALinkTagWellFormed(): void
    {
        $html = $this->renderer->toHtml('[Label](pimcore:link:document:12)');

        $this->assertStringContainsString('<a pimcore_id="12" pimcore_type="document">Label</a>', $html);
    }

    /**
     * The editor writes a single newline for each `<br>`, so one has to come back as a line break.
     * Left as CommonMark's default a browser would collapse it into a space.
     */
    public function testRendersASingleNewlineAsALineBreak(): void
    {
        $html = $this->renderer->toHtml("line one\nline two");

        $this->assertStringContainsString('<br', $html);
        $this->assertStringContainsString('line one', $html);
        $this->assertStringContainsString('line two', $html);
    }

    public function testKeepsSeparateParagraphsSeparate(): void
    {
        $html = $this->renderer->toHtml("first\n\nsecond");

        $this->assertSame(2, substr_count($html, '<p>'));
    }

    public function testLeavesAnOrdinaryLinkAlone(): void
    {
        $html = $this->renderer->toHtml('[Site](https://example.com)');

        $this->assertStringNotContainsString('pimcore_id', $html);
        $this->assertStringContainsString('href="https://example.com"', $html);
    }

    /**
     * A value written as HTML already carries the attributes; they must not be doubled.
     */
    public function testLeavesAnExistingReferenceUntouched(): void
    {
        $stored = '<a href="/foo" pimcore_id="12" pimcore_type="document">Foo</a>';

        $html = $this->renderer->toHtml($stored);

        $this->assertSame(1, substr_count($html, 'pimcore_id="12"'));
        $this->assertStringContainsString('href="/foo"', $html);
    }

    /**
     * @return array<string, array{0: string|null}>
     */
    public function emptyValueProvider(): array
    {
        return [
            'null' => [null],
            'empty string' => [''],
            'whitespace only' => ["  \n  "],
        ];
    }

    /**
     * @dataProvider emptyValueProvider
     */
    public function testRendersAnEmptyValueAsAnEmptyString(?string $value): void
    {
        $this->assertSame('', $this->renderer->toHtml($value));
    }

    public function testDoesNotLinkAJavascriptUrl(): void
    {
        $html = $this->renderer->toHtml('[x](javascript:alert%281%29)');

        $this->assertStringNotContainsString('href="javascript:', $html);
    }
}
