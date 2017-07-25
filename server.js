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

  result
    .then(response => {
      if (response === true) {
        return session.send('Thanks bud!')
      }

      if (typeof response === 'string') {
        return session.send(response)
      }

      if (Array.isArray(response)) {
        const message =
          response.length === 0
            ? 'Nothing to report!'
            : `Here's what some people said...\n${response
                .map(r => `* ${r}`)
                .join('\n')}`

        return session.send(message)
      }

      return session.send(':O')
    })
    .catch(e => {
      return session.send(`Whoops, ${e.message}`)
    })
})

const COMMANDS = {
  HELLO: 'HELLO',
  RANT: 'RANT',
  RETRO: 'RETRO'
}

const COMMAND_PATTERNS = {
  HELLO: /.*\\\\Hello\s*/g,
  RANT: /.*\\\\Rant\s*/g,
  RETRO: /.*\\\\Retro\s*/g
}

/**
 * Dispatches a command sent to OhMyBot
 *
 * @param {string} text Message text
 * @return {Promise<boolean | string[]>}
 */
function handleMessage(text) {
  const commandType = text.match(COMMAND_PATTERNS.RANT)
    ? COMMANDS.RANT
    : text.match(COMMAND_PATTERNS.RETRO)
      ? COMMANDS.RETRO
      : text.match(COMMAND_PATTERNS.HELLO) ? COMMANDS.HELLO : null

  const args = getArgs(text)

  if (commandType === COMMANDS.RANT)
    return handleRant(text.replace(COMMAND_PATTERNS.RANT, ''), args)
  if (commandType === COMMANDS.RETRO)
    return handleRetro(text.replace(COMMAND_PATTERNS.RETRO, ''), args)
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
  return Promise.resolve('Hello!')
}

let rantDb = []

/**
 * Adds a rant to the DB
 *
 * @param {string} text Message text passed to OhMyBot. Should have \\Rant stripped.
 * @param {*} args Arguments passed in message
 * @return {true}
 */
function handleRant(text, args) {
  const hashtagRegex = /#[\w\d\-]*/g
  const hashtags = text.match(hashtagRegex)

  if (!hashtags) return Promise.reject(new Error('No hashtags to find :('))

  const realText = text.replace(hashtagRegex, '')
  const dbEntry = {
    text: realText,
    hashtags: [...hashtags],
    date: Date.now()
  }

  rantDb.push(dbEntry)

  return Promise.resolve(true)
}

/**
 * Flushes the rant DB and returns all results
 *
 * @param {string} text Message passed to OMB. Doesn't do anything with it
 * @param {*} args Arguments passed in message
 * @return {string[]}
 */
function handleRetro(text, args) {
  const hashtagRegex = /#[\w\d\-]*/g
  const hashtag = text.match(hashtagRegex)

  if (!hashtag) return Promise.reject(new Error('No hashtags to find :('))

  const rants = rantDb
    .filter(r => hashtag.some(h => r.hashtags.includes(h)))
    .map(r => r.text)

  if (args.t === 'no') return Promise.resolve(rants)

  return Promise.all(rants.map(anonymize))
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
