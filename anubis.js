/**
 * anubisbot-MD  https://github.com/anubiskun/anubisbot-MD
 * 
 * Copyright (c) 2022 anubiskun
 * https://github.com/anubiskun
 */

require('./conf')
const opts = new Object(require('yargs/yargs')(process.argv.slice(2)).exitProcess(false).parse())
const { default: WAConnection, DisconnectReason, useMultiFileAuthState, fetchLatestWaWebVersion, S_WHATSAPP_NET, makeInMemoryStore, jsonFileAuth } = require('@adiwajshing/baileys')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const Path = require('path')
const _ = require('lodash')
const syntaxerror = require('syntax-error')
const pino = require('pino').default
const { Low, JSONFileSync } = require('./library/lowdb')
const mongoDB = require('./library/mongoDB')
const database = new Low(opts['test'] ? new JSONFileSync(`database.json`) : new mongoDB(mongoUser))
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function loadDatabase() {
    await database.read()
    console.log('LOADING DATABASE...')
    await sleep(5000)
    if (database.READ) return new Promise((resolve) => setInterval(function () { (!database.READ ? (clearInterval(this), resolve(database.data == null ? loadDatabase() : database.data)) : null) }, 0.5 * 1000))
    if (typeof database.data !== 'object') database.data = {}
    database.READ = true
    await database.read()
    database.READ = false
    if (typeof database.data.users !== 'object') database.data.users = {}
    if (typeof database.data.chats !== 'object') database.data.chats = {}
    if (typeof database.data.auth !== 'object') database.data.auth = {}
    if (typeof database.data.stats !== 'object') database.data.stats = {}
    if (typeof database.data.msgs !== 'object') database.data.msgs = {}
    if (typeof database.data.database !== 'object') database.data.database = {}
    if (typeof database.data.others !== 'object') database.data.others = {}
    if (typeof database.data.settings !== 'object') database.data.settings = {}
    database.data = {
        ...(database.data || {})
    }
    database.chain = _.chain(database.data)
    return
}

let pluginFolder = Path.join(__dirname, 'plugins')
let pluginFilter = filename => /\.js$/.test(filename)
global.plugins = {}
for (let filename of fs.readdirSync(pluginFolder).filter(pluginFilter)) {
    try {
        global.plugins[filename] = require(Path.join(pluginFolder, filename))
    } catch (e) {
        console.log(e)
        delete global.plugins[filename]
    }
}
console.log(Object.keys(global.plugins))

global.reload = (_event, filename) => {
    if (pluginFilter(filename)) {
        let dir = Path.join(pluginFolder, filename)
        if (dir in require.cache) {
            delete require.cache[dir]
            if (fs.existsSync(dir)) console.log(`re - require plugin '${filename}'`)
            else {
                console.log(`deleted plugin '${filename}'`)
                return delete global.plugins[filename]
            }
        } else console.log(`requiring new plugin '${filename}'`)
        let err = syntaxerror(fs.readFileSync(dir), filename)
        if (err) console.log(`syntax error while loading '${filename}'\n${err}`)
        else try {
            global.plugins[filename] = require(dir)
        } catch (e) {
            console.log(e)
        } finally {
            global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)))
        }
    }
}

async function reloadConnector() {
    let { anubisFunc, smsg } = require('./library/lib')
    const { version, error } = await fetchLatestWaWebVersion()
    const { state, anuCreds } = await jsonFileAuth(database.data.auth, global.sesName) // uncomment this line if you want to use database cloud
    // const {state, anuCreds} = await jsonFileAuth(global.sesName + '.json') // uncomment this line if you want to use database local
    // const {state, anuCreds} = await useMultiFileAuthState(global.sesName) // uncomment this line if you want to use multi file auth state
    await database.write()
    const anubis = WAConnection({
        version: (error) ? [2, 2234, 13] : version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: [global.author, 'Safari', '1.0.0'],
        generateHighQualityLinkPreview: true,
        linkPreviewImageThumbnailWidth: 200,
        syncFullHistory: true,
        connectTimeoutMs: 5000,
    })
    anubis.db = database
    anubis.anubiskun = S_WHATSAPP_NET
    Object.freeze(global.reload)
    fs.watch(Path.join(__dirname, 'plugins'), global.reload)
    const libCon = require('./library/conector')
    anubis.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'connecting') console.log('sabar ngab lagi nyoba menghubungkan!')
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode
            if (reason === DisconnectReason.badSession) { console.log(`Bad Session, reconnecting...`); reloadConnector(); }
            else if (reason === DisconnectReason.connectionClosed) { console.log("Connection closed"); reloadConnector(); }
            else if (reason === DisconnectReason.connectionLost) { console.log("Connection Lost from Server, reconnecting..."); reloadConnector(); }
            else if (reason === DisconnectReason.connectionReplaced) { console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First"); process.send('stop'); }
            else if (reason === DisconnectReason.loggedOut) { console.log(`Device Logged Out, Please Scan Again And Run.`); delete database.data.auth[global.sesName]; await database.write(); reloadConnector(); }
            else if (reason === DisconnectReason.restartRequired) { console.log("Restart Required, Restarting..."); reloadConnector(); }
            else if (reason === DisconnectReason.timedOut) { console.log("Connection TimedOut, Reconnecting..."); reloadConnector(); }
            else if (reason === DisconnectReason.multideviceMismatch) { console.log("Multi device mismatch, please scan again"); delete database.data.auth[global.sesName]; await database.write(); reloadConnector() }
            else anubis.end(`Unknown DisconnectReason: ${reason}|${connection}`)
        }
        if (update.receivedPendingNotifications) {
            const { isLatest, version, changeLogs } = await anubisFunc(anubis).anuUpdate()
            global.ownerNum.forEach(async (Owner) => {
                console.log(`\n\nChangelogs :\n${require(__root + 'package.json').changeLogs[0]}\n\n`)
                let a = await anubis.sendMessage(Owner + anubis.anubiskun, { text: 'Bot jalan ngab!' })
                if (isLatest) anubis.sendMessage(Owner + anubis.anubiskun, { text: `New Update [ *anubisbot-MD* *v${version}* ]\n\n${changeLogs[0]}` })
                if (a.status) console.log('BOT RUNNING!')
                let prem = Object.entries(anubis.db.data.users).map(([key, value]) => { return { ...value, jid: key } }).filter((v) => v.isPremium)
                for (let user of prem) {
                    if (user.isPremium) {
                        if (user.premTime < (new Date() * 1)) {
                            anubis.db.data.users[user.jid].isPremium = false
                            anubis.db.data.users[user.jid].premTime = -1
                        }
                    }
                }
                if (anubis.db.data.database.lastRestart) {
                    a = await anubis.sendMessage(Owner + anubis.anubiskun, { text: 'Aku kembali aaay! 💖' })
                    if (a.status) anubis.db.data.database.lastRestart = false
                }
            })
        }
    })
    anubis.ev.on('messages.upsert', (chatupdate) => {
        for (let i = 0; i < chatupdate.messages.length; i++) {
            const conn = anubisFunc(anubis, store)
            const anu = chatupdate.messages[i];
            if (!anu.message && !anu.pushName) return;
            anu.message = Object.keys(anu.message)[0] === "ephemeralMessage" ? anu.message.ephemeralMessage.message : anu.message;
            if (anu.key && anu.key.remoteJid === "status@broadcast") return;
            if (anu.key.id.startsWith("BAE5") && anu.key.id.length === 16) return;
            const m = smsg(conn, anu, store);
            if (global['jadibot-' + m.chat.split('@')[0]]) return
            libCon.anuConector(chatupdate, anubis, m, store)
        }
    })
    anubis.ev.on('group-participants.update', (gcUpdate) => { libCon.gcParticipantUpdate(gcUpdate, anubisFunc(anubis, store)) })
    anubis.ev.on('groups.update', (gcUp) => { libCon.gcUpdate(gcUp, anubisFunc(anubis, store)) })
    anubis.ev.on('call', async (call) => { libCon.callUpdate(call, anubisFunc(anubis, store)) })
    anubis.ev.on('contacts.update', (contactUpdate) => { libCon.contactUpdate(contactUpdate, anubisFunc(anubis, store), store) })
    store.bind(anubis.ev)
    anubis.ev.on('creds.update', async () => {
        anuCreds();
        await database.write()
    })
    // if (opts['server']) (!server) ? require(__root + 'server.js')(anubis, store) : server = true
    return true
}


setTimeout(async () => {
    await loadDatabase()
    console.log('DATABASE LOADED!')
    setInterval(async () => {
        await database.write()
    }, 30 * 1000)
    await reloadConnector()
}, 1000)