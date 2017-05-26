'use strict'

const tests = require('./ilp-kit-base')
const configFiles = [ require.resolve('../tests/data/kit1-env.list'),
    require.resolve('../tests/data/kit2-env.list')]
    // if more complex test cases require more ilp kit instances,
    // add more env.list files below.
    // require.resolve('../tests/data/kit3-env.list')]

tests.testUserApi('with curves', configFiles)
tests.testPaymentApi('with curves', configFiles)
