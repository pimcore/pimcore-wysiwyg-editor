<?php
/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

use Pimcore\Tool;
use Symfony\Component\HttpFoundation\Request;

include __DIR__ . "/../vendor/autoload.php";

define('PIMCORE_PROJECT_ROOT', __DIR__ . '/..');
define('APP_ENV', 'test');

\Pimcore\Bootstrap::setProjectRoot();
\Pimcore\Bootstrap::bootstrap();

$request = Request::createFromGlobals();

// set current request as property on tool as there's no
// request stack available yet
Tool::setCurrentRequest($request);

/** @var \Pimcore\Kernel $kernel */
$kernel = \Pimcore\Bootstrap::kernel();

// reset current request - will be read from request stack from now on
Tool::setCurrentRequest(null);

$response = $kernel->handle($request);
$response->send();

$kernel->terminate($request, $response);
