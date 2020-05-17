"use strict";
// 1. you need qxmms & darkice for this to work
// 2. xmms preferences...general plugins...
//    song change plugin...set command to
//    wget -qO - winamp:3000/newsong/"%f" &
const Pug           = require('pug');
const Http          = require('http');
const Fs            = require("fs");
const WSServer      = require('websocket').server;
const Express       = require('express');
const { execFile, readFile} = require('child_process');
const App           = Express();
const wsPort        = 6502;
const serverUrl     = "ws://winamp:" + wsPort;
const playListFile  = "/home/ian/monday.pls";

var playListFullPath    = [];
var clientList  = [];
var debug       = true;
var LOG         = 0;
var DIR         = 1;
var SENDTOALL   = true;
var volume = 40;

var state = {
    shuffle: true,
    songsPlayed: [],
    mute: false
};

getPlayList();
setupExpress();
setupWebsocket();
setVolume();

// turn shuffle on & start playing next song...
// xmms will send newsong http request
// which will setup the initial state of the server
execFile('xmms', ['-Son','-pf']);

function connectXmmsToDarkice() {
    log(LOG,"connectXmmsToDarkice()");
    
    // hook xmms output to darkice (icecast)
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

async function getState() {
    log(LOG,"getState()");
    
    return new Promise(resolve => {
        setTimeout(() => {

        execFile('qxmms', ['-lnS'],(_err,_stdio,_stderr) => {
                var args = _stdio.split(" ");

                state.duration = parseInt(args[0]);
                state.timeRemaining  = Math.abs(state.duration - parseInt(args[1]));
                state.volume = volume;

                log(DIR,state);
                resolve();               
            });
        }, 100);
    });
}

function setVolume() {
    log(LOG,"setting state.volume -> " + volume + "% mute -> " + state.mute);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', volume]);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

function setupExpress() {
    log(LOG,"setupExpress()");
    var path = require('path');

    App.engine('Pug', require('pug').__express)
    App.use(Express.static(path.join(__dirname, 'public')));
    App.use(Express.json());
    App.use(Express.urlencoded({
        extended: false
    }));

    App.set('views', path.join(__dirname, 'views'));
    App.set('view engine', 'pug');

    App.get('*', (_request, _response, _next) => {
        log(LOG,"Request from -> " + _request.socket.remoteAddress + " -> GET " + _request.url);
        _next();
    });

    App.get('/getstate', async (_request, _response) => {
        await getState();
        _response.send(state);
        _response.end();
    });

    App.get('/getplaylist', (_request, _response) => {
        getPlayList();
        
        var playList   = playListFullPath.map(function(_n) {
            return _n.split(/\/[a-z]\//i)[1].slice(0,-4);
        });

        log(LOG,"Sending playlist. Length -> " + playList.length);

        _response.send(playList);
        _response.end();
    });
    
    App.get('/', (_request, _response) => {
        _response.render('index');
        _response.end();
    });

    App.get('/next|/prev|/pause|/shuffle', async (_request, _response) => {
        var command = _request.url.replace('/','');

        switch (command) {
            case "next":
                execFile('xmms', ['-f']);
            break;

            case "prev":
                execFile('xmms', ['-r']);
            break;

            case "pause":
                execFile('xmms', ['-t']);
                state.paused = !state.paused;
                await getState()
                _response.send(state);
                sendState(_request.remoteAddress);
            break;

            case "shuffle":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                await getState()
                _response.send(state);
                sendState(_request.remoteAddress);
            break;
        } //switch (_request.url) {
    
    _response.end();
    }); // App.get('/next|/prev|/pause|/shuffle', (_request, _response) => {

    // xmms new song playing...this request came from xmms
    App.get('/newsong/*', async (_request, _response) => {
        state.paused = false;

        if (parseInt(_request.params[0]) < playListFullPath.length - 1) {
            state.songsPlayed.push(parseInt(_request.params[0] - 1));
            } else {
                    execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {

                    for (var i = 0; i < playListFullPath.length; i++)
                        if (playListFullPath[i].includes(_stdio.slice(0,-1))) { // remove cr from _stdio
                            state.songsPlayed.push(i);
                            log(LOG,"new queued song title " + _stdio + " index -> " + i);
                            }
                        });
                    } //     } else {

        connectXmmsToDarkice();
        
        await getState()
        _response.send(state);
        sendState(_request.remoteAddress,'newsong');

        _response.end();
    });

    App.get('/playsong/:index', (_request, _response) => { 
        execFile('qxmms',['jump',parseInt(_request.params.index) + 1], (_err,_stdio,_stderr) => {
            log(LOG,"playsong _err -> " + _err);
            log(LOG,"playsong _stdio -> " + _stdio);
            log(LOG,"playsong _stderr -> " + _stderr);
            
            _response.end();
        });
    });

    App.get('/setvolume/:level', (_request,_response) => {
        if (_request.params.level == 'volup')
            volume++;
                else if (_request.params.level == 'voldown')
                    volume--;
                        else if (_request.params.level == 'mute')
                            state.mute = !state.mute;
                                else volume = parseInt(_request.params.level);

        state.volume = volume;

        setVolume();

        _response.send(state);
        sendState(_request.socket.remoteAddress,'/setvolume/:level');

        _response.end();
    });

    App.get('/queuesong/:index', (_request, _response) => {
        state.queueSong = parseInt(_request.params.index);
        log(LOG,"queueing song #" + state.queueSong + " " + playListFullPath[state.queueSong]);

        // this adds it to the bottom of the playList & queues it
        execFile("xmms", ['-Q',  playListFullPath[state.queueSong]], (_err,_stdio,_stderr) => {
            _response.send(state);
            sendState(_request.remoteAddress,'queuesong');
            _response.end();
        });
    });
} // function setupExpress() {

function sendState(_dontSendTo,_logMsg) {
    log(LOG,"sendState(" + _dontSendTo + ", " + _logMsg + ") clientList.length -> " + clientList.length + " clients _dontSendTo -> " + _dontSendTo);
    
    if (clientList.length > 0) 
        execFile('qxmms', ['-lnS'],(_err,_stdio,_stderr) => {
           var args = _stdio.split(" ");

            state.duration = parseInt(args[0]);
            // sometimes xmms reports the timeRemaining > duration ...?
            state.timeRemaining = args[1] > state.duration ?  state.duration : Math.abs(state.duration - args[1]);
           // state.timeRemaining = Math.abs(state.duration - args[1]);

            log(DIR,state);

            for (var i = 0; i < clientList.length; i++) {
                if (_dontSendTo == true) {
                    log(LOG,"Sending state to -> " + clientList[i].remoteAddress);
                    clientList[i].send(JSON.stringify({state: state}));
                } else {
                    if (clientList[i].remoteAddress != _dontSendTo) {
                        log(LOG,"Sending state to -> " + clientList[i].remoteAddress);
                        clientList[i].send(JSON.stringify({state: state}));
                        } else {
                                log(LOG,"not sending state to -> " + clientList[i].remoteAddress);
                                }
                }
            }

            if (state.hasOwnProperty('volume') ) {
                log(LOG,"removing volume from state");
                delete state.volume;
            }

            if (state.hasOwnProperty('queueSong')) {
                log(LOG,"removing queueSong from state");
                delete state.queueSong;
            }
        });
} // function sendState(_dontSendTo,_logMsg) {

function setupWebsocket() {
    log(LOG,"setting up websocket");

    var wsHttp = Http.createServer((_request, _response) => {
        log(LOG,(new Date()) + ' Received request for ' + _request.url);

        _response.writeHead(404);
        _response.end();
    }).listen(wsPort);

    var wsServer = new WSServer({
        url: serverUrl,
        httpServer: wsHttp
    }); // var wsServer = new wsServer({

    wsServer.on('connect', async (_connection) => {
        log(LOG,"websocket new connection from -> " + _connection.remoteAddress);
        clientList.push(_connection);
    });

    wsServer.on('request', (_request) => {
        log(LOG,"websocket request -> " + _request.resource + " from -> " + _request.remoteAddress);
        
        _request.accept('winamp', _request.origin);
    }); // wsServer.on('request', (_request) => {

    wsServer.on('close', (_connection) => {
        log(LOG,"closing connection");
        clientList = clientList.filter(function(el, idx, ar) {
            return el.connected;
        });

        log(LOG,(new Date()) + " Peer " + _connection.remoteAddress + " disconnected.");
    }); //  connection.on('close', function(_connection) {+

    log(LOG,"websocket listening on port " + wsPort);
} // function setupWebsocket() {

function getPlayList() {
    var i = 0;
    /* xmms playList.m3u file looks like this
    [playList]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    if (Fs.exists)
        var fp = Fs.readFileSync(playListFile, "utf8").split("\n");
            else 
                throw new Error("Cannot find playlist " + playListFile);

    fp.forEach((_entry, _index) => {
        if (_entry.includes('File')) 
            playListFullPath[i++] =  _entry.split('//')[1];
    });

    log(LOG,playListFullPath.length + " songs in playlist file.");
} // function getPlayList() {

function log(_type,_msg) {
    if (debug)
        if (_type == LOG)
            console.log(_msg);
                else
                    console.dir(_msg);
}

module.exports = App;
