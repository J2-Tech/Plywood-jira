var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var nunjucks = require("nunjucks");
const passport = require('passport');
const AtlassianOAuth2Strategy = require('passport-atlassian-oauth2');
const session = require('express-session');
const winston = require('winston');

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
app.set('view engine', 'njk');
app.set('views', path.join(__dirname, 'views'));

nunjucks.configure('views', {
  autoescape: true,
  express: app
});

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Create logger
const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Add console transport if not in production
if (process.env.NODE_ENV !== 'production') {
  winstonLogger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

if (process.env.JIRA_AUTH_TYPE == "OAUTH") {
  
  app.use(session({ 
    secret: 'plywoods-amazing-session-secret', 
    resave: false, 
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  const authStrategy = new AtlassianOAuth2Strategy({
      clientID: process.env.JIRA_OAUTH_CLIENT_ID,
      clientSecret: process.env.JIRA_OAUTH_CLIENT_SECRET,
      callbackURL: process.env.JIRA_OAUTH_CALLBACK_URL,
      scope: 'offline_access read:jira-work read:jira-user write:jira-work',
  },
  function(accessToken, refreshToken, profile, cb) {
      try {
          winstonLogger.info('Authentication attempt', { 
            email: profile.email,
            timestamp: new Date()
          });

          profile.accessToken = accessToken;
          profile.refreshToken = refreshToken;
          const cloudId = profile.accessibleResources.find(
              site => site.url.includes(process.env.JIRA_URL)
          )?.id;
          
          if (!cloudId) {
              winstonLogger.error('No matching Jira site found', {
                url: process.env.JIRA_URL,
                resources: profile.accessibleResources
              });
              return cb(new Error('No matching Jira site found'));
          }
          
          profile.cloudId = cloudId;
          cb(null, profile);
      } catch (error) {
          winstonLogger.error('Authentication error', {
            error: error.message,
            stack: error.stack
          });
          cb(error);
      }
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

const configController = require('./controllers/configController');

// error handler
app.use(function(err, req, res, next) {
  winstonLogger.error('Application error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });
  next(err);
});

app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = err;

  // render the error page
  res.status(err.status || 500).json(res.locals.error).send();
  //res.render('error');
});

module.exports = app;
