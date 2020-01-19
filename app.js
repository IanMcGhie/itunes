"use strict";
// xmms perferences...general plugins...
// song change plugin...
// set command to
// lynx --dump http://winamp:3000/newsong/%f
const pug   = require('pug');
const http  = require('http');
const fs    = require("fs");
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
var app     = express();
var playList= [];
var clientList = [];

var state = {
    timeRemaining: 0,
    currentlyPlaying: 0,
    duration: 0,
    shuffle: true,
    volume: 35,
    queueSong: -1,
    paused: false
};

execFile('xmms', ['-Son','-p']); // turn shuffle on / play even if paused
state.currentlyPlaying  = execFileSync('qxmms', ['-p']) - 1;

getplayList();
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

    app.get('/setvolume/:level', (_request,_response, _next) => {
        if (state.volume !=  parseInt(_request.params.level)) {
            state.volume =  parseInt(_request.params.level); 
            console.log("setting volume -> " + state.volume);
        }
        
        execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume + '%,' + state.volume + '%']);
        sendState(_request.ip); // dont send volume back to client who sent it
  
        _response.end();
    });

    app.get('/queueSong/:index', (_request, _response, _next) => {
        var queueSong = playListRootDir + playList[parseInt(_request.params.index)];
        console.log("queueing song -> " + queueSong);
        // this adds it to the bottom of the playList & queues it
        execFile("xmms", ['-Q', queueSong]);
        state.queueSong = parseInt(_request.params.index);     

        _next();
    });

    app.get('/playsong/:index', (_request, _response, _next) => {
        execFile("qxmms", ['jump', parseInt(_request.params.index) + 1]);
        state.paused = false;

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
        console.log("new song -> " + songname + " index -> " + getSongIndex(songname));

        state.currentlyPlaying = getSongIndex(songname);
        sendState();

        _next();
    });

    // blackberry state
    app.get('/getbbstate', (_request, _response) => {
        console.log("get bbstate() playList entries -> " + playList.length)
        
        state.currentlyPlaying = parseInt(execFileSync('qxmms', ['-p'])) - 1;
        state.duration      = parseInt(execFileSync('qxmms', ['-lS']));
        state.timeRemaining = state.duration - parseInt(execFileSync('qxmms', ['-nS']));
        state.playList= playList;
        
        _response.send(state);
        delete state.playList;
    });

    app.get('*', (_request, _response) => {
        console.log("\nincoming url -> " + _request.url);
        console.log("current state");
        console.dir(state);
        
        _response.render('index');
    });

    console.log("express setup")
} // function setupExpress() {

function sendState(_dontSendTo) {
    state.duration      = parseInt(execFileSync('qxmms', ['-lS']));
    state.timeRemaining = state.duration - parseInt(execFileSync('qxmms', ['-nS']));
    
    for (var i = 0; i < clientList.length; i++) 
        if (clientList[i].remoteAddress == _dontSendTo) {
            console.log("not sending state to -> " + _dontSendTo); // dont send volume back to client that changed it
            } else {
                    console.log("Sending state to -> " + clientList[i].remoteAddress);
                    clientList[i].send(JSON.stringify({msg: "state", data: state}));
            }
    state.queueSong = -1;
} // function sendState(_dontSendTo) {

function setupWebsocket() {
    console.log("setting up websocket");
    var wsHttp = http.createServer((_request, _response) => {
        console.log((new Date()) + ' Received request for ' + _request.url);

        _response.writeHead(404);
        _response.end();
    }).listen(wsPort);

    var serverUrl   = "ws://winamp:" + wsPort;

    var wsServer = new WebSocketServer({
        url: serverUrl,
        httpServer: wsHttp
    }); // var wsServer = new wsServer({

    wsServer.on('connect', (_connection) => {
        console.log("new connection from -> " + _connection.remoteAddress);

        clientList.push(_connection);
    });

    wsServer.on('request', (_request) => {
        console.log("Received request -> " + _request.url);
    //    console.dir(_request)
        var connection = _request.accept('winamp', _request.origin);

        state.duration      = parseInt(execFileSync('qxmms', ['-lS']));
        state.timeRemaining = state.duration - parseInt(execFileSync('qxmms', ['-nS']));

        console.dir(state)
        connection.send(JSON.stringify({ msg: "state", data: state }));
        connection.send(JSON.stringify({ msg: "playList", data: JSON.stringify({'playList': playList}) 
        }));
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

function getSongIndex(_songname) {
    for (var i = 0; i < playList.length; i++)
        if (_songname == playList[i])
            return i;

    console.log("ERROR - could not find index for -> " + _songname);
} // function getSongIndex(_songname) {

function getplayList() {
    /* xmms playList file looks like this
    [playList]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    console.log("reading playList -> " + playListFile);
    
    playList = fs.readFileSync(playListFile, "utf8").split("\n");

    playList.shift(); // removes [playList] 
    playList.shift(); // removes NumberOfEntries=5297 
    playList.length--; // the last line is a cr

    playList.forEach((_entry, _index) => {
        playList[_index] = playList[_index].split(playListRootDir)[1];
    });

    console.log("found " + playList.length + " entries")
} // function getplayList() {

module.exports = app;
