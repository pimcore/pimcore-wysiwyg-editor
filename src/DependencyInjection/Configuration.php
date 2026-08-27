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

use Pimcore\Bundle\WysiwygEditor\Wysiwyg\PersistenceFormat;
use Symfony\Component\Config\Definition\Builder\TreeBuilder;
use Symfony\Component\Config\Definition\ConfigurationInterface;

/**
 * @internal
 */
final class Configuration implements ConfigurationInterface
{
    public function getConfigTreeBuilder(): TreeBuilder
    {
        $treeBuilder = new TreeBuilder('pimcore_wysiwyg_editor');

        $treeBuilder->getRootNode()
            ->children()
                ->enumNode('persistence_format')
                    ->info(
                        'Format the editor stores its value in. ' .
                        '"markdown" keeps the value portable; "html" stores what the editor renders, ' .
                        'which is what Pimcore outputs directly in a document.'
                    )
                    ->values(PersistenceFormat::values())
                    ->defaultValue(PersistenceFormat::Markdown->value)
                ->end()
            ->end();

        return $treeBuilder;
    }
}
