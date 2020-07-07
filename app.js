"use strict";
// 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
// 2. xmms preferences...general plugins...song change plugin...set command to curl -G winamp:3000/newsong/%f &
const { execFile } = require('child_process');
const Express  = require('express');
const Fs       = require("fs");
const App      = Express();
const Http     = require('http');
const WSServer = require('websocket').server;
const playListFile = "/home/ian/monday.pls";
const DEBUG    = true;
const TEXT     = true;
const DIR      = false;

let playList = [];
let clients = [];
let state = {
    duration: 0,
    log: [],
    mute: false,
    pause: false,
    progress: 0,
    shuffle: true,
    volume: 40
};

setupExpress();
setupWebsocket();
getPlayList();
setVolume(state.volume);
Fs.watchFile(playListFile, () => { getPlayList() }); 

// turn shuffle on & start playing ...xmms will send /newsong/# http request & setup the initial state
execFile('xmms', ['-Son','-pf']);

function setupExpress() {
    log(TEXT,"setupExpress()");

    const Pug  = require('pug');
    const Path = require('path');
     
    App.engine('Pug', require('pug').__express)
    App.use(Express.static(Path.join(__dirname, 'public')));
    App.use(Express.json());
    App.use(Express.urlencoded( { extended: false } ));

    App.set('views', Path.join(__dirname, 'views'));
    App.set('view engine', 'pug');

    App.get('*', (_request, _response, _next) => {
        log(TEXT,_request.socket.remoteAddress + " -> GET " + _request.url);
        _next();
    });

    App.get('/', (_request, _response) => {
        _response.render('index');
        _response.end();
    });

    App.get('/:arg1/:arg2?',  async (_request, _response) => {
        const remoteAddress = _request.socket.remoteAddress; 
        let index = parseInt(_request.params.arg2);

        switch (_request.params.arg1) {
            case "prev":
                execFile('xmms', ['-r']);
            break;

            case "pause":
                execFile('xmms', ['-t']);
                state.pause = !state.pause;
                sendXmmsState(remoteAddress, _request.params.arg1);
            break;

            case "next":
                execFile('xmms', ['-f']);
            break;          

            case "shuffle":
            case "shuffleenabled":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                sendXmmsState(remoteAddress, _request.params.arg1);
            break;

            case "playsong":
                execFile('qxmms',['jump', parseInt(_request.params.arg2) + 1]);
            break;

            case "setvolume":
                setVolume(_request.params.arg2);
                sendXmmsState(remoteAddress, _request.params.arg1);
            break;

            case "queuesong":                                           // this adds it to the...
                await getPlayList(index).then((_path) => {              // bottom of the playList
                    if (_request.params.arg1 == 'queuesong') {          // & queues it...
                        log(TEXT, _request.socket.remoteAddress + " -> " + playList[index] + " queued");   // getting this to work async....
                        execFile('xmms', ['-Q',_path]);                 // * really hurt *
                        state.popupDialog = playList[_request.params.arg2] + " queued";
                        sendXmmsState('BROADCAST', 'queuesong -> ' + _request.params.arg1 + " index -> " + _request.params.arg2 + " title -> " + playList[_request.params.arg2]); 
                    } // if (_request.params.arg1 == 'queuesong') {
                }); // await getPlayList(index).then((_path) => {
            break;

            case "newsong":
                index--;
                state.pause = false;
                
                if (index < playList.length) { 
                    state.log.push(index);
                    sendXmmsState('BROADCAST', 'newsong index -> ' + _request.params.arg2 + ' title -> ' + playList[_request.params.arg2]); 
                    } else { // queued mp3 at end of playlist
                            log(TEXT,_request.socket.remoteAddress + "-> Queued song");
                            execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                                for (let i = 0; i < playList.length; i++)
                                    if (playList[i].includes(_stdio.split(/\/[a-z]\//i)[1].slice(0,-5))) { // remove cr from _stdio
                                        state.log.push(i);
                                        log(TEXT, _request.socket.remoteAddress + " -> Queued song index -> " + i + " " + _stdio);
                                    } // if (playList[i].includes(_stdio.slice(0,-1))) { // remove cr from _stdio
                            }); // execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                    } // } else {

                connectXmmsToDarkice();
            break;

            case "getstate":
                await getXmmsState("getstate", _request.socket.remoteAddress + " - > " + _request.params.arg1).then(() => {
                    log(TEXT,_request.socket.remoteAddress + " -> sending state to client");
                    log(DIR,state);
                    _response.send(state);
                });
            break;

            case "getplaylist":
                await getPlayList("getplaylist", _request.socket.remoteAddress + " - > " + _request.params.arg1).then(() => {
                    log(TEXT,_request.socket.remoteAddress + " -> sending playlist to client");
                    state.playList = playList;
                    log(DIR,state);
                    _response.send(state);
                    delete state.playList;
                });
            break;

            default:
                log(TEXT,"error case option missing -> " + _request.params.arg1);
        } // switch (_request.params.arg1) {

     _response.end();
    }); // App.get('/:arg1/:arg2?', (_request, _response) => {
} // function setupExpress() {

function setupWebsocket() {
    log(TEXT,"setupWebsocket()");
    
    const wsHttp = Http.createServer((_request, _response) => {
        log(TEXT,_request.socket.remoteAddress + ' -> Websocket received request for ' + _request.url);// + " returning 404");

        _response.writeHead(200);
        _response.end();
    }).listen(6502);

    const wsServer = new WSServer({
        url: "ws://localhost:6502",
        httpServer: wsHttp
    }); 

    wsServer.on('connect', async (_connection) => {
        log(TEXT,_connection.socket.remoteAddress + " -> new Websocket connection");
        clients.push(_connection);

    });

    wsServer.on('request', async (_request) => {
      //  _request.accept('winamp', _request.origin);
        await getXmmsState("websocket stuff", _request.socket.remoteAddress).then(() => {
            var connection = _request.accept('winamp', _request.origin);
            log(TEXT,_request.socket.remoteAddress + " -> sending state to client");
            log(DIR,state);
            state.playList = playList;
            connection.sendUTF(JSON.stringify({state: state}));
        });

        log(TEXT,_request.socket.remoteAddress + " request -> " + _request.resource);       
    });

    wsServer.on('close', (_connection) => {
        clients = clients.filter((el, idx, ar) => {
            return el.connected;
        });

        log(TEXT,_connection.remoteAddress + " -> Websocket disconnected.");
    }); //  connection.on('close', (_connection) => {
} // function setupWebsocket() {

function setVolume(_params) {
    if (_params == 'volup')
        state.volume++;
            else if (_params == 'voldown')
                state.volume--;
                    else if (_params == 'mute')
                        state.mute = !state.mute;
                            else 
                                 state.volume = parseInt(_params);
    
    log(TEXT,"setVolume(" + _params + ") state.volume -> " + state.volume + " state.mute -> " + state.mute);

    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume]);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

/* xmms monday.pls file looks like this
[playList]
NumberOfEntries=5297
File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
*/
async function getPlayList(_index) {
    log(TEXT, "getPlayList(" + _index + ")");

    const Readline = require('readline');
    const fileStream = Fs.createReadStream(playListFile);
    const rl = Readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let currentLine = 1;

    if (_index == undefined) {
        playList = [];
        state.log = [];

        for await (let line of rl) 
            if (line.includes('File')) 
                playList.push(line.split(/\/[a-z]\//i)[1].slice(0,-4));
    } else { // if (_index == undefined) {
            _index+=3;

            for await (let line of rl) {
                if (_index == currentLine++) {
                    log(TEXT,"getPlayList() resolved queueing -> " + line.split(/=/)[1]);
                    execFile('xmms', ['-Q',line.split(/=/)[1]]);
                }
            } // for await (line of rl) {
        } // } else { // if (_index == undefined) {
           
    log(TEXT, "getPlayList() resolved " + playList.length + " songs in playlist");
} // function getPlayList() {

function connectXmmsToDarkice() {
    log(TEXT,"connectXmmsToDarkice()");
    
    execFile('jack_lsp',(_err,_stdio,_stderr) => {
        const lines            = _stdio.split('\n');
        const xmmsJackPorts    = [];
        const darkiceJackPorts = [];

        lines.forEach (_line => {
            if (_line.includes('xmms')) 
                xmmsJackPorts.push(_line);

            if (_line.includes("darkice"))
                darkiceJackPorts.push(_line)
        });

        execFile('jack_connect', [ darkiceJackPorts[0], xmmsJackPorts[0] ]);
        execFile('jack_connect', [ darkiceJackPorts[1], xmmsJackPorts[1] ]);
    }); // execFile('jack_lsp',(_err,_stdio,_stderr) => {
}

async function getXmmsState(_logMsg) {
    await execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
        const args = _stdio.split(" ");

        state.duration = parseInt(args[0]);
        state.progress = parseInt(args[1]);
        log(TEXT,"getXmmsState(" + _logMsg + ") idx -> " + state.log[state.log.length -1] + " -> " + playList[state.log[state.log.length -1]] + " dur -> " + state.duration + " prog -> " + state.progress);
    }); // await execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
}

function sendXmmsState(_dontSendTo, _logMsg) {
    log(TEXT,"sendXmmsState(" + _dontSendTo + ", " + _logMsg + ")");
    log(DIR, state);

    for (let i = 0; i < clients.length; i++) 
        if (clients[i].remoteAddress == _dontSendTo) 
            log(TEXT,"websocket sendXmmsState() NOT sending state to -> " + clients[i].remoteAddress);
                else {
                    log(TEXT,"websocket sendXmmsState() Sending state to -> " + clients[i].remoteAddress);
                    clients[i].send(JSON.stringify({state: state}));
                    } 

    if (state.hasOwnProperty('popupDialog')) {
        log(TEXT,"sendXmmsState() removing popupDialog from state");
        delete state.popupDialog;
    }
}

function log(_type,_msg) {
    if (DEBUG)
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.dir(_msg);
}

module.exports = App;
