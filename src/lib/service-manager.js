'use strict'

const crypto = require('crypto')
const assert = require('assert')
const cc = require('five-bells-condition')
const path = require('path')
const Promise = require('bluebird-co')
const request = require('superagent')
const fs = require('fs')
const spawnAndWait = require('../util').spawnAndWait

class ServiceManager {
  /**
   * @param {String} testDir
   */
  constructor (testDir) {
    this.testDir = testDir
    this.dataDir = path.resolve(this.testDir, './data')
    try {
      fs.mkdirSync(this.dataDir)
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }

    this.adminUser = 'admin'
    this.adminPass = 'admin'

    this.nodePath = process.env.npm_node_execpath
    this.npmPath = process.env.npm_execpath
    this.hasCustomNPM = this.nodePath && this.npmPath
    this.processes = []

    process.on('exit', this.killAll.bind(this))
    process.on('uncaughtException', this.killAll.bind(this))
  }

  _npm (args, options, waitFor) {
    let cmd = 'npm'
    if (this.hasCustomNPM) {
      cmd = this.nodePath
      args.unshift(this.npmPath)
    }
    options = Object.assign({detached: true, stdio: 'inherit'}, options)
    const _this = this
    return spawnAndWait(cmd, args, options, waitFor)
      .tap(function (proc) { _this.processes.push(proc) })
  }

  killAll () {
    while (this.processes.length) {
      process.kill(-this.processes.pop().pid)
    }
  }

  startLedger (name, port, options) {
    const dbPath = path.resolve(this.dataDir, './' + name + '.sqlite')
    return this._npm(['start'], {
      env: {
        PATH: process.env.PATH,
        LEDGER_DB_URI: 'sqlite://' + dbPath,
        LEDGER_DB_SYNC: true,
        LEDGER_HOSTNAME: 'localhost',
        LEDGER_PORT: port,
        LEDGER_ADMIN_USER: this.adminUser,
        LEDGER_ADMIN_PASS: this.adminPass,
        LEDGER_AMOUNT_SCALE: options.scale || '4',
        LEDGER_SIGNING_PRIVATE_KEY: options.notificationPrivateKey,
        LEDGER_SIGNING_PUBLIC_KEY: options.notificationPublicKey
      },
      cwd: path.resolve(this.testDir, 'node_modules/five-bells-ledger')
    }, 'http://localhost:' + port + '/health')
  }

  startConnector (name, port, options) {
    return this._npm(['start'], {
      env: {
        CONNECTOR_CREDENTIALS: JSON.stringify(options.credentials),
        CONNECTOR_DEBUG_AUTOFUND: '1',
        CONNECTOR_PAIRS: JSON.stringify(options.pairs),
        CONNECTOR_MAX_HOLD_TIME: 60,
        CONNECTOR_ROUTE_BROADCAST_INTERVAL: 10 * 60 * 1000,
        CONNECTOR_ROUTE_EXPIRY: 11 * 60 * 1000, // don't expire routes
        CONNECTOR_FX_SPREAD: options.fxSpread || '',
        CONNECTOR_SLIPPAGE: options.slippage || '',
        PATH: process.env.PATH,
        CONNECTOR_HOSTNAME: 'localhost',
        CONNECTOR_PORT: port,
        CONNECTOR_ADMIN_USER: this.adminUser,
        CONNECTOR_ADMIN_PASS: this.adminPass,
        CONNECTOR_BACKEND: 'one-to-one',
        CONNECTOR_NOTIFICATION_VERIFY: true,
        CONNECTOR_NOTIFICATION_KEYS: JSON.stringify(options.notificationKeys)
      },
      cwd: path.resolve(this.testDir, 'node_modules/five-bells-connector')
    }, 'http://localhost:' + port + '/health')
  }

  startNotary (name, port, options) {
    const dbPath = path.resolve(this.dataDir, './' + name + '.sqlite')
    return this._npm(['start'], {
      env: {
        PATH: process.env.PATH,
        NOTARY_DB_URI: 'sqlite://' + dbPath,
        NOTARY_DB_SYNC: true,
        NOTARY_HOSTNAME: 'localhost',
        NOTARY_PORT: port,
        NOTARY_ED25519_SECRET_KEY: options.secretKey,
        NOTARY_ED25519_PUBLIC_KEY: options.publicKey
      },
      cwd: path.resolve(this.testDir, 'node_modules/five-bells-notary')
    }, 'http://localhost:' + port + '/health')
  }

  startReceiver (port, options) {
    return this._npm(['start'], {
      env: {
        PATH: process.env.PATH,
        RECEIVER_PORT: port,
        RECEIVER_HOSTNAME: 'localhost',
        RECEIVER_SECRET: options.secret,
        RECEIVER_CREDENTIALS: JSON.stringify(options.credentials || [])
      },
      cwd: path.resolve(this.testDir, 'node_modules/five-bells-receiver')
    }, 'http://localhost:' + port + '/health')
  }

  /**
   * @param {URI} ledger
   * @param {String} name
   * @param {Object} options
   * @param {Amount} options.balance
   * @param {String} options.adminUser
   * @param {String} options.adminPass
   */
  * _updateAccount (ledger, name, options) {
    const accountURI = ledger + '/accounts/' + encodeURIComponent(name)
    const putAccountRes = yield request.put(accountURI)
      .auth(options.adminUser || this.adminUser, options.adminPass || this.adminPass)
      .send({
        name: name,
        password: name,
        balance: options.balance || '0'
      })
    if (putAccountRes.statusCode >= 400) {
      throw new Error('Unexpected status code ' + putAccountRes.statusCode)
    }
    return putAccountRes
  }

  updateAccount (ledger, name, options) {
    return Promise.coroutine(this._updateAccount.bind(this))(ledger, name, options || {})
  }

  * _getBalance (ledger, name, options) {
    const accountURI = ledger + '/accounts/' + encodeURIComponent(name)
    const getAccountRes = yield request.get(accountURI)
      .auth(options.adminUser || this.adminUser, options.adminPass || this.adminPass)
    return getAccountRes.body && getAccountRes.body.balance
  }

  getBalance (ledger, name, options) {
    return Promise.coroutine(this._getBalance.bind(this))(ledger, name, options || {})
  }

  createReceiptCondition (receiverSecret, receiverId) {
    const secret = crypto
      .createHmac('sha256', new Buffer(receiverSecret, 'base64'))
      .update(receiverId)
      .digest()
    const condition = new cc.PreimageSha256()
    condition.setPreimage(secret)
    return condition.getConditionUri()
  }

  sendPayment (params) {
    return require(path.resolve(this.testDir, 'node_modules/five-bells-sender'))(params)
  }

  * assertBalance (ledger, name, expectedBalance) {
    const actualBalance = yield this.getBalance(ledger, name)
    assert.equal(actualBalance, expectedBalance,
      `Ledger balance for ${ledger}/accounts/${name} should be ${expectedBalance}, but is ${actualBalance}`)
  }

  * assertZeroHold () {
    yield this.assertBalance('http://localhost:3001', 'hold', '0')
    yield this.assertBalance('http://localhost:3002', 'hold', '0')
    yield this.assertBalance('http://localhost:3003', 'hold', '0')
  }
}

module.exports = ServiceManager
