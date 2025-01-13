module.exports = function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else if (req.session && req.session.refreshToken) {
        return res.redirect('/auth/refreshToken');
    }
    
    // Add error handling for API requests
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    res.redirect('/auth/login');
};