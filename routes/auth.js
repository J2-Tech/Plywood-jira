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

/**
 * Endpoint to refresh the token via AJAX request
 * Returns JSON instead of redirecting
 */
router.get('/refresh-token', async (req, res) => {
    console.log('Token refresh requested via AJAX');
    
    try {
        // Check if the user is authenticated
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        
        // Attempt to refresh the token
        const refreshed = await jiraAPIController.refreshToken(req);
        
        if (refreshed) {
            console.log('Token refreshed successfully via AJAX');
            return res.json({ success: true, message: 'Token refreshed successfully' });
        } else {
            console.log('Token refresh failed via AJAX');
            return res.status(401).json({ success: false, message: 'Token refresh failed' });
        }
    } catch (error) {
        console.error('Error refreshing token via AJAX:', error);
        return res.status(500).json({ success: false, message: 'Error refreshing token' });
    }
});

module.exports = router;