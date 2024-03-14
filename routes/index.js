const express = require('express');
const router = express.Router();

const jiraController= require('../controllers/jiraController');
const jiraAPIController = require('../controllers/jiraAPIController');


if (process.env.JIRA_AUTH_TYPE == "OAUTH") { 
  const authMiddleware = require('../middlewares/authenticationMiddleware');
  router.use(authMiddleware);  
}

/* GET home page. */
router.get(['/', '/index'], function(req, res, next) {
  res.render('index', { title: 'Jira Time'});
});


router.get('/events', function(req, res, next) {
  try {
    jiraController.getUsersWorkLogsAsEvent(req, req.query.start, req.query.end).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
  
  
});

router.get('/issues/user', function(req, res, next) {
  try {
    jiraController.suggestIssues(req, req.query.start, req.query.end, req.query.query).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
  
});

router.get('/issues/:issueId', function(req, res, next) { 
  try {
    jiraAPIController.getIssue(req, req.params.issueId).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});

router.get('/worklog/:worklogId', function(req, res, next) {
  try {
    jiraAPIController.getWorkLog(req, req.query.issueId, req.params.worklogId).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});


router.put('/worklog/:worklogId', function(req, res, next) {
  try {
    jiraController.updateWorkLog(req, req.body.issueId, req.params.worklogId, req.body.start, req.body.duration, req.body.comment).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});

router.post('/worklog', function(req, res, next) {  
  try {
    jiraController.createWorkLog(req, req.body.issueId, req.body.start, req.body.duration, req.body.comment).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});

router.delete('/worklog/:worklogId', function(req, res, next) {
  try {
    jiraController.deleteWorkLog(req, req.query.issueId, req.params.worklogId).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});

module.exports = router;
