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
    var startDate = new Date(req.query.start).toISOString().split('T')[0];

    var endDate = new Date(req.query.end).toISOString().split('T')[0];
    
    jiraAPIController.searchIssues(req, 'worklogAuthor = currentUser() AND worklogDate >= ' + startDate + ' AND worklogDate <= '+endDate+' OR ((assignee = currentUser() OR reporter = currentUser()) AND ((statusCategory != '+ process.env.JIRA_DONE_STATUS +') OR (statusCategory = '+ process.env.JIRA_DONE_STATUS +' AND status CHANGED DURING (' + startDate + ', '+endDate+'))))').then(result => {
      if (!result.issues) {
        console.log(result);
      }
      res.json(result.issues);
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
