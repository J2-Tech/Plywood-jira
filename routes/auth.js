const express = require('express');
const router = express.Router();
const passport = require('passport');
const jiraAuthController = require('../controllers/jiraAuthController');
const jiraAPIController = require('../controllers/jiraAPIController');  

router.get('/login', passport.authenticate('atlassian'));

router.get('/refreshToken', (req, res) => {
    jiraAPIController.refreshToken(req).then(()=>{
        res.redirect('/');
    })
});

router.get('/callback', passport.authenticate('atlassian', { failureRedirect: '/error' }), (req, res) => {
    res.redirect('/');
});

router.get('/logout', jiraAuthController.logout);

module.exports = router;