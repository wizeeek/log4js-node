'use strict';

const vows = require('vows');
const assert = require('assert');
const log4js = require('../../lib/log4js');
const sandbox = require('sandboxed-module');

function setupLogging(category, options) {
  const msgs = [];

  const slackCredentials = {
    token: options.token,
    channel_id: options.channel_id,
    username: options.username,
    format: options.format,
    icon_url: options.icon_url
  };
  const fakeSlack = (function (key) {
    function constructor() {
      return {
        options: key,
        api: function (action, data, callback) {
          msgs.push(data);
          callback(false, { status: 'sent' });
        }
      };
    }

    return constructor(key);
  });

  const fakeLayouts = {
    layout: function (type, config) {
      this.type = type;
      this.config = config;
      return log4js.layouts.messagePassThroughLayout;
    },
    basicLayout: log4js.layouts.basicLayout,
    coloredLayout: log4js.layouts.coloredLayout,
    messagePassThroughLayout: log4js.layouts.messagePassThroughLayout
  };

  const fakeConsole = {
    errors: [],
    logs: [],
    error: function (msg, value) {
      this.errors.push({ msg: msg, value: value });
    },
    log: function (msg, value) {
      this.logs.push({ msg: msg, value: value });
    }
  };


  const slackModule = sandbox.require('../../lib/appenders/slack', {
    requires: {
      'slack-node': fakeSlack,
      '../layouts': fakeLayouts
    },
    globals: {
      console: fakeConsole
    }
  });


  log4js.addAppender(slackModule.configure(options), category);

  return {
    logger: log4js.getLogger(category),
    mailer: fakeSlack,
    layouts: fakeLayouts,
    console: fakeConsole,
    messages: msgs,
    credentials: slackCredentials
  };
}

function checkMessages(result) {
  for (let i = 0; i < result.messages.length; ++i) {
    assert.equal(result.messages[i].channel, '#CHANNEL');
    assert.equal(result.messages[i].username, 'USERNAME');
    assert.ok(new RegExp(`.+Log event #${i + 1}`).test(result.messages[i].text));
  }
}

log4js.clearAppenders();

vows.describe('log4js slackAppender').addBatch({
  'slack setup': {
    topic: setupLogging('slack setup', {
      token: 'TOKEN',
      channel_id: '#CHANNEL',
      username: 'USERNAME',
      format: 'FORMAT',
      icon_url: 'ICON_URL'
    }),
    'slack credentials should match': function (result) {
      assert.equal(result.credentials.token, 'TOKEN');
      assert.equal(result.credentials.channel_id, '#CHANNEL');
      assert.equal(result.credentials.username, 'USERNAME');
      assert.equal(result.credentials.format, 'FORMAT');
      assert.equal(result.credentials.icon_url, 'ICON_URL');
    }
  },

  'basic usage': {
    topic: function () {
      const setup = setupLogging('basic usage', {
        token: 'TOKEN',
        channel_id: '#CHANNEL',
        username: 'USERNAME',
        format: 'FORMAT',
        icon_url: 'ICON_URL',
      });

      setup.logger.info('Log event #1');
      return setup;
    },
    'there should be one message only': function (result) {
      assert.equal(result.messages.length, 1);
    },
    'message should contain proper data': function (result) {
      checkMessages(result);
    }
  },
  'config with layout': {
    topic: function () {
      const setup = setupLogging('config with layout', {
        layout: {
          type: 'tester'
        }
      });
      return setup;
    },
    'should configure layout': function (result) {
      assert.equal(result.layouts.type, 'tester');
    }
  },
  'separate notification for each event': {
    topic: function () {
      const self = this;
      const setup = setupLogging('separate notification for each event', {
        token: 'TOKEN',
        channel_id: '#CHANNEL',
        username: 'USERNAME',
        format: 'FORMAT',
        icon_url: 'ICON_URL',
      });
      setTimeout(() => {
        setup.logger.info('Log event #1');
      }, 0);
      setTimeout(() => {
        setup.logger.info('Log event #2');
      }, 500);
      setTimeout(() => {
        setup.logger.info('Log event #3');
      }, 1100);
      setTimeout(() => {
        self.callback(null, setup);
      }, 3000);
    },
    'there should be three messages': function (result) {
      assert.equal(result.messages.length, 3);
    },
    'messages should contain proper data': function (result) {
      checkMessages(result);
    }
  }
}).export(module);
