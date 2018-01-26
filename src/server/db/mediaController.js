const Influencer = require('./Influencer');
const Media = require('./media');
const bodyParser = require('body-parser');
const Promise = require('bluebird');
const request = require('request');
const rp = require('request-promise');
const normalizeUrl = require('normalize-url');

// media methods to db
const lookUpSites = [
  {
    "id": "5317007dce04fad08b00001b",
    "name": "Chicos",
    "url": "chicos.com"
  }, {
    "id": "539ec15bce04fa4c5100002d", 
    "name": "Perry Ellis", 
    "url": "perryellis.com"
  }, {
    "id": "522de5f155a0f9a4a5000013",
    "name": "Ann Taylor",
    "url": "anntaylor.com"
  }
];

exports.saveMedia = (req, res) => {
  console.log('SAVE A BUNCH OF MEDIA FOR NEW INFLUENCER', req.user);
  let postsArr = [];
  let mediaArray = req.body.data.map(obj => {
    postsArr.push(obj.id);
    if (obj.type == 'video') {
      return {
        _id: obj.id,
        _creator: req.user.id,
        username: obj.user.username, 
        caption: obj.caption,
        created_time: obj.created_time,
        images: obj.images,
        link: obj.link,
        tags: obj.tags,
        post_type: obj.type,
        videos: obj.videos
      }
    } else {
      return {
        _id: obj.id,
        _creator: req.user.id,
        username: obj.user.username,
        caption: obj.caption,
        created_time: obj.created_time,
        images: obj.images,
        link: obj.link,
        tags: obj.tags,
        post_type: obj.type
      }
    }
  });
  let promise = Media.insertMany(mediaArray);
  promise
    .then(response => {
      console.log('insertMany RESULT:', response)
      let user = { _id: req.user._id }
      Influencer
        .update(user, {media: postsArr}, (err, response) => {
          if (err) {
            console.log('ERROR DURING SAVE MEDIA IN Controller:', err)
          }
          console.log('IN MEDIA SAVE:', response);
        })
      })
      .catch(err => console.log('ERROR IN SAVING MEDIA!', err));
};

exports.updateMedia = async (req, res) => {
  console.log('UPDATING from MEDIA Controller', req.user);

  await req.body.data.forEach(obj => {
    let query = { _id: obj.id, _creator: req.user._id };
    let post = {
      _creator: req.user._id,
      username: obj.user.username,
      caption: obj.caption,
      created_time: obj.created_time,
      images: obj.images,
      link: obj.link,
      tags: obj.tags,
      post_type: obj.type
    };

    if (obj.type == 'video') {
      post.videos = obj.videos;
    }  
    Media
      .update(query, { $set: post }, { upsert: true, new: true })
      .then(response => {
        let user = { _id: req.user._id }
        Influencer
          .findOneAndUpdate(user, (err, response) => {
            if (err) {
              console.log('ERROR IN MEDIA UPDATE CONTROLLER:', err);
            }
            response.media.addToSet(obj.id);
            response
              .save()
              .then(influencer => {
                console.log('UPDATED INFLUENCER:', influencer.media)
              })
              .catch(err => console.log(err))
          })
        console.log('updated!', response);
      })
      .catch(err => console.log('ERROR IN UPDATING POST!', err));
  });
  
  res.json('User media updated!');
};

exports.updateRetailLinks = (req, res) => {
  console.log('in UPDATE RETAIL LINK #96:', req.body);
  // find individual post through req.params given
  let query = { _id: req.params.id };
  
  let dataTemp = req.body.map(item => {
    let temp = item.url.split('/');
    let result = temp[2].split('www.')[1];
    // normalize, then replace=> removes all params, then split '.' to slice out suffix(ex: .html)
    let normUrl = normalizeUrl(item.url).replace(/\?.*$/, '').split('.').slice(0, -1).join('.');
    // take the product id from normUrl to use for query
    let productQuery = normUrl.split('/').pop();
    let siteInfo = lookUpSites.filter(item => item.url == result);
    let twoTapPath = `https://api.twotap.com/v1.0/product/search?public_token=${req.app.get('twoTap_public_token')}`;
    let queryObj = {
      'filter': {
        "keywords": productQuery,
        "keywords_fields": ['url'],
        "site_ids": [siteInfo[0].id]
      }
    };
    let options = {
      method: 'POST',
      uri: twoTapPath,
      form: queryObj
    }
    return (
      rp(options)
      .then(body => {
        let tempObj = { ...item };
        let productsList = JSON.parse(body);
        tempObj.title = productsList.products[0].title;
        tempObj.image = productsList.products[0].image;
        tempObj.price = productsList.products[0].price;
        return tempObj;
      })
      .catch(err => console.log('Err in /product/search:', err))
    );
  });

  Promise.all(dataTemp)
    .then((response) => {
      Media.update(query, { $set: { retailLinks: response }}, { new: true }, (err, response) => {
        if (err) {
          console.log(err);
        }
        res.json('LIST SAVED!')
      })
    });
};

exports.getInfluencerMedia = (req, res) => {
  let query = { username: req.params.username }
  console.log('QUERY on getInfluencerMedia cont.:', query);
  Media.find(query, (err, response) => {
    if (err) {
      console.log('IN getInfluencerMedia #116', err);
    }
    res.send(response);
  })
}
