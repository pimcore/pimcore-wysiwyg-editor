/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import { type Config } from 'jest'

// The @pimcore/studio-ui-bundle package ships types only — its runtime is provided by the Studio
// host via module federation. Tests therefore resolve the federated entry points to local mocks.
const config: Config = {
  testEnvironment: 'jsdom',
  rootDir: '.',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest'
  },
  setupFilesAfterEnv: [
    '@testing-library/jest-dom',
    '<rootDir>/js/test-utils/jest-setup.ts'
  ],
  moduleNameMapper: {
    '^@pimcore/studio-ui-bundle(/app)?$': '<rootDir>/js/test-utils/mocks/studio-ui-app-mock.ts',
    '^@pimcore/studio-ui-bundle/components$': '<rootDir>/js/test-utils/mocks/studio-ui-components-mock.ts',
    '^@pimcore/studio-ui-bundle/modules/app$': '<rootDir>/js/test-utils/mocks/studio-ui-modules-app-mock.ts',
    '^@pimcore/studio-ui-bundle/utils$': '<rootDir>/js/test-utils/mocks/studio-ui-utils-mock.ts',
    '^@pimcore/studio-ui-bundle(/.*)?$': '<rootDir>/js/test-utils/mocks/studio-ui-generic-mock.ts'
  }
}

export default config
