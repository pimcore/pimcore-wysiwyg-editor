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

namespace Pimcore\Bundle\WysiwygEditor\DependencyInjection;

use Pimcore\Bundle\WysiwygEditor\Model\Document\Editable\Wysiwyg;
use Pimcore\Bundle\WysiwygEditor\Wysiwyg\PersistenceFormat;
use Symfony\Component\Config\FileLocator;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Extension\PrependExtensionInterface;
use Symfony\Component\DependencyInjection\Loader\YamlFileLoader;
use Symfony\Component\HttpKernel\DependencyInjection\Extension;

/**
 * @internal
 */
class PimcoreWysiwygEditorExtension extends Extension implements PrependExtensionInterface
{
    public function load(array $configs, ContainerBuilder $container): void
    {
        $config = $this->processConfiguration(new Configuration(), $configs);

        $container->setParameter(PersistenceFormat::PARAMETER, $config['persistence_format']);

        $loader = new YamlFileLoader($container, new FileLocator(__DIR__ . '/../../config'));
        $loader->load('services.yaml');
    }

    public function prepend(ContainerBuilder $container): void
    {
        // Takes the place of the built-in wysiwyg editable, which writes its value into the page as
        // it stands and so shows markdown unrendered. The editable loader consults this map before
        // the namespace prefixes, so a built-in type can be replaced through it.
        $container->prependExtensionConfig('pimcore', [
            'documents' => [
                'editables' => [
                    'map' => [
                        'wysiwyg' => Wysiwyg::class,
                    ],
                ],
            ],
        ]);

        $loader = new YamlFileLoader($container, new FileLocator(__DIR__ . '/../../config'));
        $loader->load('studio_ui.yaml');
    }
}
