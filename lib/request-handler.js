var request = require('request');
var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs');
var util = require('../lib/utility');

var db = require('../app/config');
var User = require('../app/models/user');
var Link = require('../app/models/link');
var Users = require('../app/collections/users');
var Links = require('../app/collections/links');

var mongoose = require('mongoose');


mongoose.connect('mongodb://localhost/shortly'); 

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

var SALT_WORK_FACTOR = 10;

UserSchema.methods.comparePasswords = function (candidatePassword) {
  var defer = Q.defer();
  var savedPassword = this.password;
  bcrypt.compare(candidatePassword, savedPassword, function (err, isMatch) {
    if (err) {
      defer.reject(err);
    } else {
      defer.resolve(isMatch);
    }
  });
  return defer.promise;
};

UserSchema.pre('save', function (next) {
  // var user = this;

  // // only hash the password if it has been modified (or is new)
  // if (!user.isModified('password')) {
  //   return next();
  // }

  // // generate a salt
  // bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
  //   if (err) {
  //     return next(err);
  //   }

  //   // hash the password along with our new salt
  //   bcrypt.hash(user.password, salt, null, function(err, hash) {
  //     if (err) {
  //       return next(err);
  //     }

  //     // override the cleartext password with the hashed one
  //     user.password = hash;
  //     user.salt = salt;
  //     next();
  //   });
  // });


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
});

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

var newLink = mongoose.model('newLink', LinkSchema);

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
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  })
};

exports.saveLink = function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });

  // MONGO
  // var newLink = new newLink({
  //   url: url,
  //   visits: 0,
  //   base_url: req.headers.origin,
  //   title: title
  // })
   
  // ------
};

exports.loginUser = function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({ username: username })
    .fetch()
    .then(function(user) {
      if (!user) {
        res.redirect('/login');
      } else {
        user.comparePassword(password, function(match) {
          if (match) {
            util.createSession(req, res, user);
          } else {
            res.redirect('/login');
          }
        })
      }
  });

  var userQuery = MongoUser.where({ username: username });
  userQuery.findOne(function (err, user) {
    if (err) {
      console.log(err)
    } else {
      if (user) {
        console.log('user found!');
        console.log(user);
      } else {
        console.log('user not found...');
      }
    }
  });

  // MongoUser.findOne({username: username}), 'password', function(err, person) {
  //   if (!person) {
  //     console.log('user not found!'); 
  //   } else {
  //     console.log('user found!');
  //   }
  // }
};

exports.signupUser = function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({ username: username })
    .fetch()
    .then(function(user) {
      if (!user) {
        var newUser = new User({
          username: username,
          password: password
        });
        newUser.save()
          .then(function(newUser) {
            util.createSession(req, res, newUser);
            Users.add(newUser);
          });
      } else {
        console.log('Account already exists');
        res.redirect('/signup');
      }
    })

    // MONGO
    var mongoUser = new MongoUser({
      username: username,
      password: password,
      salt: 0
    });

    mongoUser.save(function(err){
      if (err) {
        console.log(err)  
      } else {
        console.log('user saved successfully');
      }
    });
    // ---------
};

exports.navToLink = function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      link.set({ visits: link.get('visits') + 1 })
        .save()
        .then(function() {
          return res.redirect(link.get('url'));
        });
    }
  });
};