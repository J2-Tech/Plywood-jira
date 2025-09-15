/**
 * Generic API client with automatic token refresh and retry logic
 */

let isRefreshingToken = false;
let refreshPromise = null;
let pendingRequests = [];

/**
 * Check if an error indicates an authentication failure
 * @param {Error|Response} error - The error or response to check
 * @returns {boolean} True if this is an auth error
 */
function isAuthError(error) {
    if (!error) return false;
    
    // Check response status
    if (error.status === 401 || error.status === 403) return true;
    
    // Check if it's a Response object with auth error
    if (error instanceof Response && (error.status === 401 || error.status === 403)) return true;
    
    // Check for parsed JSON data indicating auth error
    if (error.authFailure === true) return true;
    
    // Check error message patterns
    if (error.message) {
        const authPatterns = [
            'Authentication required',
            'unauthorized',
            'Unauthorized',
            'token expired',
            'invalid token',
            'authentication failed',
            'session expired',
            'NetworkError when attempting to fetch resource',
            'Not authenticated',
            'No refresh token available'
        ];
        return authPatterns.some(pattern => 
            error.message.toLowerCase().includes(pattern.toLowerCase())
        );
    }
    
    // Check if response data indicates auth error
    if (error.authFailure || (error.response && error.response.authFailure)) return true;
    
    return false;
}

/**
 * Refresh the authentication token
 * @returns {Promise<boolean>} True if refresh was successful
 */
async function refreshToken() {
    console.log('Attempting to refresh authentication token...');
    
    try {
        const response = await fetch('/auth/refresh-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Token refreshed successfully');
                return true;
            } else {
                console.log('Token refresh failed:', data.message);
                return false;
            }
        } else if (response.status === 401 || response.status === 403) {
            console.log('Token refresh failed - redirecting to login');
            window.location.href = '/auth/login';
            return false;
        } else {
            console.error('Token refresh failed with status:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Error during token refresh:', error);
        return false;
    }
}

/**
 * Execute a request with automatic token refresh and retry
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} retryCount - Current retry attempt (internal use)
 * @returns {Promise<Response>} The fetch response
 */
async function executeWithTokenRefresh(url, options = {}, retryCount = 0) {
    const maxRetries = 1; // Only retry once after token refresh
    
    try {
        // Add default headers
        const defaultHeaders = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        const requestOptions = {
            ...options,
            headers: defaultHeaders,
            credentials: 'include'
        };
        
        console.log(`Making API request to ${url} (attempt ${retryCount + 1})`);
        const response = await fetch(url, requestOptions);
        
        // If request was successful, return the response
        if (response.ok) {
            return response;
        }
        
        // Check if this is an auth error that we can retry
        if ((response.status === 401 || response.status === 403) && retryCount < maxRetries) {
            console.log('Authentication error detected, attempting token refresh...');
            
            // Try to get more details from response
            let responseData = null;
            try {
                responseData = await response.clone().json();
            } catch (parseError) {
                console.log('Could not parse error response');
            }
            
            // Check if the response explicitly indicates auth failure
            if (responseData && responseData.authFailure) {
                console.log('Server indicated auth failure, refreshing token...');
            }
            
            // If we're already refreshing the token, wait for it
            if (isRefreshingToken && refreshPromise) {
                console.log('Token refresh already in progress, waiting...');
                await refreshPromise;
            } else if (!isRefreshingToken) {
                // Start token refresh
                isRefreshingToken = true;
                refreshPromise = refreshToken();
                
                try {
                    const refreshSuccess = await refreshPromise;
                    if (!refreshSuccess) {
                        throw new Error('Token refresh failed');
                    }
                } finally {
                    isRefreshingToken = false;
                    refreshPromise = null;
                }
            }
            
            // Retry the original request
            console.log(`Retrying original request to ${url}...`);
            return executeWithTokenRefresh(url, options, retryCount + 1);
        }
        
        // If it's not an auth error or we've exceeded retries, return the response
        return response;
        
    } catch (error) {
        // Check if this is a network auth error that we can retry
        if (isAuthError(error) && retryCount < maxRetries) {
            console.log('Network authentication error detected, attempting token refresh...');
            
            // Similar logic as above for network errors
            if (isRefreshingToken && refreshPromise) {
                await refreshPromise;
            } else if (!isRefreshingToken) {
                isRefreshingToken = true;
                refreshPromise = refreshToken();
                
                try {
                    const refreshSuccess = await refreshPromise;
                    if (!refreshSuccess) {
                        throw error; // Re-throw original error if refresh failed
                    }
                } finally {
                    isRefreshingToken = false;
                    refreshPromise = null;
                }
            }
            
            // Retry the original request
            return executeWithTokenRefresh(url, options, retryCount + 1);
        }
        
        // Re-throw the error if we can't handle it
        throw error;
    }
}

/**
 * API client with automatic token refresh
 */
export const apiClient = {
    /**
     * GET request with token refresh
     */
    async get(url, options = {}) {
        const response = await executeWithTokenRefresh(url, { ...options, method: 'GET' });
        return response;
    },
    
    /**
     * POST request with token refresh
     */
    async post(url, data = null, options = {}) {
        const requestOptions = {
            ...options,
            method: 'POST'
        };
        
        if (data) {
            requestOptions.body = typeof data === 'string' ? data : JSON.stringify(data);
        }
        
        const response = await executeWithTokenRefresh(url, requestOptions);
        return response;
    },
    
    /**
     * PUT request with token refresh
     */
    async put(url, data = null, options = {}) {
        const requestOptions = {
            ...options,
            method: 'PUT'
        };
        
        if (data) {
            requestOptions.body = typeof data === 'string' ? data : JSON.stringify(data);
        }
        
        const response = await executeWithTokenRefresh(url, requestOptions);
        return response;
    },
    
    /**
     * DELETE request with token refresh
     */
    async delete(url, options = {}) {
        const response = await executeWithTokenRefresh(url, { ...options, method: 'DELETE' });
        return response;
    },
    
    /**
     * Generic fetch with token refresh
     */
    async fetch(url, options = {}) {
        return executeWithTokenRefresh(url, options);
    }
};

// Make it available globally
window.apiClient = apiClient;

// Export functions for use in other modules
export { executeWithTokenRefresh, isAuthError, refreshToken };