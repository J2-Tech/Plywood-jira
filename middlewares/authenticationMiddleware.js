module.exports = function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else if (req.session.refreshToken) {
        res.redirect('/auth/refreshToken');
    }
    res.redirect('/auth/login');
};