exports.logout = function(req, res){
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
            }
            req.logout(() => {
                res.redirect('/');
            });
        });
    } else {
        req.logout(() => {
            res.redirect('/');
        });
    }
};