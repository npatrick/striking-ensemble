const config = require('../config/keys');
const stripe = require('stripe')(config.stripe.secretKey);
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const querystring = require('querystring');
const request = require('request');
const Promise = require('bluebird');
const passport = require('passport');
const Media = require('../db/media');
const mediaController = require('../db/mediaController');
const Influencer = require('../db/Influencer');
const integrations = require('./integrations');
const twoTapApiURL = 'https://checkout.twotap.com/prepare_checkout';
const instaApiURL = 'https://api.instagram.com/v1/users/self/media/recent';
const jwtClient = require('../config/googleAuth').jwtClient;
const google = require('googleapis').google;

// Controller methods for TwoTap
/**
 * POST /purchase_confirm_callback
 *
 * Callback to confirm the purchase before Two Tap finalizes it.
 */
exports.purchaseConfirmController = (req, res) => {
  integrations.purchaseConfirmCallback(req, res);
};

exports.purchaseStatusController = (req, res) => {
  integrations.purchaseStatus(req, res);
}

// ======================================================================= //

// ====================== Controller methods for Stripe =================== //

// Redirect to Stripe to set up payments.
exports.setupPayment = (req, res) => {
    // Generate a random string as state to protect from CSRF and place it in the session.
  req.session.state = Math.random().toString(36).slice(2);
  // Prepare the mandatory Stripe parameters.
  let parameters = {
    client_id: config.stripe.clientId,
    state: req.session.state
  };
  // Optionally, Stripe Connect accepts `first_name`, `last_name`, `email`,
  // and `phone` in the query parameters for them to be autofilled.
  // parameters = Object.assign(parameters, {
  //   'stripe_user[business_type]': req.user.type || 'individual',
  //   'stripe_user[first_name]': req.user.firstName || undefined,
  //   'stripe_user[last_name]': req.user.lastName || undefined,
  //   'stripe_user[email]': req.user.email,
  //   'stripe_user[business_name]': req.user.businessName || undefined,
  // });

  // Redirect to Stripe to start the Connect onboarding.
  res.redirect(config.stripe.authorizeUri + '?' + querystring.stringify(parameters));
}

/**
 * GET /billing/stripe/token
 *
 * Connect the new Stripe account to the platform account.
 */
exports.getStripeToken = (req, res) => {
  // Check the state we got back equals the one we generated before proceeding.
  if (req.session.state != req.query.state) {
    res.redirect(303, '/login');
  }
  // Post the authorization code to Stripe to complete the authorization flow.
  request.post(config.stripe.tokenUri, {
    form: {
      grant_type: 'authorization_code',
      client_id: config.stripe.clientId,
      client_secret: config.stripe.secretKey,
      code: req.query.code
    },
    json: true
  }, (err, response, body) => {
    if (err || body.error) {
      console.log('The Stripe onboarding process has not succeeded.');
    } else {
      // Update the user model and store the Stripe account ID in the datastore.
      // This Stripe account ID will be used to pay out to the influencer.
      let query = { username: req.user.username };
      Influencer.update(query, { stripeAccountId: body.stripe_user_id }).exec();
      req.user.stripeAccountId = body.stripe_user_id;
      req.user.save();
      // Redirect to the final stage.
      res.redirect('/billing');
    }
  });
};

/**
 * GET /billing/stripe/balance
 *
 * Retrieve user account available and pending balances.
 */
exports.getBalance = async (req, res) => {
  const influencer = req.user;
  try {
    const balance = await stripe.balance.retrieve({ stripe_account: influencer.stripeAccountId })
    console.log('User balance object is:', balance);
    res.send(balance);
  } catch (err) {
    console.log('Failed to retrieve balance.', err);
    return res.redirect('/login');
  }
};

/**
 * GET /billing/stripe/commision-info
 *
 * Retrieve user's past 14-day available commisions.
 */
exports.getCommisionInfo = async (req, res) => {
  const influencer = req.user;
  // retrieve influencer earnings from GA Analytics
  const VIEW_ID = 'ga:168623324';
  await jwtClient.authorize((err, tokens) => {
    if (err) {
      console.log('ERROR IN jwtClient auth', err);
      return;
    }
    // utm_campaign = ${ influencer._id }
    let analytics = google.analytics('v3');
    analytics.data.ga.get({
      'auth': jwtClient,
      'ids': VIEW_ID,
      'dimensions': 'ga:productName',
      'metrics': 'ga:calcMetric_Commisions',
      'filters': `ga:productCouponCode=@1163789244`,
      "start-date": '14daysAgo',
      "end-date": 'yesterday'
    }, (err, response) => {
      if (err) {
        console.log('ERROR in get analytics', err);
        return;
      }
      console.log('My ANAL REPORT:', response.data.rows);
      // NEED TO CHECK IF ALL RESPONSE IS PAGINATED
      let totalCommision = 0;
      response.data.rows.forEach(product => {
        totalCommision += Number(product[1]);
      });
      res.json(totalCommision);
    })
  });
};

/**
 * GET /billing/stripe/transfers
 *
 * Redirect to Stripe to view transfers and edit payment details.
 */
exports.getStripeTransfers = async (req, res) => {
  const influencer = req.user;
  // Make sure the logged-in influencer had completed the Stripe onboarding.
  if (!influencer.stripeAccountId) {
    console.log('stripe on-boarding?', influencer.stripeAccountId);
    return res.redirect(303, '/login');
  }
  try {
    // Generate a unique login link for the associated Stripe account.
    const loginLink = await stripe.accounts.createLoginLink(influencer.stripeAccountId);
    // Retrieve the URL from the response and redirect the user to Stripe.
    return res.redirect(loginLink.url);
  } catch (err) {
    console.log('Failed to create a Stripe login link.');
    return res.redirect('/login');
  }
};

exports.transferFund = async (req, res) => {
  // create a charge to send funds to account in order
  // to resolve insufficient funds
  await stripe.charges.create({
    amount: 10000,
    currency: "usd",
    // obtained with Stripe.js that returns a token
    // Or an object containing a user's credit card details
    // the more card details given the more it helps fraud prevention
    source: 'tok_bypassPending',
    description: "Charge for npatrick.romana@example.com"
  }, (err, charge) => {
    if (err) {
      console.log('ERROR ON CHARGE:', err);
    } else {
      console.log('SUCCESS CHARGE IS!!!!!!!!!!!!!!!!!!!!!!!!:', charge);
    }
  });
  const influencer = req.user;
  // retrieve influencer earnings from GA Analytics
  const VIEW_ID = 'ga:168623324';
  await jwtClient.authorize((err, tokens) => {
    if (err) {
      console.log('ERROR IN jwtClient auth', err);
      return;
    }
    // utm_campaign = ${ influencer._id }
    let analytics = google.analytics('v3');
    analytics.data.ga.get({
      'auth': jwtClient,
      'ids': VIEW_ID,
      'dimensions': 'ga:productName',
      'metrics': 'ga:calcMetric_Commisions',
      'filters': `ga:productCouponCode=@1163789244`,
      "start-date": '7daysAgo',
      "end-date": 'yesterday'
    }, (err, response) => {
      if (err) {
        console.log('ERROR in get analytics', err);
        return;
      }
      console.log('My ANAL REPORT:', response.data.rows);
      // NEED TO CHECK IF ALL RESPONSE IS PAGINATED
      let totalCommision = 0;
      response.data.rows.forEach(product => {
        // amount in cents
        totalCommision += Math.floor(Number(product[1]) * 100);
      });
      stripe.transfers.create({
        amount: totalCommision,
        currency: 'usd',
        destination: influencer.stripeAccountId
      }, (err, transfer) => {
        if (err) {
          console.log('ERROR IN TRANSFER', err);
          res.send('Error occured upon transfering funds. Please contact customer support');
        } else {
          res.send(`Success! Transfered the amount of $${totalCommision.toFixed(2)}`);
        }
      })
    })
  });
}

/**
 * POST /billing/stripe/payout
 *
 * Generate an instant payout with Stripe for the available balance.
 */
exports.payout = async (req, res) => {
  const influencer = req.user;
  try {
    // Fetch the account balance to find available funds.
    const balance = await stripe.balance.retrieve({ stripe_account: influencer.stripeAccountId });
    // This instance only uses USD so we'll just use the first available balance.
    // Note: There are as many balances as currencies used in your application.
    console.log('CURRENT USER BALANCE:', balance.available[0]);
    const { amount, currency } = balance.available[0];

    if (amount == 0) {
      res.send('Insufficient Funds for Payout');
    }

    // Create the instant payout.
    const payout = await stripe.payouts.create({
      method: 'instant',
      amount: amount,
      currency: currency,
      statement_descriptor: config.appName
    }, {
        stripe_account: influencer.stripeAccountId
      });
  } catch (err) {
    console.log(err);
    res.status(400).end();
  }
  // Redirect to the pilot dashboard.
  res.redirect('/billing');
};

/**
 * GET /billing/stripe/payout-list
 *
 * Retrieve a list of payout history.
 */
exports.getPayoutList = async (req, res) => {
  const influencer = req.user;
  const options = {
    stripe_account: influencer.stripeAccountId
  };
  try {
    const payoutList = await stripe.payouts.list(
      {
        limit: 3
      }, 
      options, 
      (err, payout) => {
        console.log('getPayoutList:', payout);
        res.send(payout.data);
      }
    );
  } catch (err) {
    console.log('ERR IN PAYOUT REQ', err);
    res.status(400).end();
  }
};

/**
 * POST /billing/stripe/deactivate
 *
 * This endpoint is used for revoking access of an app to an account.
 */
exports.deactivate = (req, res) => {
  const influencer = req.user;

  request.post({
    url: 'https://connect.stripe.com/oauth/deauthorize',
    headers: {
      Authorization: `Bearer ${config.stripe.secretKey}`
    },
    form: {
      client_id: config.stripe.clientId,
      stripe_user_id: influencer.stripeAccountId
    }
  }, (err, response, body) => {
    if (err || body.error) {
      console.log('The Stripe deauthorize process has not succeeded.', err || body.error);
    } else {
      let query = { username: req.user.username };
      Influencer.update(query, { $unset: { stripeAccountId: 1 } }).exec();
      req.user.stripeAccountId = '';
      let cleanUser = req.user;
      cleanUser.accessToken = undefined;
      console.log('Deactivated Acct:', body);
      res.send(cleanUser);
    }
  })
};

// ======================================================================== //

// Controller methods for Instagram

/**
 * POST /account/media => due to the need of updating posts on our own db
 *
 * Get media from insta for logged in users & send to client
**/
exports.getMedia = (req, res) => {
  // set options to insta api path for request use
  let options = {
    url: instaApiURL + '/?access_token=' + req.user.accessToken
  };
  if (req.params.count) {
    // set options.url with post count returned to also receive pagination url
    options.url = options.url + '&count=' + req.params.count;
  }
  if (req.params.max_id) {
    // request for next page
    options.url = options.url + '&max_id=' + req.params.max_id;
  }

  request.get(options, (err, response, body) => {
    if (err) {
      throw err;
    }
    let parsedBody = JSON.parse(body);
    // check media posts count of user
    Media.count({ username: req.user.username }).then((count) => {
      // if none, we have a new user
      if (count < 1) {
        console.log('NEW USER DETECTED IN SAVING MEDIA');
        // create an array of posts from insta query results to save in db
        let mediaArr = parsedBody.data.map(obj => {
          let tempImages = obj.images;
          for (let key in obj.images) {
            // remove the signatures on url images
            tempImages[key].url = obj.images[key].url.replace(/vp.*\/.{32}\/.{8}\//, '');
          }

          let tempVideos = obj.type == 'video' ? obj.videos : null;
          if (tempVideos) {
            for (let prop in obj.videos) {
              // remove the signatures on url videos
              tempVideos[prop].url = obj.videos[prop].url.replace(/vp.*\/.{32}\/.{8}\//, '');
            }
          }

          return {
            _id: obj.id,
            _creator: req.user.id,
            username: req.user.username,
            caption: obj.caption,
            created_time: obj.created_time,
            images: tempImages,
            link: obj.link,
            tags: obj.tags,
            post_type: obj.type,
            videos: tempVideos
          }
        });

        Media.insertMany(mediaArr)
          .then((response) => console.log('INSERTED MANY #228'))
          .catch(err => console.log('ERROR IN INSERTING MEDIA #229!', err));
        req.app.settings.authInfo.newUser = false;
        res.send(mediaArr);
      } else {
        // do returning user logic
        console.log('USER EXISTS in getMedia. Now saving in a special way...');
        let newMediaList = [];
        let oldMediaList = [];
        // add post to media list after mediaCount fn resolves the queries
        function mediaCount(arr) {
          return arr.reduce((promise, item) =>
            promise.then(() => Media.count({ _id: item.id })
              .then((count) => {
                console.log('CAN I EVEN SEE??', count);
                // if item does not exists in Media db
                if (count <= 0) {
                  let tempItem = item;
                  let tempImages = item.images;
                  for (let key in item.images) {
                    // remove the signatures on url images
                    tempImages[key].url = item.images[key].url.replace(/vp.*\/.{32}\/.{8}\//, '');
                  }

                  let tempVideos = item.type == 'video' ? item.videos : null;
                  if (tempVideos) {
                    for (let prop in item.videos) {
                      // remove the signatures on url videos
                      tempVideos[prop].url = item.videos[prop].url.replace(/vp.*\/.{32}\/.{8}\//, '');
                    }
                  }
                  tempItem.images = tempImages;
                  tempItem.videos = tempVideos;
                  newMediaList.push(tempItem);
                } else {
                  oldMediaList.push(item);
                }
              })), Promise.resolve())
        }
        // parsedBody from instagram media query
        mediaCount(parsedBody.data).then(() => {
          // check if user has new post(s) that has compared to our own media db
          if (newMediaList.length == 0) {
            Media.find({ _creator: req.user._id }, (err, response) => {
              if (err) {
                console.log('IN MEDIA COUNT #78', err);
              }
              console.log('NO NEW MEDIA TO ADD FOR USER... sending oldies');
              res.send(response);
            })
          } else {
            let arrToSend = [...newMediaList, ...oldMediaList];
            Media
              .insertMany(newMediaList)
              .then(response => console.log('GOT THEM UPDATED!'))
              .catch(err => console.log('ERR in reqController #89', err));
            res.send(arrToSend);
          }
        })
      }
    })
  });
};

exports.getInstaPost = (req, res) => {
  console.log('GRAB 1 INSTA', req.params);
  Media.find({_id: req.params.id}, (err, response) => {
    if (err) {
      console.log('Error in getInstaPost', err)
    }
    res.send(response)
  })
};

// submit media to specified influencer in db
exports.submitMedia = (req, res) => {
  console.log('USER CONTENTS IN reqController by submitMedia', req.user);
  // if user is new, use saveMedia controller
  if (req.app.settings.authInfo.newUser) {
    mediaController.saveMedia(req, res);
  } else {
    // if user already exists, use updateMedia controller
    mediaController.updateMedia(req, res);
  }
};

exports.submitLinks = (req, res) => {
  console.log('can i hazz user?', req.user);
  // find db user
  mediaController.updateRetailLinks(req, res);
};

exports.getInfluencerPosts = (req, res) => {
  console.log('GET INFLUENCER POSTS controller');
  mediaController.getInfluencerMedia(req, res);
};

// Let the front-end handle the rendering
exports.getFrontEnd = (req, res) => {
  console.log('get Front End route');
  res.sendFile(path.join(__dirname, '../../../public/index.html'));
};

/**
 * GET /:username/media-products
 *
 * Get media that has retailLinks only
 */
exports.getMediaProducts = (req, res) => {
  let query = { 
    username: req.params.username,
    retailLinks: { $exists: true }
  };
  Media.find(query, (err, response) => {
    if (err) {
      console.log('Error in getMediaProducts controller:', err);
    }
    res.send(response);
  });
};

exports.getPostCatalog = (req, res) => {
  // TwoTap logic here for saving product catalogs to catalogs Schema
};

/**
 * GET /reports/analytics
 *
 * Get Google Analytics Reports
 */
exports.getReports = async (req, res) => {
  console.log('getting REPORTS with BODY:', req.body);
  const { influencerId, dimensions, metrics } = req.body;
  const VIEW_ID = 'ga:168623324';
  await jwtClient.authorize((err, tokens) => {
    if (err) {
      console.log('ERROR IN jwtClient auth', err);
      return;
    }
    let analytics = google.analytics('v3');
    analytics.data.ga.get({
      'auth': jwtClient,
      'ids': VIEW_ID,
      'dimensions': dimensions,
      'metrics': metrics,
      'filters': `ga:productCouponCode=@${influencerId}`,
      "start-date": req.body['start-date'],
      "end-date": req.body['end-date']
    }, (err, response) => {
      if (err) {
        console.log('ERROR in get analytics', err);
        return;
      }
      res.send(response.data);
    })
  });
};
