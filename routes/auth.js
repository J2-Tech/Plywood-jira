const express = require('express');
const router = express.Router();
const passport = require('passport');
const jiraAuthController = require('../controllers/jiraAuthController');
const jiraAPIController = require('../controllers/jiraAPIController');  

router.get('/login', passport.authenticate('atlassian'));

router.get('/callback', passport.authenticate('atlassian', { failureRedirect: '/error' }), (req, res) => {
    // Successfull authorization, fetch current site cloud id using url
    jiraAPIController.getAvailableSites(req).then(result => {
        if (result && result.length > 0) {
            // for each site, check if url matches process.env.JIRA_URL
            const cloudId = result.find(site => site.url.includes(process.env.JIRA_URL)).id;
            req.session.cloudId = cloudId;
            res.redirect('/');
        }
    });
});

router.get('/logout', jiraAuthController.logout);

module.exports = router;