'use strict'

const tests = require('./ilp-kit-base')

tests.run('with curves', [ require.resolve('../tests/data/kit1-env-nocurves.list'),
           require.resolve('../tests/data/kit2-env-nocurves.list')])
           // if more complex test cases require more ilp kit instances,
           // add more env.list files below.
           // require.resolve('../tests/data/kit3-env.list')]
