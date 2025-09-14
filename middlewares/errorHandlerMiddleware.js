/**
 * Centralized error handling middleware for routes
 */
const authErrorHandler = require('../utils/authErrorHandler');

/**
 * Handle authentication errors consistently across routes
 * @param {Error} error - The error to handle
 * @param {Object} res - Express response object
 * @returns {boolean} - True if error was handled
 */
function handleAuthError(error, res) {
    if (authErrorHandler.isAuthError(error)) {
        console.log('Authentication error detected in route:', error.message);
        res.status(401).json({ 
            error: 'Authentication required', 
            authFailure: true,
            redirect: '/auth/login' 
        });
        return true;
    }
    return false;
}

/**
 * Handle Jira API errors consistently
 * @param {Error} error - The error to handle
 * @param {Object} res - Express response object
 * @returns {boolean} - True if error was handled
 */
function handleJiraError(error, res) {
    if (error.message) {
        if (error.message.includes('403') || error.message.includes('Forbidden')) {
            res.status(403).json({ 
                error: 'You do not have permission to perform this action',
                jiraError: true 
            });
            return true;
        }
        
        if (error.message.includes('404')) {
            res.status(404).json({ 
                error: 'Resource not found',
                jiraError: true 
            });
            return true;
        }
    }
    return false;
}

/**
 * Generic error handler middleware
 * @param {Error} error - The error to handle
 * @param {Object} res - Express response object
 * @param {string} defaultMessage - Default error message
 */
function handleGenericError(error, res, defaultMessage = 'Internal server error') {
    console.error('Unhandled error in route:', error);
    res.status(500).json({ 
        error: error.message || defaultMessage,
        jiraError: error.jiraError || false
    });
}

/**
 * Main error handler middleware factory
 * @param {string} defaultMessage - Default error message for unhandled errors
 * @returns {Function} - Express middleware function
 */
function createErrorHandler(defaultMessage = 'Internal server error') {
    return function(error, req, res, next) {
        // Try auth error handling first
        if (handleAuthError(error, res)) {
            return;
        }
        
        // Try Jira API error handling
        if (handleJiraError(error, res)) {
            return;
        }
        
        // Fall back to generic error handling
        handleGenericError(error, res, defaultMessage);
    };
}

module.exports = {
    handleAuthError,
    handleJiraError,
    handleGenericError,
    createErrorHandler
};
