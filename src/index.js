const { runPhabricatorReviews, getPhabricatorUser } = require('./phab');
const { runGithubReviews } = require('./github');

module.exports = {
  runPhabricatorReviews,
  runGithubReviews,
  getPhabricatorUser,
};
