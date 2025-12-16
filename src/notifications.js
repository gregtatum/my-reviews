const inquirer = require('inquirer')
const { Octokit } = require("@octokit/rest");
const color = require('cli-color')
const open = require('open');
const fetch = require('node-fetch')

if (!process.env.GITHUP_NOTIFICATIONS_ACCESS_TOKEN) {
  throw new Error([
    "This script needs a personal access token",
    "Set the environment variable GITHUP_NOTIFICATIONS_ACCESS_TOKEN",
    "This token can be generated at https://github.com/settings/tokens/new",
    "It only requires the \"notifications\" scope added to it."
  ].join('\n'));
}
const octokit = new Octokit({
  auth: process.env.GITHUP_NOTIFICATIONS_ACCESS_TOKEN
});

let currentCommand = "Open notification";

/**
 * @typedef {Object} Issue
 * @prop {string} url 'https://api.github.com/repos/firefox-devtools/profiler-server/issues/156',
 * @prop {string} repository_url 'https://api.github.com/repos/firefox-devtools/profiler-server',
 * @prop {string} labels_url 'https://api.github.com/repos/firefox-devtools/profiler-server/issues/156/labels{/name}',
 * @prop {string} comments_url 'https://api.github.com/repos/firefox-devtools/profiler-server/issues/156/comments',
 * @prop {string} events_url 'https://api.github.com/repos/firefox-devtools/profiler-server/issues/156/events',
 * @prop {string} html_url 'https://github.com/firefox-devtools/profiler-server/issues/156',
 * @prop {number} id 714656473,
 * @prop {string} node_id 'MDU6SXNzdWU3MTQ2NTY0NzM=',
 * @prop {number} number 156,
 * @prop {string} title 'Fully type exported objects',
 * @prop {string} user User,
 * @prop {Object[]} labels [ [Object] ],
 * @prop {string} state 'open',
 * @prop {bool} locked false,
 * @prop {null | any} assignee null,
 * @prop {Array} assignees [],
 * @prop {any} milestone null,
 * @prop {number} comments 0,
 * @prop {string} created_at '2020-10-05T09:00:11Z',
 * @prop {string} updated_at '2020-10-05T09:00:53Z',
 * @prop {any} closed_at null,
 * @prop {string} author_association 'CONTRIBUTOR',
 * @prop {string} body string
 * @prop {any} closed_by null,
 */


/**
 * @typedef {Object} Repository
 * @prop {string} id           e.g. 3607308,
 * @prop {string} node_id      e.g. 'MDEwOlJlcG9zaXRvcnkzNjA3MzA4',
 * @prop {string} name         e.g. 'profiler',
 * @prop {string} full_name    e.g. 'firefox-devtools/profiler',
 * @prop {string} private      e.g. false,
 * @prop {string} owner        e.g. [Object],
 * @prop {string} html_url     e.g. 'https://github.com/firefox-devtools/profiler',
 * @prop {string} description  e.g. 'Firefox Profiler — Web app for Firefox performance analysis',
 * @prop {string} fork         e.g. false,
 * @prop {string} url          e.g. 'https://api.github.com/repos/firefox-devtools/profiler',
 * plus more *_url props
 */

/**
 * @typedef {Object} NotificationSubject
 * @prop {string} title
 * @prop {string} url
 * @prop {string} latest_comment_url
 * @prop {string} type                e.g. 'Issue'

/**
 * @typedef {Object} Notification
 * @prop {string} id                   e.g. '1226678425',
 * @prop {bool} unread                 e.g. true,
 * @prop {string} reason               e.g. 'mention',
 * @prop {string} updated_at           e.g. '2020-10-09T13:19:42Z',
 * @prop {string | null} last_read_at  e.g. null,
 * @prop {NotificationSubject} subject e.g. [Object],
 * @prop {Repository} repository           e.g. [Object],
 * @prop {string} url                  e.g. 'https://api.github.com/notifications/threads/1226678425',
 * @prop {string} subscription_url     e.g. string
 */

/**
 * @typedef {Object} NotificationResponse
 * @prop {number} status
 * @prop {string} url
 * @prop {Object} headers
 * @prop {Notification[]} data
 */

async function run() {
  const resultCount = 20;

  /** @type {NotificationResponse} */
  const response = await octokit.activity.listNotificationsForAuthenticatedUser({
    // Only show unread notifications.
    all: false,
    per_page: resultCount,
  });

  let defaultChoice;
  const allNotifications = response.data;
  const commands = [
    "Open notification",
    "Mark as read",
  ];

  console.clear();
  listenToKeyboard()
  printShortcuts()

  const statusPerNotification = await lookupStatuses(allNotifications);
  const choiceToNotification = buildChoices(allNotifications, statusPerNotification);

  while(choiceToNotification.size) {
    const notificationList = [...choiceToNotification.keys()].sort();

    const choices = [
      new inquirer.Separator(),
      ...commands,
      new inquirer.Separator(),
      ...notificationList,
    ];

    const firstChoiceIndex = choices.indexOf(notificationList[0]);

    let message;
    switch (currentCommand) {
      case "Open notification":
        message = "Open a notification"
        break;
      case "Mark as read":
        message = "Mark a notification as read"
        break;
      default:
        throw new Error("Unknown command")
    }

    const { choice } = await inquirer.prompt([{
      message,
      name: 'choice',
      type: 'list',
      choices,
      default: defaultChoice,
      pageSize: choices.length
    }])
    switch (choice) {
      case "Open notification":
      case "Mark as read":
        currentCommand = choice
        break;
      default: {
        // Take this notification out of consideration.
        const notification = choiceToNotification.get(choice);
        if (!notification) {
          throw new Error("Could not find the notification from the choice")
        }
        choiceToNotification.delete(choice);

        // Set a default for the next question
        defaultChoice = choices[
          Math.max(firstChoiceIndex, choices.indexOf(choice) + 1)
        ];

        // Handle the current command:
        switch (currentCommand) {
          case "Open notification": {
            const response = await fetch(notification.subject.latest_comment_url || notification.subject.url);
            const { html_url } = await response.json();
            await open(html_url);
            break;
          }
          case "Mark as read": {
            await octokit.activity.markThreadAsRead({
              thread_id: notification.id,
            });
            break;
          }
          default:
            throw new Error("Unknown command")
        }
      }
    }
  }
}

async function lookupStatuses(notifications) {
  const statusPerNotification = new Map();
  for (const notification of notifications) {
    // The issue or PR id is not included in the JSON, but it is in the URL.
    const parts = notification.subject.url.split('/');
    const repo = notification.repository;
    const id = parts[parts.length -1];
    try {
      console.log(`Look up ${repo.owner.login}/${repo.name}#${id}`);
      if (notification.subject.type === 'Issue') {
        const response = await octokit.issues.get({
          owner: repo.owner.login,
          repo: repo.name,
          issue_number: id
        });
        /** @type {Issue} */
        const issue = response.data;
        statusPerNotification.set(notification, issue.state);
      } else if (notification.subject.type === 'PullRequest') {
        const { data: pr } = await octokit.pulls.get({
          owner: repo.owner.login,
          repo: repo.name,
          pull_number: id
        });
        statusPerNotification.set(notification, pr.state);
      }
    } catch(error) {
      console.error(error);
      process.exit(0)
    }
  }
  return statusPerNotification;
}

function buildChoices(notifications, statusPerNotification) {
  const choiceToNotification = new Map();

  // Turn the notifications into formatted choices.
  for (const notification of notifications) {
    let { type, title } = notification.subject;
    if (type === 'PullRequest') {
      type = 'PR';
    }
    const repo = notification.repository.full_name;
    const status = statusPerNotification.get(notification);
    const gray = color.xterm(8);
    const orange = color.xterm(166);
    const choiceParts = [
      gray(repo),
      color.yellow(type)
    ];
    if (status) {
      choiceParts.push(orange(status));
    }
    if (notification.reason === 'mention') {
      choiceParts.push(color.magenta('@me'));
    }
    choiceParts.push(title);

    const choice = choiceParts.join(' ');
    choiceToNotification.set(choice, notification);
  }
  return choiceToNotification;
}

function listenToKeyboard() {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", onKeyChange);
}

function printShortcuts() {
  console.log("");
  console.log("-------------------------");
  console.log("| Keyboard shortcuts:   |");
  console.log("-------------------------");
  console.log("  o - Open the notification in GitHub");
  console.log("  r - Mark the notification as read");
  console.log("  q - Quit");
  console.log("");
}
const ui = new inquirer.ui.BottomBar();

function onKeyChange (key) {
  switch (key) {
    case "a":
    case "o":
      currentCommand = "Open notification";
      ui.updateBottomBar('Set to open notifications.');
      break;
    case "r":
      currentCommand = "Mark as read";
      ui.updateBottomBar('Set to mark notifications as read.');
      break;
    case "q":
    case "\u0003":
      process.exit();
  }
}


run().catch(error => {
  console.error(error);
  process.exit(1);
});
