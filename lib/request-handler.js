var request = require('request');
var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs');
var util = require('../lib/utility');

// var db = require('../app/config');
// var User = require('../app/models/user');
// var Link = require('../app/models/link');
// var Users = require('../app/collections/users');
// var Links = require('../app/collections/links');

var mongoose = require('mongoose');

// var mongoLab;

// // var mongoLab = 'mongodb://MongoLab-h:FTscK0hKJ.GuwYrKScigCWDRENVe0lyz0ZyqaCa9MM4-@ds034348.mongolab.com:34348/MongoLab-h'

// var database = mongoLab || 'mongodb://localhost/shortly'

mongoose.connect('mongodb://MongoLab-h:FTscK0hKJ.GuwYrKScigCWDRENVe0lyz0ZyqaCa9MM4-@ds034348.mongolab.com:34348/MongoLab-h'); 

var dbMong = mongoose.connection;
dbMong.on('error', console.error.bind(console, 'connection error:'));
dbMong.once('open', function (callback) {
  console.log('connection opened!');
});


var UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true
  },
}, { collection: 'peeps' });


var comparePasswords = function (candidatePassword, savedPassword, cb) {

  bcrypt.compare(candidatePassword, savedPassword, function (err, isMatch) {
    if (err) {
      console.log(err);
    } else {
      cb(isMatch)
    }
  });
};

UserSchema.pre('save', function (next) {

  var user = this;

  // only hash the password if it has been modified (or is new)
  if (!user.isModified('password')) {
    next();
  }
    bcrypt.hash(user.password, null, null, function(err, hash) {
      if (err) {
        console.log('Error!');
        next(err);
      } else {
        user.password = hash;
        console.log('user saved!');
        next();
      }
    });
});

var MongoUser = mongoose.model('MongoUser', UserSchema);

var LinkSchema = new mongoose.Schema({
 visits: Number,
 link: String,
 title: String,
 code: String,
 base_url: String,
 url: String
}, {collection: 'links'});

var createSha = function(url) {
  var shasum = crypto.createHash('sha1');
  shasum.update(url);
  return shasum.digest('hex').slice(0, 5);
};

LinkSchema.pre('save', function(next){
  var code = createSha(this.url);
  this.code = code;
  next();
});

var MongoLink = mongoose.model('MongoLink', LinkSchema);

// -----------------




exports.renderIndex = function(req, res) {
  res.render('index');
};

exports.signupUserForm = function(req, res) {
  res.render('signup');
};

exports.loginUserForm = function(req, res) {
  res.render('login');
};

exports.logoutUser = function(req, res) {
  req.session.destroy(function(){
    res.redirect('/login');
  });
};

exports.fetchLinks = function(req, res) {

  MongoLink.find(function(err, links) {
    var linksArray = [];
    for (var i = 0; i < links.length; i++) {
      linksArray.push(links[i])
    } 
    res.send(200, linksArray); 
  })
};

exports.saveLink = function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }
  // MONGO
  var linkQuery = MongoLink.where({ url: uri });
  linkQuery.findOne(function(err, link) {
    if (link) {
      res.send(200, link.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var mongoLink = new MongoLink({
          url: uri,
          title: title,
          base_url: req.headers.origin,
          visits: 0
        });

        mongoLink.save(function(err) {
          if (err) {
            console.log('Error', err);
          } else {
            console.log('Link saved!');
            res.send(200, mongoLink)
          }
        });
      })

    }
  })
};

exports.loginUser = function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  // MONGO
  var userQuery = MongoUser.where({ username: username });
  userQuery.findOne(function (err, user) {
    if (err) {
      console.log(err)
    } else {
      if (user) {
        console.log('user found!');
        comparePasswords(password, user.password, function(isMatch){
          if (isMatch) {
             console.log('password matches!');
              util.createSession(req, res, user);
          } else {
            console.log('incorrect password...');
            res.redirect('/login');
          }
        })
      } else {
        console.log('user not found...');
      }
    }
  });

};

exports.signupUser = function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

    var userQuery = MongoUser.where({ username: username });

    userQuery.findOne(function (err, user) {
      if (!user) {
        var mongoUser = new MongoUser({
          username: username,
          password: password,
        });
        mongoUser.save(function(err){
          if (err) {
            console.log(err)  
          } else {
            console.log('user saved successfully');
            util.createSession(req, res, mongoUser);
          }
        });  
      } else {
        console.log('Account already exists...');
        res.redirect('/signup');
      }
    });
};

exports.navToLink = function(req, res) {

  var codeQuery = MongoLink.where({ code: req.params[0] });

  codeQuery.findOne(function (err, link) {
    if (!link) {
      res.redirect('/');
    } else {
      link.visits = link.visits + 1;
      link.save(function(err) {
        if (err) {
          console.log(err);
        } else {
          return res.redirect(link.get('url'));
        }
      })
    }

  });
  

};