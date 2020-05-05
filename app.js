"use strict";
// 1. you need qxmms for this to work
// 2. xmms perferences...general plugins...
//    song change plugin...
//    set command to
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

var playList = [];
var clientList  = [];
var state = {
    volume: 50,
    shuffle: true,
    songsPlayed: [],
    playList: []
};

getPlayList(playListFile);
setupExpress();
setupWebsocket(serverUrl);
// turn shuffle on & start playing next song...
// this will cause xmms to send newsong http request
// which will setup the initial state of the server
execFile('xmms', ['-Son','-pf']);

function connectXmmsToDarkice() {
    console.log("connectXmmsToDarkice()");
    
    // hook xmms output to darkice (icecast)
    execFile('jack_lsp',(_err,_stdio,_stderr) => {
        var lines = _stdio.split('\n');
        var xmmsJackPorts = [];
        var darkiceJackPorts = [];

        lines.forEach (line => {
            if (line.includes('xmms')) 
                xmmsJackPorts.push(line);

            if (line.includes("darkice"))
                darkiceJackPorts.push(line)
            });

        execFile('jack_connect', [ darkiceJackPorts[0], xmmsJackPorts[0] ]);
        execFile('jack_connect', [ darkiceJackPorts[1], xmmsJackPorts[1] ]);
    });
}

function setupExpress() {
    console.log("setupExpress()");
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
        console.log("Request from -> " + _request.socket.localAddress + " -> GET " + _request.url);
        _next();
    });

    App.get('/getbbstate', (_request, _response) => {
        execFile('qxmms', ['-lS'],(_err,_stdio,_stderr) => {
            state.duration = parseInt(_stdio);

            execFile('qxmms', ['-nS'],(_err,_stdio,_stderr) => {
                state.timeRemaining  = Math.abs(state.duration - _stdio);
                _response.send(state);
                _response.end();
            });
        });
    });

    App.get('/getbbplaylist', (_request, _response) => {
        getPlayList(playListFile);

        state.playList = playList.map(function(_n) {
            return _n.split(/\/[a-z]\//i)[1].slice(0,-4);
        });

        _response.send(state.playList);
        _response.end();

        delete state.playList;
    });
    
    App.get('/', (_request, _response) => {
        _response.render('index');
        _response.end();
    });

    App.get('/next|/prev|/pause|/shuffle', (_request, _response) => {
        var command = _request.url.replace('/','');

        switch (command) {
            case "next":
            case "prev":
                execFile('qxmms', [command]);
                state.paused = false;
            break;

            case "pause":
                execFile('qxmms', [command]);
                state.paused = !state.paused;
                sendState();
            break;

            case "shuffle":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                sendState();
            break;
        } //switch (_request.url) {

    _response.end();
    }); // App.get('/next|/prev|/pause|/shuffle', (_request, _response) => {

    // xmms new song playing...this request came from xmms
    App.get('/newsong/*', (_request, _response) => {
        execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
            var songPath = _stdio.toString().replace(/^\/\//,"").trim();

            state.songsPlayed.push(playList.indexOf(songPath));
            connectXmmsToDarkice();
            sendState();
            _response.end();
        });
    });

    App.get('/playsong/:index', (_request, _response) => { 
        state.paused = false;

        execFile('qxmms',['jump',parseInt(_request.params.index) + 1], (_err,_stdio,_stderr) => {
            console.log("playsong _err -> " + _err);
            console.log("playsong _stdio -> " + _stdio);
            console.log("playsong _stderr -> " + _stderr);
            
            _response.end();
        });
    });

    App.get('/setvolume/:level', (_request,_response) => {
        state.volume =  parseInt(_request.params.level);
        execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume + '%']);
        _response.end();
    });

    App.get('/queuesong/:index', (_request, _response) => {
        state.queueSong = parseInt(_request.params.index);
        // this adds it to the bottom of the playList & queues it
        execFile("xmms", ['-Q',  playList[state.queueSong]], (_err,_stdio,_stderr) => {
            sendState();
            _response.end();
        });
    });
} // function setupExpress() {

function sendState(_dontSendTo) {
    console.log("sendState(" + _dontSendTo + ")");
    
    execFile('qxmms', ['-lnS'],(_err,_stdio,_stderr) => {
        state.duration = parseInt(_stdio.split(" ")[0]);
        // sometimes xmms reports the timeRemaining > duration ...?
        state.timeRemaining = _stdio.split(" ")[1] > state.duration ?  state.duration : Math.abs(state.duration - _stdio.split(" ")[1]);
    
        for (var i = 0; i < clientList.length; i++) 
            if (_dontSendTo != clientList[i].remoteAddress) {
                console.log("Sending state to -> " + clientList[i].remoteAddress);
                clientList[i].send(JSON.stringify({ state: state }));
            } else console.log("Not sending state to -> " + clientList[i].remoteAddress);
        
        console.dir(state);
        delete state.queueSong;
        delete state.playList;
    });
} // function sendState(_dontSendTo) {

function setupWebsocket(_serverUrl) {
    console.log("setting up websocket");

    var wsHttp = Http.createServer((_request, _response) => {
        console.log((new Date()) + ' Received request for ' + _request.url);

        _response.writeHead(404);
        _response.end();
    }).listen(wsPort);

    var wsServer = new WSServer({
        url: _serverUrl,
        httpServer: wsHttp
    }); // var wsServer = new wsServer({

    wsServer.on('connect', (_connection) => {
        console.log("websocket new connection from -> " + _connection.remoteAddress);
        clientList.push(_connection);

        state.playList = playList.map(function(_n) {
            return _n.split(/\/[a-z]\//i)[1].slice(0,-4);
        });

        return state.playList;
    });

    wsServer.on('request', (_request) => {
        console.log("websocket request -> " + _request.resource + " from -> " + _request.remoteAddress);

        var connection      = _request.accept('winamp', _request.origin);
        sendState();
    }); // wsServer.on('request', (_request) => {

    wsServer.on('close', (_connection) => {
        console.log("closing connection");
        clientList = clientList.filter(function(el, idx, ar) {
            return el.connected;
        });

        console.log((new Date()) + " Peer " + _connection.remoteAddress + " disconnected.");
    }); //  connection.on('close', function(_connection) {+

    console.log("websocket listening on port " + wsPort);
} // function setupWebsocket() {

function getPlayList(_playListFile) {
    /* xmms playList.m3u file looks like this
    [playList]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    if (Fs.exists)
        playList = Fs.readFileSync(_playListFile, "utf8").split("\n");
            else 
                throw new Error("Cannot find playlist " + _playListFile);

    console.log("reading playlist file " + playList.length + " songs");

    playList.shift(); // removes [playList] 
    playList.shift(); // removes NumberOfEntries=5297 
    playList.length--; // the last line is a cr

    playList.forEach((_entry, _index) => {
        playList[_index] = _entry.split('//')[1];
    });

console.dir(playList);
} // function getPlayList() {

module.exports = App;
