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

let rantDb = []

// Receive messages from the user and respond by echoing each message back (prefixed with 'You said:')
const bot = new builder.UniversalBot(connector, session => {
  session.send(
    "Hi, I'm OhMyBot! You can give me feedback or ask for results with a #hashtag."
  )

  session.endDialog()
})

const model = process.env.MICROSOFT_LUIS_ENDPOINT
bot.recognizer(new builder.LuisRecognizer(model))

bot.dialog('/clarify', [
  (session, args) => {
    session.dialogData.message = rantDb[args.id]
    const message = session.dialogData.message

    builder.Prompts.text(
      session,
      `Hi! Can you please clarify what you meant by "${message.text}?"`
    )
  },
  (session, results) => {
    const message = session.dialogData.message

    rantDb[message.id].responses.push(results.response)

    session.send('Thanks!')
    session.endDialog()
  }
])

bot
  .dialog('Rant', session => {
    const text = session.message.text
    const address = session.message.address
    const lastFeedback = session.userData.lastFeedback

    const hashtagRegex = /#[\w\d\-]*/g
    const hashtags = text.match(hashtagRegex)

    if (!hashtags) {
      session.send('No hashtags to find :(')
      session.endDialog()

      return
    }

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

    session.send('Thanks for the feedback!')
    session.endDialog()
  })
  .triggerAction({ matches: 'Rant' })

bot
  .dialog('Retro', session => {
    const text = session.message.text
    const address = session.message.address
    const lastFeedback = session.userData.lastFeedback

    const hashtagRegex = /#[\w\d\-]*/g
    const hashtag = text.match(hashtagRegex)

    if (!hashtag) return session.send('No hashtags to find :(')

    session.sendTyping()

    const rants = rantDb.filter(r => hashtag.some(h => r.hashtags.includes(h)))

    Promise.all(
      rants.map(r =>
        anonymize(r.text).then(anonText =>
          Object.assign({}, r, { text: anonText })
        )
      )
    )
      .then(response => {
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
                        r.responses.map(resp => `   * ${resp}`).join('\n')}`
                )
                .join('\n')}`

        session.send(message)
        session.endDialog()
      })
      .catch(e => {
        session.send(`Whoops, ${e.message}`)
        session.endDialog()
      })
  })
  .triggerAction({ matches: 'Retro' })

bot
  .dialog('Clarification', session => {
    const text = session.message.text
    const lastFeedback = session.userData.lastFeedback

    let message
    try {
      const messageNumber = text.match(/#\d+/g)
      if (!messageNumber) throw new Error()
      const messageIndex = parseInt(messageNumber[0].replace('#', '')) - 1
      message = lastFeedback[messageIndex]

      if (!message || !message.address) throw new Error()
    } catch (e) {
      return session.send("That's not a real message >:(")
    }

    setTimeout(() => {
      bot.beginDialog(message.address, '*:/clarify', { id: message.id })
    }, 500)

    session.send("Thanks! I'll follow up")
    session.endDialog()
  })
  .triggerAction({ matches: 'Clarification' })

bot
  .dialog('Hello', session => {
    session.send('Hello!')
    session.endDialog()
  })
  .triggerAction({ matches: 'Hello' })

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
  const FROM = 'en'
  const TO = 'es'

  return translate(text, FROM, TO).then(translated =>
    translate(translated, TO, FROM)
  )
}
