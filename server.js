require('dotenv').config()
const restify = require('restify')
const builder = require('botbuilder')
const MsTranslator = require('mstranslator')

const server = restify.createServer()
server.listen(process.env.port || process.env.PORT || 3978, () => {
  console.log('%s listening to %s', server.name, server.url)
})

const translatorClient = new MsTranslator(
  { api_key: process.env.MICROSOFT_TRANSLATOR_KEY },
  true
)

// Create chat connector for communicating with the Bot Framework Service
const connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
})

// Listen for messages from users
server.post('/api/messages', connector.listen())

// Receive messages from the user and respond by echoing each message back (prefixed with 'You said:')
const bot = new builder.UniversalBot(connector, session => {
  // session.send('You said: %s', session.message.text)
  const result = handleMessage(session.message.text)

  if (!result) {
    return session.send("I don't know what you meant :(")
  }

  session.sendTyping()

  result.then(responses => {
    if (responses === true) {
      return session.send('Thanks bud!')
    }

    if (typeof responses === 'string') {
      return session.send(responses)
    }

    if (typeof responses === 'object') {
      const keys = Object.keys(responses)
      const message = keys.length === 0
        ? 'Nothing to report!'
        : keys
          .map(hashtag => formatResponse(responses[hashtag], hashtag))
          .join('\n\n')

      return session.send(message)
    }

    return session.send(':O')
  })
})

const formatResponse = (thread, hashtag) =>  `#${hashtag}...\n${thread
  .map(r => `* ${r}`)
  .join('\n')}`

const COMMANDS = {
  HELLO: 'HELLO',
  GIVE: 'GIVE',
  GET: 'GET'
}

const COMMAND_PATTERNS = {
  GIVE: /#[^\s]+/g,
  GET: /\\\\[^\s]+/gi
}

const feedbackDb = []

const lookback = 600000

/**
 * Dispatches a command sent to OhMyBot
 *
 * @param {string} text Message text
 * @return {Promise<boolean | string[]>}
 */
function handleMessage(text) {
  const hashtags = text.match(COMMAND_PATTERNS.GIVE)
  const requests = text.match(COMMAND_PATTERNS.GET)

  const commandType = hashtags
    ? COMMANDS.GIVE
    : requests
    ? COMMANDS.GET
    : COMMANDS.HELLO

  const args = getArgs(text)

  if (commandType === COMMANDS.GIVE)
    return handleFeedback({ text, args, hashtags })
  if (commandType === COMMANDS.GET)
    return handleFeedbackRequest({ text, args, requests })
  if (commandType === COMMANDS.HELLO)
    return handleHello(text.replace(COMMAND_PATTERNS.HELLO, ''), args)

  return null
}

/**
 * Extract arguments from text
 *
 * @param {string} text text to extract args from
 * @return {*}
 */
function getArgs(text) {
  const argText = text.split(';;')[1] || ''

  return argText.split(',').reduce((acc, str) => {
    const [key, value] = str.split('=')

    acc[key] = value
    return acc
  }, {})
}

/**
 * Just says hi
 *
 * @param {string} text Don't care bout this
 * @param {*} args Arguments passed in message
 * @return {string}
 */
function handleHello(text, args) {
  return Promise.resolve('Hello! You can provide feedback with hashtags or see feedback with backslashes (#worklifebalance, \\\\\\worklifebalance)')
}

/**
 * Adds a rant to the DB
 *
 * @param {string} text Message text passed to OhMyBot. Should have \\Rant stripped.
 * @param {*} args Arguments passed in message
 * @return {true}
 */
function handleFeedback({ text, hashtags, args }) {
  const strippedHashtags = hashtags
    .map(hashtag => hashtag.slice(1))
    .map(hashtag => hashtag.toLowerCase())

  strippedHashtags.forEach(hashtag => {
    const textWithoutHashtag = text.replace('#' + hashtag, '')
    feedbackDb.push({
      hashtag,
      time: Date.now(),
      text: textWithoutHashtag })
  })
  return Promise.resolve(true)
}

/**
 * Flushes the rant DB and returns all results
 *
 * @param {string} text Message passed to OMB. Doesn't do anything with it
 * @param {*} args Arguments passed in message
 * @return {string[]}
 */
function handleFeedbackRequest({ requests, args }) {

  if (args.t === 'no') return Promise.resolve(rants)

  return getFeedback({
    lookback,
    requests: requests.map(req => req.slice(2))
  })
}

function getFeedback({ requests, lookback }) {
  return anonymizeFeedback({ requests, lookback })
    .then(feedback => feedback
      .reduce((acc, { hashtag, text }) => {
        acc[hashtag].push(text)
        return acc
      },
      requests.reduce((acc, hashtag) => {
        acc[hashtag] = []
        return acc
      }, {})))
}

function filterAndSortFeedback({ requests, lookback }) {
  return [...feedbackDb]
    .filter(({ hashtag }) => requests.indexOf(hashtag) !== -1)
    .filter(({ time }) => Date.now() - time < lookback)
    .sort((a, b) => a.time < b.time ? -1 : a.time === b.time ? 0 : 1)
}

function anonymizeFeedback({ requests, lookback }) {
  return Promise.all(
    filterAndSortFeedback({ requests, lookback })
      .map(({ hashtag, text }) => anonymize(text)
        .then(result => ({ hashtag, text: result })))
  )
}

/**
 * Translates a string :O
 *
 * @param {string} text Text to translate
 * @return {Promise<string>}
 */
function translate(text, from, to) {
  return new Promise((resolve, reject) => {
    translatorClient.translate({ text, from, to }, (err, data) => {
      if (err) return reject(err)

      resolve(data)
    })
  })
}

/**
 * Anonymize text by translating twice
 *
 * @param {string} text
 * @return {Promise<string>}
 */
function anonymize(text) {
  return translate(text, 'en', 'es').then(translated =>
    translate(translated, 'es', 'en')
  )
}

