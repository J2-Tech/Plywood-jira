var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
//var favicon = require('serve-favicon');
var logger = require('morgan');
var nunjucks = require("nunjucks");
const passport = require('passport');
const AtlassianOAuth2Strategy = require('passport-atlassian-oauth2');
const session = require('express-session');

var fs = require('fs');

if (!fs.existsSync('.env')) {
  console.log("No .env file found. Please create one using the .env.example file as a template.");
  process.exit(1);
}

const dotenv = require('dotenv').config();

const https = require('https');

var indexRouter = require('./routes/index');


var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'njk')

nunjucks.configure('views', {
  autoescape: true,
  express: app
})

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


if (process.env.JIRA_AUTH_TYPE == "OAUTH") {
  
  app.use(session({ secret: 'plywoods-amazing-session-secret', resave: false, saveUninitialized: true }));

  const authStrategy = new AtlassianOAuth2Strategy({
      clientID: process.env.JIRA_OAUTH_CLIENT_ID,
      clientSecret: process.env.JIRA_OAUTH_CLIENT_SECRET,
      callbackURL: process.env.JIRA_OAUTH_CALLBACK_URL,
      scope: 'offline_access read:jira-work read:jira-user write:jira-work',
  },
  function(accessToken, refreshToken, profile, cb) {
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      // for each site, check if url matches process.env.JIRA_URL
      const cloudId = profile.accessibleResources.find(site => site.url.includes(process.env.JIRA_URL)).id;
      profile.cloudId = cloudId;
      cb(null, profile);
  });

  authStrategy._oauth2.setAgent(new https.Agent({
    rejectUnauthorized: false,
    
  }));
  passport.use(authStrategy);

  passport.serializeUser(function(user, cb) {
      cb(null, user);
  });

  passport.deserializeUser(function(obj, cb) {
      cb(null, obj);
  });

  app.use(passport.initialize());
  app.use(passport.session());

  var authRouter = require('./routes/auth');
  app.use('/auth', authRouter);
}

app.use('/', indexRouter);

var configRouter = require('./routes/config');
app.use('/config', configRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = err;

  // render the error page
  res.status(err.status || 500).json(res.locals.error).send();
  //res.render('error');
});

module.exports = app;
