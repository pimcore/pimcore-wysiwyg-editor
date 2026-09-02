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

namespace Pimcore\Bundle\WysiwygEditor\Tests\Unit\DependencyInjection;

use Codeception\Test\Unit;
use Pimcore\Bundle\WysiwygEditor\DependencyInjection\Configuration;
use Pimcore\Bundle\WysiwygEditor\DependencyInjection\PimcoreWysiwygEditorExtension;
use Pimcore\Bundle\WysiwygEditor\Model\Document\Editable\Wysiwyg;
use Pimcore\Bundle\WysiwygEditor\Wysiwyg\PersistenceFormat;
use Symfony\Component\Config\Definition\Exception\InvalidConfigurationException;
use Symfony\Component\Config\Definition\Processor;
use Symfony\Component\DependencyInjection\ContainerBuilder;

class PimcoreWysiwygEditorExtensionTest extends Unit
{
    /**
     * Rendering markdown depends on this editable taking the place of the built-in one. Without the
     * mapping the built-in writes the value into the page as it stands, and markdown is read as its
     * own source.
     */
    public function testRegistersTheEditableInPlaceOfTheBuiltInOne(): void
    {
        $container = new ContainerBuilder();

        (new PimcoreWysiwygEditorExtension())->prepend($container);

        $configs = $container->getExtensionConfig('pimcore');
        $map = $configs[0]['documents']['editables']['map'] ?? [];

        $this->assertSame(Wysiwyg::class, $map['wysiwyg'] ?? null);
    }

    public function testStoresMarkdownUnlessConfiguredOtherwise(): void
    {
        $config = (new Processor())->processConfiguration(new Configuration(), []);

        $this->assertSame(PersistenceFormat::Markdown->value, $config['persistence_format']);
        $this->assertSame(PersistenceFormat::default()->value, $config['persistence_format']);
    }

    public function testKeepsTheConfiguredFormat(): void
    {
        $config = (new Processor())->processConfiguration(
            new Configuration(),
            [['persistence_format' => PersistenceFormat::Html->value]]
        );

        $this->assertSame(PersistenceFormat::Html->value, $config['persistence_format']);
    }

    public function testRejectsAFormatItCannotStore(): void
    {
        $this->expectException(InvalidConfigurationException::class);

        (new Processor())->processConfiguration(
            new Configuration(),
            [['persistence_format' => 'textile']]
        );
    }
}
