"use strict";
// 1. you need qxmms & darkice & node & 
// whatever node needs & a computer for this to work
// 2. xmms preferences...general plugins...
//    song change plugin...set command to
//    curl -G winamp:3000/newsong/%f &
const { execFile } = require('child_process');
const Express  = require('express');
const App      = Express();

const playList = "/home/ian/monday.pls";
const DEBUG    = true;
const TEXT     = true;
const DIR      = false;

var clients    = [];
var state = {
    duration: 0,
    timeRemaining: 0,
    pause: false,
    shuffle: true,
    mute: false,
    volume: 40,
    songsPlayed: [],
    playList: []
};

setupExpress();
setupWebsocket();
setVolume();
getPlayList();

// turn shuffle on & start playing ...xmms will send /newsong/# http request & setup the initial state
execFile('xmms', ['-Son','-pf']);

function getPlayList() {
    /* xmms monday.pls file looks like this
    [playList]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    log(TEXT, "getPlayList()");
    const Fs       = require("fs");
    const Readline = require('readline');

    try {
        Fs.watchFile(playList,  async (_event, _filename) => {
           log(TEXT, "playList " + playList + " changed.");
           getPlayList();
        });

        const fileStream = Fs.createReadStream(playList);
        const rl = Readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        new Promise(async (resolve, reject) => {
            state.playList = [];
            state.songsPlayed = [];
        
            for await (const line of rl) {
                try {
                    if (line.includes('File')) 
                        state.playList.push(line.split(/\/[a-z]\//i)[1].slice(0,-4));
                } catch (_err) { 
                                log(TEXT,"for await (const line of rl) error -> " + _err);
                                }    
            } // for await (const line of rl) {

        log(TEXT, "resolved " + state.playList.length + " songs in playlist");
        resolve(state.playList);
        }); // let promise =  new Promise(async (resolve, reject) => {
    } catch (_err) { 
                    log(TEXT, "function getPlayList() -> " + _err); 
                    }
} // function getPlayList() {

function connectXmmsToDarkice() {
    execFile('jack_lsp',(_err,_stdio,_stderr) => {
        var lines            = _stdio.split('\n');
        var xmmsJackPorts    = [];
        var darkiceJackPorts = [];

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

function sendState(_dontSendTo, _logMsg) {
    log(TEXT,"sendState(" + _dontSendTo + ", " + _logMsg + ")");
    
    execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
        var args = _stdio.split(" ");

        state.duration = parseInt(args[0]);
        state.timeRemaining = Math.abs(state.duration - parseInt(args[1]));

        log(DIR, state);

        for (var i = 0; i < clients.length; i++) 
            if (clients[i].remoteAddress != _dontSendTo) {
                log(TEXT,"Sending state to -> " + clients[i].remoteAddress);
                clients[i].send(JSON.stringify({state: state}));
                } else 
                        log(TEXT,"NOT sending state to -> " + clients[i].remoteAddress);
    
        delete state.popupDialog;
    });
}

function setVolume() {
    log(TEXT,"setVolume() state.volume -> " + state.volume + " state.mute -> " + state.mute);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume]);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

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

    App.get('/:arg1/:arg2?/:arg3?',(_request, _response) => {
        switch (_request.params.arg1) {
            case "prev":
                execFile('xmms', ['-r']);
            break;

            case "pause":
                execFile('xmms', ['-t']);
                state.pause = !state.pause;
                sendState(_request.socket.remoteAddress, _request.url);
            break;

            case "next":
                execFile('xmms', ['-f']);
            break;           

            case "shuffle":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                sendState(_request.socket.remoteAddress, _request.url);
            break;

            case "getstate":
                execFile('qxmms', ['-lnS'] , (_err,_stdio,_stderr) => {
                    state.duration = parseInt(_stdio.toString().split(' ')[0]);
                    state.timeRemaining  = Math.abs(state.duration - parseInt(_stdio.toString().split(' ')[1]));
                    log(DIR, state);
                    _response.send(state);
                    _response.end();
                }); // execFile('qxmms', ['-lnS'] , async (_err,_stdio,_stderr) => {
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
                sendState(_request.socket.remoteAddress, '/setvolume/' + state.volume);
            break;

            case "queuesong":
                var index = parseInt(_request.params.arg2);
               // this adds it to the bottom of the playList & queues it
                var result = execFile("xmms", ['-Q' , getPlayList(index)])

                log(TEXT, "queuesong result -> " + result);
                state.popupDialog = getPlayList("queuesong")[index] + " queued.";
                sendState(_request.socket.remoteAddress, '/queuesong/' + index);
            break;

            case "newsong":
                var index = parseInt(_request.params.arg2) - 1;

                state.pause = false;

                if (index < state.playList.length) { // || (playList.length == 0)
                    log(TEXT,"New song index -> " + index + " -> " + state.playList[index]);
                    state.songsPlayed.push(index);
                } else { // queued mp3 at end of playlist
                        execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                            for (var i = 0; i < state.playList.length; i++)
                                if (state.playList[i].includes(_stdio.split(/\/[a-z]\//i)[1].slice(0,-5))) { // remove cr from _stdio
                                    state.songsPlayed.push(i);
                                    log(TEXT,"Queued song index -> " + i + " " + _stdio);
                                } // if (playList[i].includes(_stdio.slice(0,-1))) { // remove cr from _stdio
                            }); // execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                        } //     } else {
                    
                connectXmmsToDarkice();
                sendState('SENDTOALL','/newsong/' + index);
            break;
        } // switch (_request.params.arg1) {

        if (_request.params.arg1 != "getstate")
            _response.end();
    }); // App.get('/:arg1/:arg2?/:arg3?', (_request, _response) => {
} // function setupExpress() {

function setupWebsocket() {
    log(TEXT,"setupWebsocket()");
    const Http     = require('http');
    const WSServer = require('websocket').server;

    var wsHttp = Http.createServer((_request, _response) => {
        log(TEXT,'Received request for ' + _request.url + " returning 404");

        _response.writeHead(404);
        _response.end();
    }).listen(6502);

    var wsServer = new WSServer({
        url: "ws://localhost:6502",
        httpServer: wsHttp
    }); // var wsServer = new wsServer({

    wsServer.on('connect', (_connection) => {
        log(TEXT,"websocket new connection from -> " + _connection.remoteAddress);
   //     _connection.accept('winamp', _connection.origin);
        clients.push(_connection);
    });

    wsServer.on('request', (_request) => {
        log(TEXT,"websocket request -> " + _request.resource + " from -> " + _request.remoteAddress);
        _request.accept('winamp', _request.origin);
    }); // wsServer.on('request', (_request) => {

    wsServer.on('close', (_connection) => {
        clients = clients.filter(function(el, idx, ar) {
            return el.connected;
        });

        log(TEXT,"Peer " + _connection.remoteAddress + " disconnected.");
    }); //  connection.on('close', function(_connection) {+
} // function setupWebsocket() {

function log(_type,_msg) {
    if (DEBUG)
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.dir(_msg);
}

module.exports = App;
