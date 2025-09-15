const express = require('express');
const router = express.Router();
const passport = require('passport');
const jiraAuthController = require('../controllers/jiraAuthController');
const jiraAPIController = require('../controllers/jiraAPIController');
const { log } = require('../utils/logger');  
const configController = require('../controllers/configController');

router.get('/login', passport.authenticate('atlassian'));

router.get('/refreshToken', (req, res) => {
    log.info('refreshToken');
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
    log.info('Token refresh requested via AJAX');
    
    try {
        // Check if the user is authenticated
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        
        // Attempt to refresh the token
        const refreshed = await jiraAPIController.refreshToken(req);
        
        if (refreshed) {
            log.info('Token refreshed successfully via AJAX');
            return res.json({ success: true, message: 'Token refreshed successfully' });
        } else {
            log.warn('Token refresh failed via AJAX');
            return res.status(401).json({ success: false, message: 'Token refresh failed' });
        }
    } catch (error) {
        log.error('Error refreshing token via AJAX:', error);
        return res.status(500).json({ success: false, message: 'Error refreshing token' });
    }
});

/**
 * Endpoint to refresh the token via AJAX request (POST method)
 * Returns JSON instead of redirecting
 */
router.post('/refresh-token', async (req, res) => {
    log.info('Token refresh requested via AJAX (POST)');
    
    try {
        // Check if the user is authenticated
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            log.warn('No authenticated user found for token refresh');
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        
        // Check if user has required tokens
        if (!req.user.refreshToken) {
            console.log('No refresh token found for user');
            return res.status(401).json({ success: false, message: 'No refresh token available' });
        }
        
        // Attempt to refresh the token
        const refreshed = await jiraAPIController.refreshToken(req);
        
        if (refreshed) {
            console.log('Token refreshed successfully via AJAX (POST)');
            return res.json({ success: true, message: 'Token refreshed successfully' });
        } else {
            console.log('Token refresh failed via AJAX (POST)');
            return res.status(401).json({ success: false, message: 'Token refresh failed' });
        }
    } catch (error) {
        console.error('Error refreshing token via AJAX (POST):', error);
        
        // Check if it's an auth-related error
        if (error.message && (error.message.includes('invalid') || error.message.includes('expired'))) {
            return res.status(401).json({ success: false, message: 'Token refresh failed - please login again' });
        }
        
        return res.status(500).json({ success: false, message: 'Error refreshing token' });
    }
});

module.exports = router;