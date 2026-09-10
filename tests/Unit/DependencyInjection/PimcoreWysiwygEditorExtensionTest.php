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
use Pimcore\Bundle\WysiwygEditor\DependencyInjection\PimcoreWysiwygEditorExtension;
use Symfony\Component\Config\Definition\Exception\InvalidConfigurationException;
use Symfony\Component\DependencyInjection\ContainerBuilder;

class PimcoreWysiwygEditorExtensionTest extends Unit
{
    public function testLoadsWithoutConfiguration(): void
    {
        $container = new ContainerBuilder();

        (new PimcoreWysiwygEditorExtension())->load([], $container);

        $this->assertTrue($container->hasDefinition('Pimcore\Bundle\WysiwygEditor\Installer'));
    }

    /**
     * The bundle used to store markdown when told to. A project still carrying that setting must
     * learn about the change when its container is built, not by finding markdown on its pages.
     */
    public function testRejectsTheFormerPersistenceFormatOption(): void
    {
        $this->expectException(InvalidConfigurationException::class);
        $this->expectExceptionMessageMatches('/persistence_format/');

        (new PimcoreWysiwygEditorExtension())->load(
            [['persistence_format' => 'markdown']],
            new ContainerBuilder()
        );
    }
}
