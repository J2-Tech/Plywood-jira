
exports.logout = function(req, res){
    console.log('logout');
    req.logout();
    req.session.destroy();
    res.redirect('/');
};