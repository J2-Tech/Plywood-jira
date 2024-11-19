const express = require('express');
const router = express.Router();
const passport = require('passport');
const jiraAuthController = require('../controllers/jiraAuthController');
const jiraAPIController = require('../controllers/jiraAPIController');  
const configController = require('../controllers/configController');

router.get('/login', passport.authenticate('atlassian'));

router.get('/refreshToken', (req, res) => {
    console.log('refreshToken');
    jiraAPIController.refreshToken(req).then(()=>{
        res.redirect('/');
    })
});

router.get('/callback', passport.authenticate('atlassian', { failureRedirect: '/error' }), async (req, res) => {

    // create config first
    await configController.ensureConfigDirExists(req);
    res.redirect('/');
});

router.get('/logout', jiraAuthController.logout);

module.exports = router;