/**
 * Consolidated authentication error handling utilities
 */

/**
 * Check if an error is an authentication error
 * @param {Error|Object} error - The error to check
 * @returns {boolean} - True if it's an auth error
 */
function isAuthError(error) {
    if (!error) return false;
    
    // Check various forms of authentication errors
    return error.status === 401 || 
           error.code === 401 || 
           error.statusCode === 401 ||
           error.authFailure === true ||
           (error.message && (
               error.message.toLowerCase().includes('unauthorized') ||
               error.message.toLowerCase().includes('authentication') ||
               error.message.toLowerCase().includes('token') ||
               error.message.toLowerCase().includes('auth')
           )) ||
           (Array.isArray(error.errors) && error.errors.some(err => 
               typeof err === 'string' && (
                   err.includes('Authorization') || 
                   err.includes('auth') || 
                   err.includes('token') ||
                   err.includes('Unauthorized')
               )
           )) ||
           (typeof error.errors === 'string' && (
               error.errors.includes('Authorization') || 
               error.errors.includes('auth') || 
               error.errors.includes('token') ||
               error.errors.includes('Unauthorized')
           )) ||
           (error.errorMessages && Array.isArray(error.errorMessages) && 
            error.errorMessages.some(msg => 
                msg.includes('auth') || 
                msg.includes('token') || 
                msg.includes('Unauthorized')
            ));
}

/**
 * Create a standardized authentication error
 * @param {string} message - Error message
 * @returns {Error} - Standardized auth error
 */
function createAuthError(message = 'Authentication required') {
    const error = new Error(message);
    error.authFailure = true;
    error.status = 401;
    error.code = 401;
    return error;
}

/**
 * Handle authentication errors with retry logic for OAuth
 * @param {Object} req - Express request object
 * @param {Error} error - The authentication error
 * @param {Function} retryFn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise} - Resolves with retry result or throws auth error
 */
async function handleAuthErrorWithRetry(req, error, retryFn, maxRetries = 2) {
    if (!isAuthError(error)) {
        throw error;
    }
    
    // Try to refresh token if OAuth is enabled
    if (process.env.JIRA_AUTH_TYPE === "OAUTH" && maxRetries > 0) {
        try {
            const jiraAPIController = require('../controllers/jiraAPIController');
            const tokenRefreshed = await jiraAPIController.refreshToken(req);
            
            if (tokenRefreshed) {
                console.log('Token refreshed successfully, retrying request');
                return await retryFn();
            }
        } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
        }
    }
    
    // If we can't refresh or max retries reached, throw auth error
    throw createAuthError('Authentication required');
}

/**
 * Wrap API calls with standardized error handling
 * @param {Function} apiCall - The API call function
 * @param {Object} req - Express request object
 * @param {...any} args - Arguments to pass to the API call
 * @returns {Promise} - Resolves with API result or throws standardized error
 */
async function wrapApiCall(apiCall, req, ...args) {
    try {
        return await apiCall(req, ...args);
    } catch (error) {
        if (isAuthError(error)) {
            throw createAuthError();
        }
        throw error;
    }
}

module.exports = {
    isAuthError,
    createAuthError,
    handleAuthErrorWithRetry,
    wrapApiCall
};
