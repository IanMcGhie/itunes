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
    timeremaining: 0,
    duration: 0,
    playList: [],
    shuffle: true,
    volume: 35,
    queueSong: -1,
};

execFile('xmms', ['-Son']); // turn shuffle on

getPlaylist();
setupExpress();
setupWebsocket();

function setupExpress() {
    console.log("setting up express");
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

    app.get('/setvolume/:level', (_request,_response , _next) => {
        state.volume =  parseInt(_request.params.level);
        execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume + '%,' + state.volume + '%']);

        sendState(_request.ip);
        _next();
    });

    app.get('/queuesong/:index', (_request, _response, _next) => {
        var queueSong = playListRootDir + playList[parseInt(_request.params.index)];
        // this adds it to the bottom of the playList & queues it
        execFile("xmms", ['-Q', queueSong]);
        state.queueSong = parseInt(_request.params.index);
        
        sendState();
    });

    app.get('/playsong/:index', (_request, _response, _next) => {
        execFile("qxmms", ['jump', parseInt(_request.params.index) + 1]);
        
        _next();
    });

    app.get('/next|/prev|/pause|/shuffle', (_request, _response, _next) => {
        var command = _request.url.replace('/','');

        switch (command) {
            case "next":
            case "prev":
                execFile('qxmms', [command]);
                state.paused = false;
            break;

            case "pause":
                execFile('qxmms', ['pause']);
                state.paused = !state.paused;
                sendState();
            break;

            case "shuffle":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                sendState();
            break;
        } //switch (_request.url) {
            
    _next();
    });

    // xmms new song playing...this request came from xmms
    app.get('/newsong/*', (_request, _response, _next) => {
        var songname = decodeURIComponent(_request.url.split(playListRootDir)[1]);
        state.currentlyplaying = getSongIndex(songname);
        console.log("new song -> " + songname + " index -> " + getSongIndex(songname));
        
        sendState();
        
        _next();
    });

    // blackberry state
    app.get('/getbbstate', (_request, _response, _next) => {
        console.log("get bbstate() playlist entries -> " + playList.length)
        state.playList = playList;
        state.currentlyplaying = execFileSync('qxmms', ['-p']) - 1;
        state.duration      = parseInt(execFileSync('qxmms', ['-lS']));
        state.timeremaining = state.duration - execFileSync('qxmms', ['-nS']);

        console.dir(state)
        _response.send(JSON.stringify(state));
        delete state.playList;

        _response.end();
    });

    // send state to clients
    app.get('*', (_request, _response) => {
        console.log("\nincoming url -> " + _request.url);

        _response.render('index', {
            title: playList[state.currentlyplaying]
        });
        
        _response.end();
    });

    console.log("express setup")
} // function setupExpress() {

function sendState(_dontSendTo) {
    console.log("current state")
    
    state.currentlyplaying = execFileSync('qxmms', ['-p']) - 1;
    state.duration      = parseInt(execFileSync('qxmms', ['-lS']));
    state.timeremaining = state.duration - execFileSync('qxmms', ['-nS']);

    console.dir(state)
    for (var i = 0; i < clientList.length; i++) 
        if (clientList[i].remoteAddress != _dontSendTo) {
            console.log("Sending state to -> " + clientList[i].remoteAddress);
            clientList[i].sendUTF(JSON.stringify(state));
            } else
                console.log("not sending state to -> " + _dontSendTo);
    
    state.queueSong = -1;
}

function setupWebsocket() {
    console.log("setting up websocket");

    var wsHttp = http.createServer((_request, _response) => {
        console.log((new Date()) + ' Received request for ' + _request.url);

        _response.writeHead(404);
        _response.end();
    }).listen(wsPort);

    var wsServer = new WebSocketServer({
        httpServer: wsHttp,
        autoAcceptConnections: false
    }); // var wsServer = new wsServer({

    wsServer.on('request', (_request) => {
        var connection = _request.accept("json", _request.origin);

        console.log("new connection from -> " + _request.remoteAddress)
        state.playList = playList;
        clientList.push(connection);
        sendState();
        delete state.playList;
    });

    wsServer.on('close', (_connection) => {
        console.log("colsing connection");
        clientList = clientList.filter(function(el, idx, ar) {
            return el.connected;
        });

    console.log((new Date()) + " Peer " + _connection.remoteAddress + " disconnected.");
    }); //  connection.on('close', function(_connection) {+

        console.log("websocket setup");
} // function setupWebsocket() {

function getSongIndex(_songname) {
    for (var i = 0; i < playList.length; i++)
        if (_songname == playList[i])
            return i;

    console.log("ERROR - could not find index for -> " + _songname);
}

function getPlaylist() {
    /* xmms playList file looks like this
    [playList]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    console.log("reading playlist -> " + playListFile);
    playList = fs.readFileSync(playListFile, "utf8").split("\n");

    playList.shift(); // removes [playList] 
    playList.shift(); // removes NumberOfEntries=5297 
    playList.length--; // the last line is a cr

    playList.forEach((_entry, _index) => {
        playList[_index] = playList[_index].split(playListRootDir)[1];
      //  state.playList[_index] = playList[_index];
    });

    state.playList = playList;
    console.log("found " + playList.length + " entries")
} // function getPlaylist() {

module.exports = app;
