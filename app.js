"use strict";
// 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
// 2. xmms preferences...general plugins...song change plugin...set command to curl -G winamp:3000/newsong/%f &
const { execFile } = require('child_process');
const Express  = require('express');
const Fs       = require("fs");
const App      = Express();
const playList = "/home/ian/monday.pls";
const DIR      = false;
const DEBUG    = true;
const TEXT     = true;

let clients    = [];
let state = {
    duration: 0,
    log: [],
    mute: false,
    pause: false,
    playList: [],
    progress: 0,
    shuffle: true,
    volume: 40
};

setupExpress();
setupWebsocket();
setVolume();
getPlayList();

Fs.watchFile(playList, () => { getPlayList() } ); 

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

    App.get('/:arg1/:arg2?/:arg3?', async (_request, _response) => {
        const remoteAddress = _request.socket.remoteAddress; 
        let index = parseInt(_request.params.arg2);

        try { 
            return new Promise(async (_resolve, _reject) => { 
                switch (_request.params.arg1) {
                    case "prev":
                        execFile('xmms', ['-r']);
                    break;

                    case "pause":
                        execFile('xmms', ['-t']);
                        state.pause = !state.pause;
                    break;

                    case "next":
                        execFile('xmms', ['-f']);
                    break;          

                    case "shuffle":
                    case "shuffleenabled":
                        execFile('xmms', ['-S']);
                        state.shuffle = !state.shuffle;
                    break;

                    case "playsong":
                        execFile('qxmms',['jump',parseInt(_request.params.arg2) + 1]);
                    break;

                    case "setvolume":
                        if (_request.params.arg2 == 'volup')
                             state.volume++;
                                else if (_request.params.arg2 == 'voldown')
                                     state.volume--;
                                        else if (_request.params.arg2 == 'mute')
                                            state.mute = !state.mute;
                                                else 
                                                     state.volume = parseInt(_request.params.arg2);
                        setVolume();
                    break;

                    case "queuesong":   // this adds it to the bottom of the playList & queues it
                            await getPlayList(index).then((_path) => { // getting this to work.... really hurt                            
                                if (_request.params.arg1 == 'queuesong') {
                                    log(TEXT, state.playList[index] + " queued");
                                    execFile('xmms', ['-Q',_path]);
                                    state.popupDialog = state.playList[_request.params.arg2] + " queued";
                                    sendState(remoteAddress,'finally queuesong -> ' + _request.params.arg1 + " index -> " + _request.params.arg2 + " title -> " + state.playList[_request.params.arg2]); 
                                    _resolve();
                                } // if (_request.params.arg1 == 'queuesong') {
                            }); // await getPlayList(index).then((_path) => {
                    break;

                    case "newsong":
                        index--;
                        state.pause = false;
                        
                        if (index < state.playList.length) { // || (playList.length == 0)
                            log(TEXT,"New song index -> " + index + " -> " + state.playList[index]);
                            state.log.push(index);
                        } else { // queued mp3 at end of playlist
                                log(TEXT,"Queued song");
                                execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                                    for (let i = 0; i < state.playList.length; i++)
                                        if (state.playList[i].includes(_stdio.split(/\/[a-z]\//i)[1].slice(0,-5))) { // remove cr from _stdio
                                            state.log.push(i);
                                            log(TEXT,"Queued song index -> " + i + " " + _stdio);
                                        } // if (playList[i].includes(_stdio.slice(0,-1))) { // remove cr from _stdio
                                    }); // execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                                } //     } else {

                        connectXmmsToDarkice();
                        log(TEXT,"log length -> " + state.log.length);
                    break;
                } // switch (_request.params.arg1) {

            log(TEXT,"switch resolved()");
            _resolve();
            }); // new Promise(async (_resolve, _reject) => { 
        } catch (_err) { log(TEXT, "newfunc err -> " + _err); } 
        finally {
            await getState('finally').then(async () => {
                log(TEXT,"finally _request.params.arg1 -> " + _request.params.arg1);
                log(TEXT,"finally state.progress -> " + state.progress);
                log(TEXT,"finally state.log length -> " + state.log.length);
                log(TEXT,"finally state.log current -> " + state.log[state.log.length - 1]);

                if (_request.params.arg1 == 'newsong')
                    sendState('SENDTOALL','finally -> ' + _request.params.arg1); 
                    else
                        if ((_request.params.arg1 != 'getplaylist') || (_request.params.arg1 != 'queuesong')) 
                            sendState(remoteAddress,'finally -> ' + _request.params.arg1); 
                            setTimeout(function() { 
                                log(TEXT,"sending bb state");
                                log(DIR,state);
                                log(TEXT,"\n---------------------------\n\n");
                                _response.send(state);
                                _response.end();
                            },250);
                        }); // await getState('finally').then(() => { 
        } // finally {
    }); // App.get('/:arg1/:arg2?/:arg3?', (_request, _response) => {
} // function setupExpress() {

function setupWebsocket() {
    log(TEXT,"setupWebsocket()");
    const Http     = require('http');
    const WSServer = require('websocket').server;

    const wsHttp = Http.createServer((_request, _response) => {
        log(TEXT,'Received request for ' + _request.url + " returning 404");

        _response.writeHead(404);
        _response.end();
    }).listen(6502);

    const wsServer = new WSServer({
        url: "ws://localhost:6502",
        httpServer: wsHttp
    }); 

    wsServer.on('connect', (_connection) => {
        log(TEXT,"websocket new connection from -> " + _connection.remoteAddress);
        clients.push(_connection);
    });

    wsServer.on('request', (_request) => {
        log(TEXT,"websocket request -> " + _request.resource + " from -> " + _request.remoteAddress);
        _request.accept('winamp', _request.origin);
    });

    wsServer.on('close', (_connection) => {
        clients = clients.filter((el, idx, ar) => {
            return el.connected;
        });

        log(TEXT,"Peer " + _connection.remoteAddress + " disconnected.");
    }); //  connection.on('close', (_connection) => {
} // function setupWebsocket() {

function setVolume() {
    log(TEXT,"setVolume() state.volume -> " + state.volume + " state.mute -> " + state.mute);
    
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume]);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

async function getPlayList(_index) {
    log(TEXT, "getPlayList(" + _index + ")");
    /* xmms monday.pls file looks like this
    [playList]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    const Readline = require('readline');

    try {
        let line = 2;
        const fileStream = Fs.createReadStream(playList);
        const rl = Readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let promise = new Promise(async (_resolve, _reject) => {
            let currentLine = 1;

            if (_index == undefined) {
                state.playList = [];
                state.log = [];

                for await (line of rl) 
                    try {
                        if (line.includes('File')) 
                            state.playList.push(line.split(/\/[a-z]\//i)[1].slice(0,-4));
                    } catch (_err) { log(TEXT,"for await (const line of rl) error -> " + _err); }
            } else { // if (_index == undefined) {
                    _index+=3;
                    try {
                        for await (line of rl) {
                            if (_index == currentLine++) {
                                log(TEXT,"resolved queueing -> " + line.split(/=/)[1]);
                                execFile('xmms', ['-Q',line.split(/=/)[1]]);
                            }
                        } // for await (line of rl) {
                    } catch (_err) { log(TEXT,"for await (const line of rl) error -> " + _err); }
                } // } else { // if (_index == undefined) {
               
        log(TEXT, "resolved " + state.playList.length + " songs in playlist");

        await getState('getPlayList(' + _index + ')').then(
              () => {
                    if (_index != undefined)
                        sendState('SENDTOALL','queuesong');
                    });
        _resolve();
      }); // let promise = new Promise(async (_resolve, _reject) => {
    } catch (_err) { log(TEXT, "function getPlayList() error -> " + _err); }
} // function getPlayList() {

function connectXmmsToDarkice() {
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
    });
}

async function getState(_logMsg) {
    log(TEXT,"getState(" + _logMsg + ")");

    try {
        return new Promise(  (_resolve, _reject) => {
            execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
                const args = _stdio.split(" ");

                state.duration = parseInt(args[0]);
                state.progress = parseInt(args[1]);

                log(TEXT,"getState(" + _logMsg + ") resolved duration -> " + state.duration);
                log(TEXT,"getState(" + _logMsg + ") resolved progress -> " + state.progress);

                _resolve();
            }); // execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
        }); // new Promise(async (_resolve, _reject) => {
    } catch (_err) { log(TEXT,"getState(" + _logMsg + ") err -> " + _err)}
}

function sendState(_dontSendTo, _logMsg) {
    log(TEXT,"sendState(" + _dontSendTo + ", " + _logMsg + ")");
    
    if (clients.length == 0) 
        return;

    log(DIR, state);

    for (let i = 0; i < clients.length; i++) 
        if (clients[i].remoteAddress != _dontSendTo) {
            log(TEXT,"Sending state to -> " + clients[i].remoteAddress);
            clients[i].send(JSON.stringify({state: state}));
            } else 
                    log(TEXT,"NOT sending state to -> " + clients[i].remoteAddress);

    if (state.hasOwnProperty('popupDialog')) {
        log(TEXT,"removing popupDialog from state");
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
