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
  const result = handleMessage(
    session.message.text,
    session.message.address,
    session.userData.lastFeedback
  )

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
        session.userData.lastFeedback = response

        const message =
          response.length === 0
            ? 'Nothing to report!'
            : `Here's what people said...\n${response
                .map(
                  (r, index) =>
                    `${index + 1}. ${r.text}${!r.responses
                      ? ''
                      : '\n' +
                        r.responses.map(resp => `  * ${resp}`).join('\n')}`
                )
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
  RETRO: 'RETRO',
  CLARIFY: 'CLARIFY',
  DUMP: 'DUMP'
}

const COMMAND_PATTERNS = {
  HELLO: /.*\\\\Hello\s*/g,
  RANT: /.*\\\\Rant\s*/g,
  RETRO: /.*\\\\Retro\s*/g,
  CLARIFY: /.*\\\\Clarify\s*/g,
  DUMP: /.*\\\\Dump\s*/g
}

/**
 * Dispatches a command sent to OhMyBot
 *
 * @param {string} text Message text
 * @param {IAddress} address User's address for future messages
 * @param {*} lastFeedback The last dump of retro data given to the user
 * @return {Promise<boolean | string[]>}
 */
function handleMessage(text, address, lastFeedback) {
  const commandType = text.match(COMMAND_PATTERNS.RANT)
    ? COMMANDS.RANT
    : text.match(COMMAND_PATTERNS.RETRO)
      ? COMMANDS.RETRO
      : text.match(COMMAND_PATTERNS.HELLO)
        ? COMMANDS.HELLO
        : text.match(COMMAND_PATTERNS.CLARIFY)
          ? COMMANDS.CLARIFY
          : text.match(COMMAND_PATTERNS.DUMP) ? COMMANDS.DUMP : null

  const args = getArgs(text)

  if (commandType === COMMANDS.RANT)
    return handleRant(
      text.replace(COMMAND_PATTERNS.RANT, ''),
      address,
      lastFeedback,
      args
    )
  if (commandType === COMMANDS.RETRO)
    return handleRetro(
      text.replace(COMMAND_PATTERNS.RETRO, ''),
      address,
      lastFeedback,
      args
    )
  if (commandType === COMMANDS.HELLO)
    return handleHello(
      text.replace(COMMAND_PATTERNS.HELLO, ''),
      address,
      lastFeedback,
      args
    )
  if (commandType === COMMANDS.DUMP)
    return handleDump(
      text.replace(COMMAND_PATTERNS.DUMP, ''),
      address,
      lastFeedback,
      args
    )
  if (commandType === COMMANDS.CLARIFY)
    return handleClarify(
      text.replace(COMMAND_PATTERNS.CLARIFY, ''),
      address,
      lastFeedback,
      args
    )

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
 * @param {IAddress} address User's address for future messages
 * @param {*} lastFeedback The last dump of retro data given to the user
 * @param {*} args Arguments passed in message
 * @return {string}
 */
function handleHello(text, address, lastFeedback, args) {
  return Promise.resolve('Hello!')
}

let rantDb = []

/**
 * Adds a rant to the DB
 *
 * @param {string} text Message text passed to OhMyBot. Should have \\Rant stripped.
 * @param {IAddress} address User's address for future messages
 * @param {*} lastFeedback The last dump of retro data given to the user
 * @param {*} args Arguments passed in message
 * @return {true}
 */
function handleRant(text, address, lastFeedback, args) {
  const hashtagRegex = /#[\w\d\-]*/g
  const hashtags = text.match(hashtagRegex)

  if (!hashtags) return Promise.reject(new Error('No hashtags to find :('))

  const realText = text.replace(hashtagRegex, '')
  const dbEntry = {
    id: rantDb.length,
    text: realText,
    hashtags: [...hashtags],
    address,
    date: Date.now(),
    responses: []
  }

  rantDb.push(dbEntry)

  return Promise.resolve(true)
}

/**
 * Flushes the rant DB and returns all results
 *
 * @param {string} text Message passed to OMB. Doesn't do anything with it
 * @param {IAddress} address User's address for future messages
 * @param {*} lastFeedback The last dump of retro data given to the user
 * @param {*} args Arguments passed in message
 * @return {string[]}
 */
function handleRetro(text, address, lastFeedback, args) {
  const hashtagRegex = /#[\w\d\-]*/g
  const hashtag = text.match(hashtagRegex)

  if (!hashtag) return Promise.reject(new Error('No hashtags to find :('))

  const rants = rantDb.filter(
    r =>
      hashtag.some(h => r.hashtags.includes(h)) && Date.now() - r.date < 60000
  )

  if (args.t === 'no') return Promise.resolve(rants)

  return Promise.all(
    rants.map(r =>
      anonymize(r.text).then(anonText =>
        Object.assign({}, r, { text: anonText })
      )
    )
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

/**
 * Handles when the user wants to clarify a message
 *
 * @param {string} text
 * @param {IAddress} address
 * @param {*} lastFeedback The last dump of retro data given to the user
 * @param {*} args
 * @return {Promise<string>}
 */
function handleClarify(text, address, lastFeedback, args) {
  let message
  try {
    const messageIndex = parseInt(text.replace(/\s/g, '')) - 1
    message = lastFeedback[messageIndex]

    if (!message || !message.address) throw new Error()
  } catch (e) {
    return Promise.reject(new Error("That's not a real message >:("))
  }

  setTimeout(() => {
    bot.beginDialog(message.address, '*:/clarify', { id: message.id })
  }, 500)

  return Promise.resolve("Thanks! I'll follow up")
}

/**
 * Dumps the DB
 *
 * @param {string} text
 * @param {IAddress} address
 * @param {*} lastFeedback The last dump of retro data given to the user
 * @param {*} args
 * @return {Promise<string>}
 */
function handleDump(text, address, lastFeedback, args) {
  return Promise.resolve(rantDb)
}

bot.dialog('/clarify', (session, args, next) => {
  if (args) session.dialogData.message = rantDb[args.id]
  const message = session.dialogData.message

  if (session.message.text) {
    rantDb[message.id].responses.push(session.message.text)

    session.send('Thanks!')
    session.endDialog()
  } else {
    session.send(
      `Hi! Can you please clarify what you meant by ${message.text}?`
    )
  }
})
