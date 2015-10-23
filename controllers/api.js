/**
 * Split into declaration and initialization for better performance.
 */
var cheerio;
var twilio;
var BitGo;
var Y;
var Bitcore;
var BitcoreInsight;
var request;


var _ = require('lodash');
var async = require('async');
var querystring = require('querystring');


var secrets = require('../config/secrets');
var User = require('../models/User.js');



/**
 * GET /api/scraping
 * Web scraping example using Cheerio library.
 */
exports.getScraping = function(req, res, next) {
  cheerio = require('cheerio');
  request = require('request');

  request.get('https://news.ycombinator.com/', function(err, request, body) {
    if (err) return next(err);
    var $ = cheerio.load(body);
    var links = [];
    $('.title a[href^="http"], a[href^="https"]').each(function() {
      links.push($(this));
    });
    res.render('api/scraping', {
      title: 'Web Scraping',
      links: links
    });
  });
};

/**
 * GET /target
 * Twilio API example.
 */
exports.getTwilio = function(req, res) {
  twilio = require('twilio')(secrets.twilio.sid, secrets.twilio.token);
  console.log(twilio);
  res.render('target', {
    title: 'Twilio API'
  });
};

/**
 * POST /target
 * Send a text message using Twilio.
 */
exports.postTwilio = function(req, res, next) {
  if(!twilio) {
    twilio = require('twilio')(secrets.twilio.sid, secrets.twilio.token);
  }
  req.assert('number', 'Phone number is required.').notEmpty();
  req.assert('message', 'Message cannot be blank.').notEmpty();
  var errors = req.validationErrors();
  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/home');
  }
  var message = {
    to: req.body.number,
    from: secrets.twilio.number,
    body: req.body.message
  };

  User.findById(req.user.id, function(err, user) {
    var target = {
      name: req.body.name,
      number: req.body.number,
      email: req.body.email,
      message: req.body.message,
      duration: 2000,
      handle: ''
    };

    

    console.log(user.targets);
    user.targets.push(target);
    console.log(user.targets);
    user.save(function(err) {
      if (err) return next(err);
    });
  });

  twilio.sendMessage(message, function(err, responseData) {
    if (err) return next(err.message);
    req.flash('success', { msg: 'Text sent to ' + responseData.to + '.'});
    res.redirect('/home');
  });
};

/**
 * GET /api/bitgo
 * BitGo wallet example
 */
exports.getBitGo = function(req, res, next) {
  BitGo = require('bitgo');

  var bitgo = new BitGo.BitGo({ env: 'test', accessToken: secrets.bitgo.accessToken });
  var walletId = req.session.walletId;

  var renderWalletInfo = function(walletId) {
    bitgo.wallets().get({ id: walletId }, function(err, walletResponse) {
      walletResponse.createAddress({}, function(err, addressResponse) {
        walletResponse.transactions({}, function(err, transactionsResponse) {
          res.render('api/bitgo', {
            title: 'BitGo API',
            wallet: walletResponse.wallet,
            address: addressResponse.address,
            transactions: transactionsResponse.transactions
          });
        });
      });
    });
  };

  if (walletId) {
    renderWalletInfo(walletId);
  } else {
    bitgo.wallets().createWalletWithKeychains({
        passphrase: req.sessionID, // change this!
        label: 'wallet for session ' + req.sessionID,
        backupXpub: 'xpub6AHA9hZDN11k2ijHMeS5QqHx2KP9aMBRhTDqANMnwVtdyw2TDYRmF8PjpvwUFcL1Et8Hj59S3gTSMcUQ5gAqTz3Wd8EsMTmF3DChhqPQBnU'
      }, function(err, res) {
        req.session.walletId = res.wallet.wallet.id;
        renderWalletInfo(req.session.walletId);
      }
    );
  }
};


/**
 * POST /api/bitgo
 * BitGo send coins example
 */
exports.postBitGo = function(req, res, next) {
  var bitgo = new BitGo.BitGo({ env: 'test', accessToken: secrets.bitgo.accessToken });
  var walletId = req.session.walletId;

  try {
    bitgo.wallets().get({ id: walletId }, function(err, wallet) {
      wallet.sendCoins({
        address: req.body.address,
        amount: parseInt(req.body.amount),
        walletPassphrase: req.sessionID
      }, function(err, result) {
        if (err) {
          req.flash('errors', { msg: err.message });
          return res.redirect('/api/bitgo');
        }
        req.flash('info', { msg: 'txid: ' + result.hash + ', hex: ' + result.tx });
        return res.redirect('/api/bitgo');
      });
    });
  } catch (e) {
    req.flash('errors', { msg: e.message });
    return res.redirect('/api/bitgo');
  }
};


/**
 * GET /api/bicore
 * Bitcore example
 */
exports.getBitcore = function(req, res, next) {
  Bitcore = require('bitcore');
  Bitcore.Networks.defaultNetwork = secrets.bitcore.bitcoinNetwork == 'testnet' ? Bitcore.Networks.testnet : Bitcore.Networks.mainnet;

  try {
    var privateKey;

    if (req.session.bitcorePrivateKeyWIF) {
      privateKey = Bitcore.PrivateKey.fromWIF(req.session.bitcorePrivateKeyWIF);
    } else {
      privateKey = new Bitcore.PrivateKey();
      req.session.bitcorePrivateKeyWIF = privateKey.toWIF();
      req.flash('info', {
        msg: 'A new ' + secrets.bitcore.bitcoinNetwork + ' private key has been created for you and is stored in ' +
        'req.session.bitcorePrivateKeyWIF. Unless you changed the Bitcoin network near the require bitcore line, ' +
        'this is a testnet address.'
      });
    }

    var myAddress = privateKey.toAddress();
    var bitcoreUTXOAddress = '';

    if (req.session.bitcoreUTXOAddress)
      bitcoreUTXOAddress = req.session.bitcoreUTXOAddress;
    res.render('api/bitcore', {
      title: 'Bitcore API',
      network: secrets.bitcore.bitcoinNetwork,
      address: myAddress,
      getUTXOAddress: bitcoreUTXOAddress
    });
  } catch (e) {
    req.flash('errors', { msg: e.message });
    return next(e);
  }
};

/**
 * POST /api/bitcore
 * Bitcore send coins example
 */
exports.postBitcore = function(req, res, next) {
  BitcoreInsight = require('bitcore-explorers').Insight;

  try {
    var getUTXOAddress;

    if (req.body.address) {
      getUTXOAddress = req.body.address;
      req.session.bitcoreUTXOAddress = getUTXOAddress;
    } else if (req.session.bitcoreUTXOAddress) {
      getUTXOAddress = req.session.bitcoreUTXOAddress;
    } else {
      getUTXOAddress = '';
    }

    var myAddress;

    if (req.session.bitcorePrivateKeyWIF) {
      myAddress = Bitcore.PrivateKey.fromWIF(req.session.bitcorePrivateKeyWIF).toAddress();
    } else {
      myAddress = '';
    }

    var insight = new BitcoreInsight();

    insight.getUnspentUtxos(getUTXOAddress, function(err, utxos) {
      if (err) {
        req.flash('errors', { msg: err.message });
        return next(err);
      } else {
        req.flash('info', { msg: 'UTXO information obtained from the Bitcoin network via Bitpay Insight. You can use your own full Bitcoin node.' });

        // Results are in the form of an array of items which need to be turned into JS objects.
        for (var i = 0; i < utxos.length; ++i) {
          utxos[i] = utxos[i].toObject();
        }

        res.render('api/bitcore', {
          title: 'Bitcore API',
          myAddress: myAddress,
          getUTXOAddress: getUTXOAddress,
          utxos: utxos,
          network: secrets.bitcore.bitcoinNetwork
        });
      }
    });
  } catch (e) {
    req.flash('errors', { msg: e.message });
    return next(e);
  }
};
