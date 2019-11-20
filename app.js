"use strict";
// xmms perferences...general plugins...
// song change plugin...
// set command to
// lynx --dump http://winamp:3000/newsong/%f
const pug = require('pug');
const http = require('http');
const fs = require("fs");
const WebSocketServer = require('websocket').server;
const wsPort = 6502;
const playListFile = "/home/ian/monday.pls";
const playListRootDir = "/home/ian/mp3"; 
const {
    execFile,
    execFileSync,
    readFile
} = require('child_process');

var express = require('express');
var app = express();
var playList = [];
var clientList = [];
var state = {
    playlist: [],
    shuffle: true,
    volume: 50,
    queuesong: -1
};

execFile('xmms', ['-Son']); // turn shuffle on

setupExpress();
setupWebsocket();

console.log("initial state");
console.dir(state);

function setupExpress() {
    var path = require('path');

    // view engine setup
    app.engine('pug', require('pug').__express)
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.json());
    app.use(express.urlencoded({
        extended: false
    }));

    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'pug');

    app.get('/setvolume/:level', (_request, _response, _next) => {
        state.volume =  parseInt(_request.params.level);
        execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume + '%,' + state.volume + '%']);
        _next();
    });

    app.get('/queuesong/:index', (_request, _response, _next) => {
        var queuesong = playListRootDir + playList[parseInt(_request.params.index)];
        // this adds it to the bottom of the playList & queues it
        execFile("xmms", ['-Q', queuesong]);
        state.queuesong = parseInt(_request.params.index);
        _next();
    });

    app.get('/playsong/:index', (_request, _response, _next) => {
        execFile("qxmms", ['jump', parseInt(_request.params.index) + 1]);
        state.currentlyplaying = _request.params.index;
        _next();
    });

    // xmms new song playing
    app.get('/newsong/*', (_request, _response, _next) => {
        var songname = decodeURIComponent(_request.url.split(playListRootDir)[1]);
        state.currentlyplaying = getSongIndex(songname);
        _next();
    });

    app.get(/[(\/prev\/next\/pause\/shuffle)]/, (_request, _response, _next) => {
        switch (_request.url) {
            case "/next":
            case "/prev":
                execFile('qxmms', [_request.url.split(/\//)[1]]);
                _response.end();
                return; // we return because a new song will play & a new msg from xmms will arrive

            case "/pause":
                state.paused = !state.paused;
                execFile('qxmms', ['pause']);
                break;

            case "/shuffle":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                break;
        } //switch (_request.url) {
        _next();
    });

    // send state to clients
    app.get('*', (_request, _response) => {
        _response.render('index', {
            title: playList[state.currentlyplaying]
        });

        console.log("request url -> " + _request.url);

        state.currentlyplaying = execFileSync('qxmms', ['-p']) - 1;
        state.duration      = parseInt(execFileSync('qxmms', ['-lS']));
        state.timeremaining = state.duration - execFileSync('qxmms', ['-nS']);

        console.dir(state);

        for (var i = 0; i < clientList.length; i++) {
            console.log("Sending state to -> " + clientList[i].remoteAddress);
            clientList[i].sendUTF(JSON.stringify(state));
        } // for (var i = 0;i < clientList.length;i++) {

        state.queuesong = -1;

        _response.end();
    });
}

function handleRequest(_request) {
    var connection = _request.accept("json", _request.origin);

    // Accept the request and get a connection.
    console.log("new connection from -> " + connection.remoteAddress + " sending playlist");

    clientList.push(connection);
    // only send placelist on initial client connection
    // make sure the most current playlist is loaded
    // a new playlist may be loaded in xmms while the server is active
    getPlaylist();

    connection.sendUTF(JSON.stringify(state));
    state.playlist = [];
}; // function handleRequest(_request) {

function setupWebsocket() {
    var wsHttp = http.createServer((_request, _response) => {
        console.log((new Date()) + ' Received request for ' + _request.url);

        _response.writeHead(404);
        _response.end();
    }).listen(wsPort);

    var wsServer = new WebSocketServer({
        httpServer: wsHttp,
        autoAcceptConnections: false
    }); // var wsServer = new wsServer({

    wsServer.on('request', (_request) => handleRequest(_request));

    wsServer.on('close', (_connection) => {
        clientList = clientList.filter(function(el, idx, ar) {
            return el.connected;
        });

    console.log((new Date()) + " Peer " + _connection.remoteAddress + " disconnected.");
    }); //  connection.on('close', function(_connection) {+
}

function getSongIndex(_songname) {
    for (var i = 0; i < playList.length; i++)
        if (_songname == playList[i])
            return i;

    console.log("ERROR - could not find index for -> " + _songname);
}

function getPlaylist() {
    /* xmms playlist file looks like this
    [playlist]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    playList = fs.readFileSync(playListFile, "utf8").split("\n");

    playList.shift(); // removes [playlist] 
    playList.shift(); // removes NumberOfEntries=5297 
    playList.length--; // the last line is a cr

    playList.forEach((_entry, _index) => {
        playList[_index] = playList[_index].split(playListRootDir)[1];
        state.playlist[_index] = playList[_index];
    });
} // function getPlaylist() {

module.exports = app;
