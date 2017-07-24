require('dotenv').config()
const restify = require('restify')
const builder = require('botbuilder')

const server = restify.createServer()
server.listen(process.env.port || process.env.PORT || 3978, () => {
  console.log('%s listening to %s', server.name, server.url)
})

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

  if (result === true) {
    return session.send('Thanks bud!')
  }

  if (Array.isArray(result)) {
    const message =
      result.length === 0
        ? 'Nothing to report!'
        : `Here's what some people said...\n${result
            .map(r => `* ${r}`)
            .join('\n')}`

    return session.send(message)
  }

  return session.send(':O')
})

const COMMANDS = {
  RANT: 'RANT',
  RETRO: 'RETRO'
}

const COMMAND_PATTERNS = {
  RANT: /.*\\\\Rant\s*/g,
  RETRO: /.*\\\\Retro\s*/g
}

/**
 * Dispatches a command sent to OhMyBot
 *
 * @param {string} text Message text
 * @return {boolean | string[]}
 */
function handleMessage(text) {
  const commandType = text.match(COMMAND_PATTERNS.RANT)
    ? COMMANDS.RANT
    : text.match(COMMAND_PATTERNS.RETRO) ? COMMANDS.RETRO : null

  if (commandType === COMMANDS.RANT)
    return handleRant(text.replace(COMMAND_PATTERNS.RANT, ''))
  if (commandType === COMMANDS.RETRO)
    return handleRetro(text.replace(COMMAND_PATTERNS.RETRO, ''))

  return null
}

let rantDb = []

/**
 * Adds a rant to the DB
 *
 * @param {string} text Message text passed to OhMyBot. Should have \\Rant stripped.
 * @return {true}
 */
function handleRant(text) {
  rantDb.push(text)

  return true
}

/**
 * Flushes the rant DB and returns all results
 *
 * @param {string} text Message passed to OMB. Doesn't do anything with it
 * @return {string[]}
 */
function handleRetro(text) {
  const rants = [...rantDb]
  rantDb = []

  return rants
}
