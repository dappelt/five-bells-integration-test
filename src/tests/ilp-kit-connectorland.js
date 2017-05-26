'use strict'

const tests = require('./ilp-kit-base')
const configFiles = [ require.resolve('../tests/data/kit1-env.list'),
    require.resolve('../tests/data/kit2-env.list')]
    // if more complex test cases require more ilp kit instances,
    // add more env.list files below.
    // require.resolve('../tests/data/kit3-env.list')]

function peer(hostname) {
  try {
    yield request
      .post(`https://${hostname}/api/peers`)
      .auth('admin', 'admin')
      .set('Content-Type', 'application/json')
      .send({
        hostname: 'connector.land',
        limit: 10,
        currencyCode: 'USD'})
  } catch (err) {
    throw new Error(`Error while trying to add peer ${hostname} to connector.land: ${err}`)
  }
}

tests.withSetup('connectorland', configFiles, function () {
  describe('Peer with connectorland', function () {
    peer('wallet1.example')
    peer('wallet2.example')
  })
}
