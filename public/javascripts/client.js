"use strict";
// bb doesnt like the let, includes, const keyword, async functions, promises... ()=> syntax
// ooo...neat https://en.wikipedia.org/wiki/Trie
var DEBUG      = true;
var itsTheBB   = true;  // default mode
var showPlayed = true;
var TEXT       = true;
var DIR        = false;
var newSelect  = false;
var serverUrl  = "winamp:6502";
var chart;
var playList   = [];
var state      = { 
    log: [],
    duration: 0,
    progress: 0,
    volume: 40
};

Number.prototype.toMMSS = function() {
    var minutes = Math.abs(parseInt(this / 60));
    var seconds = Math.abs(parseInt(this % 60));

    if (minutes < 10) 
        minutes = "0" + minutes;
    
    if (seconds < 10)
        seconds = "0" + seconds;

    return minutes + ":" + seconds;
} // Integer.prototype.toMMSS = function() {

$(document).ready(function () {
    var itsFirefox = typeof InstallTrigger !== 'undefined';
    var itsChrome  = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);

    if (itsFirefox || itsChrome)
        setupWebSocket(); // this sets itsTheBB to false

    sendCommand('getplaylist');
    setupKBEvents();
    setupMouseEvents();
    setupVolumeControl();
    setupClock();
    setupTitleTicker();
 
    window.onresize = drawChart;
    document.body.style.color = "#0d0"; // set chart bar default color 
}); // $(document).ready(function() {

function setupClock() {
    log(TEXT,"setupClock()");

    setInterval(function() { 
        $("#clock").text('-' + (state.duration - state.progress).toMMSS());

        if (!state.pause) {            
            var margin;

            if (itsTheBB && state.progress >= state.duration)   // clamp the clock the bb wont get
                sendCommand('getstate');                        // the websocket state, so we ask for it here

            if (itsTheBB)
                margin = (++state.progress / state.duration) * 460;
                    else
                        margin = -230 + (++state.progress / state.duration) * 405;
  
            $("#progressbar2handle").css("margin-left", margin);
        }
    }, 1000); 
};

function setupTitleTicker() {
    log(TEXT,"setupTitleTicker()");

    setInterval(function() {
        if (playList && state.log.length)
            if (($("#pagetitle").text().length > 0))
                $("#pagetitle").text($("#pagetitle").text().slice(1));
                    else
                        $("#pagetitle").text(playList[state.log[state.log.length - 1]]);
    }, 250); 
} // function setupTitleTicker() {

function sendCommand(_command) {
    log(TEXT,"sendCommand(" + _command + ")");
    var postRefresh = true;

    if (_command == "setvolume/mute") {
        state.mute = !state.mute;
        postRefresh = false;
        } else if (_command == "pause") {
            state.pause = !state.pause;
            postRefresh = false;
            } else if (_command == "shuffle" || _command == "shuffleenabled") {
                state.shuffle = !state.shuffle;
                postRefresh = false;
            } else if (_command.split('/')[0] == "queuesong") {
                    state.popupDialog = playList[_command.split('/')[1]] + " queued";
                    postRefresh = false;
            }

    if (!postRefresh)
        updateUI('sendCommand(' + _command + ')');

    $.getJSON(_command, function (_newState) {
        log(TEXT, "HTTP state retrieved thusly");
        log(DIR, _newState);

        if (_newState.log.length != state.log.length) { // log length has changed new song
            $("#pagetitle").text("");                   // is playing...reset ticker
            postRefresh = true;
        }

        state = _newState;
        state.progress+=2;
        
        if (state.hasOwnProperty('playList')) {
            setupPlaylist();
            drawChart('setupPlaylist()');

        if (itsTheBB)
            updateUI('itsTheBB 2 -> ' + itsTheBB);
        }

        if (!itsTheBB && (postRefresh || _command != "getstate" && _command != "getplaylist"))
            updateUI('sendCommand(' + _command + ')');
    }); // $.getJSON(_command, function (_newState) {

    // tricky here...
    if ((itsTheBB && _command != "getplaylist") || 
        (itsTheBB && (_command == "prev" || _command == "next")))
        setTimeout(function() {
            $.getJSON("getstate", function (_bbState) {
                state = _bbState;
                updateUI('itsTheBB -> ' + itsTheBB);
            });
        }, 750);
}

function setupVolumeControl() {
    log(TEXT,"setupVolumeControl()");

    $("#volume").slider({
        animate: false,
        min: 1,
        max: 100,
        value: 0
    });
 
    $("#volume").on("slidechange", function(_event, _ui) {
        //  vol 0% -> 40 153 28  vol 100% -> 225 31 38
        //              28 99 1c             e1 1f 26 
        var r = toHex((_ui.value * 1.85 + 40));
        var g = toHex(((_ui.value) * 2 + 128));
        var b = toHex((_ui.value * 0.1) + 28);

        $("#volume").css("background-color","#" + r + g + b);

        if (state.hasOwnProperty('volume')) {
            log(TEXT,"volume slidechange callback fired... not sending volume back to server. Removing volume from state volume -> " + state.volume);
            delete state.volume;
            return;
        }

        log(TEXT,"volume slidechange callback fired... sending new value -> " +  _ui.value + " color -> #" + r + g + b);
        updateUI('volume slidechange');
        $.get("setvolume/" + _ui.value);
    }); // $("#volume").on("slidechange", function(_event, _ui) {
} // function setupVolumeControl() {

function toHex(_n) {
    var h = parseInt(_n).toString(16);
    return h.length < 2 ? "0" + h : h;;
}

function setupMouseEvents() {
    log(TEXT,"setupMouseEvents()");

    // this will cause slidechange jquery cb to fire
    $("#winampspan").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            $("#volume").slider("value",parseInt($("#volume").slider("value") + 1)); 
                else
                   $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
    });

    $("#winamp").click(function() {
        sendCommand("getstate");
    });

    $("#playlist").dblclick(function() {
        sendCommand("playsong/" + getSearchInputSongIndex());
    });

    $("#playsong,#queuesong").click(function() {
        sendCommand((this).id + "/" + getSearchInputSongIndex());
    });

    $("#prev,#next,#pause,#shuffle,#shuffleenabled").click(function() {
        sendCommand((this).id);
    });
    
    $("#setvolume\\/mute").click(function() {
        sendCommand('setvolume/mute');
    });

    $("#progressbar2handle").draggable({
        containment: "parent",
        stop: function(_event, _ui) {
            log(DIR, $("#progressbar2span"));
            $.get("seek/" + parseInt((_event.target.offsetLeft / 372) * 100));
        }  
    });

    $("#progressbar2span").click(function() {
        alert("as")
    });

    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").val());
    });
    
} // function setupMouseEvents() {

function setupKBEvents() {
    log(TEXT,"setupKBEvents()");
    
    //$("#searchinput").blur();
    $("body").keyup(function(_event) {
        log(TEXT,"body keyup -> " + _event.which);
        
        switch (_event.which) {
            case 90: // Z
            case 122: // z
                sendCommand("prev");
            break;

            case 66: // B
            case 98: // b
                sendCommand("next");
            break;

            case 77: // M
            case 109: // m
                sendCommand("setvolume/mute");
            break;

            case 67: // C
            case 99: // c
                sendCommand("pause");
            break;

            case 83: // S
            case 115: // s
                sendCommand("shuffle");
            break;

            case 81: // Q
            case 113: // q
                sendCommand("queuesong/" + getSearchInputSongIndex());
            break;

            case 79: // O
            case 111: // o
                $("#volume").slider("value", parseInt($("#volume").slider("value") + 1));
            break;

            case 73: // I
            case 105: // i
                $("#volume").slider("value", parseInt($("#volume").slider("value") - 1));
            break;

            case 74: // J
            case 106: // j
                $("#searchinput").focus();
            break;
        } // switch (_event.which) {
    }); // $("body").keyup(function(_event) {

    $("#playlist").focusin(function() {
        $("body").off("keyup");
        $("#playlist").css("border", "1px solid #0d0");

        $("#playlist").keyup(function(_event) {
            log(TEXT,"key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    $.get("playsong/" + getSearchInputSongIndex());
                break;
                
                case 51: // 3
                    if (_event.altKey) {
                        log(TEXT,"Hey! alt-3 event captured!");
                        event.preventDefault();
                    }
                break;
            }; // switch (_event.which) {
        }); // $("#playlist").keyup(function(_event) {
    }); // $("#playlist").focusin(function() {

    $("#playlist").focusout(function() {
        $("#playlist").off("keyup");
        $("#playlist").css("border", "1px solid #888");
        setupKBEvents();
    });
} // function bodyKBEvents(_event) {

function updateUI(_logMsg) {
    log(TEXT,"updateUI(" + _logMsg + ")");

    var currentSongTitle = playList[state.log[state.log.length - 1]];

    if (state.hasOwnProperty('popupDialog')) {
        log(TEXT,"state.popupDialog -> " + state.popupDialog);

        $("#popupdialog").css("display", "block");
        $("#popupdialog").text(state.popupDialog);
        $("#popupdialog").delay(5000).hide(0);  
    } 

    if (state.mute) 
        $("#setvolume\\/mute").css("display", "inline-block");
            else
                $("#setvolume\\/mute").css("display", "none");

    // this will cause slidechange jquery cb to fire
    state.hasOwnProperty('volume') ? $("#volume").slider("value", state.volume) : null;
 
    $("#songtitle").text(currentSongTitle + " (" + state.duration.toMMSS() + ")");
    $("#playlist>option:eq(" + state.log[state.log.length - 1] + ")").prop("selected", true);    
    $("#searchinput").val(currentSongTitle); 
    $("#searchinput").css("width",parseInt($("#playlist").css("width")) - 150);
    $("#shuffleenabled").css("visibility",state.shuffle ? "visible" : "hidden");
    $("#ispaused").attr("src",state.pause ? "/images/paused.png" : "/images/playing.png");
} // function updateUI(_logMsg) {

function setupWebSocket() {
    log(TEXT,"setupWebSocket()");

    var client = new WebSocket("ws://" + serverUrl, "winamp");
    
    itsTheBB = false;

    client.onmessage = function(_response) {
        log(TEXT,"websocket received state thusly");

        var newState = JSON.parse(_response.data).state;
        
        log(DIR, newState);

        if  ((newState.log.length != state.log.length) || (newState.hasOwnProperty('playList'))) {
            log(TEXT,"client.onmessage log file changed " + (newState.log.length != state.log.length) + " newState.hasOwnProperty('playList') -> " + newState.hasOwnProperty('playList'));
            $("#pagetitle").text("");
            state = newState;

            if (newState.hasOwnProperty('playList')) {
                log(TEXT,"client.onmessage newState has playList -> " + newState.hasOwnProperty('playList'));
                setupPlaylist();
            }
                
            drawChart("client.onmessage");
        } else
            log(TEXT, "they are the same! or this is true -> " + newState.hasOwnProperty('playList'));

    state = newState;
    updateUI("client.onmessage");    
    } // client.onmessage = function(_response) {
       
    $("body").css("text-align","center");
    $("body").css("font-weight","bold");
    $("body").css("font-size","24px");
    $("#clock").css("margin-left","-410px");
    $("#ispaused").css("margin-left","-420px");
    $("#shuffleenabled").css("margin-left","-182px");
    $("#songtitle").css("width","100%");
    $("#setvolume\\/mute").css("left", (screen.width / 2) - (("Press M to unmute".length / 2) * 14) + "px");    
} // function setupWebSocket() {

function charsAllowed(_value) {
    return new RegExp(/^[a-zA-Z\s]+$/).test(_value);
}

function setupPlaylist() {
    log(TEXT,"setupPlaylist()");

    playList = state.playList;

    $("#playlist").attr("size",playList.length < 20 ? playList.length : 20);

    for (var i = 0; i < playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        if (document.getElementById("option"))
            select.removeChild("id" + i); 
                
        option.setAttribute("id", i);
        option.text = playList[i];
        select.add(option);
    } 

    setupSearch();
} // function setupPlaylist() {

function setupSearch() {
    log(TEXT,"setupSearch()");

    $("#searchinput").css("width",parseInt($("#playlist").css("width")) - 150);

    $("#searchinput").focusin(function() {
 //       updateUI('setupSearch()');
        $("body").off("keyup");
        $("#searchinput").css("border", "1px solid #0d0");
          
        if (!newSelect) 
            $("#searchinput").val("");
                else
                    newSelect = false;
        
        $("#searchinput").keyup(function(_event) {      
            if (_event.which == 13) {
                sendCommand("playsong/" + getSearchInputSongIndex());
              //  $("#searchinput").blur();
            }

            if (_event.which == 27)
                $("#searchinput").blur();
        });
    }); // $("#searchinput").focusin(function() {

    $("#searchinput").focusout(function() {
        $("#searchinput").css("border", "1px solid #888");
        $("#searchinput").off("keyup");
     //   $("#searchinput").val($("#playlist").find("option:selected").val());
//        $("#searchinput").blur();
        setupKBEvents();
    }); // $("#searchinput").focusout(function() {

    autocomplete({  // preventSubmit: true,
        input: document.querySelector('#searchinput'),
        minLength: 2,
//debounceWaitMs: 50,
        onSelect: function(_item, _inputfield) { // log(LOG,"onselect ****");
            newSelect = true;
            $("#searchinput").val(_item.label);
         //   $("#searchinput").focus();
         //   sendCommand("playsong/" + getSearchInputSongIndex());
        },
        fetch: function(_match, _callback) {
            var match   = _match.toLowerCase();
            var items   = playList.map(function(_n) {
                return {
                    label: _n,
                    group: "Results"
                }
            });
        
            _callback(items.filter(function(_n) { // log(LOG,"onfetch ****")
                if (_n.label) {
          //          log(TEXT, _n.label);
                    return _n.label.toLowerCase().indexOf(match) !== -1;
                }
            }));
        },
        render: function(_item, _value) {  //  log(LOG,"onrender ****")
            var itemElement = document.createElement("div");
            itemElement.id  = "resultrow_";

            if (charsAllowed(_value)) {
                var regex = new RegExp(_value, 'gi');
                var inner = _item.label.replace(regex, function(_match) {
                    return "<strong>" + _match + "</strong>";
                });

                itemElement.innerHTML = inner;
            } else 
                    itemElement.textContent = _item.label;
  
            return itemElement;
        },
        emptymessage: "MP3 not found",
        customize: function(_input, _inputRect, _container, _maxHeight) {
            if (_maxHeight < 100) { // // display autocomplete above the input field if there is not enough space for it.
                _container.style.top = "";
                _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} //  setupSearch() {

function drawChart(_logMsg) {
    log(TEXT,"drawChart(" + _logMsg + ")");

    if (itsTheBB) 
        return;

    var barColors    = [];
    var chartData    = [];
    var lastLetter   = "";
    var lastIndex    = -50;
    var yMax         = 0;
    var currentSongIndex = -1;

    var customTooltips = function(_ttModel) {
        var ttElement = document.getElementById('charttooltip');
        var innerHTML = "<table>";
        var chartPopupIndex = -1;

        // Hide if no tooltip
        if (this._active.length == 0 || !state.log.includes(this._active[0]._index) && showPlayed) {
            $("#charttooltip").remove();
            chartPopupIndex = -1;
            return;
        }

        if (!ttElement) {
            log(TEXT,"creating tooltip div")
            ttElement = document.createElement('div');
            ttElement.id = 'charttooltip';
            ttElement.innerHTML = innerHTML;
            this._chart.canvas.parentNode.appendChild(ttElement);
        }

        chartPopupIndex = this._active[0]._index;

        $("#chart").unbind();
        $("#chart").contextmenu(function() { // right click
            $("#charttooltip").remove();
            showPlayed = !showPlayed;
            drawChart("contextmenu");
        });
       
        $("#chart").click(function() {
            if (chartPopupIndex != -1)
                $.get("playsong/" + chartPopupIndex);
        });

        // highlight currently playing song
        if (chartPopupIndex == state.log[state.log.length - 1]) {
            ttElement.style.color = "#fd1";
            ttElement.style.border = "1px solid #fd1";
            innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
            } else {
                    ttElement.style.color = "#0d0";
                    ttElement.style.border = "1px solid #0d0";
                    innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
                    }

        innerHTML += '<tbody><tr><td>&nbsp<td></tr><tr><td>Right click for songs ' + (showPlayed ? "not" : "") + ' played.</td></tr></tbody></table>';

        ttElement.querySelector('table').innerHTML = innerHTML;
        ttElement.style.opacity = 1;
        ttElement.style.left    = (_ttModel.caretX / 1.4) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
    };  // var customTooltips = function(_ttModel) {

    $("#chartcontainer").css("display","inline-block");
    
    currentSongIndex = state.log[state.log.length - 1];
    chartData.length = playList.length;
    chartData.fill(0);
    
    for (var i = 0; i < state.log.length;i++) { 
        barColors[state.log[i]] = document.body.style.color;
        chartData[state.log[i]]++;

        if (yMax < chartData[state.log[i]])
            yMax = chartData[state.log[i]] + 1;
    }

    // highlight currently playing
    barColors[currentSongIndex]    = "#fd1";
    chartData[currentSongIndex]    = yMax;

    if (!showPlayed) // show songs not played
        for (var i = 0; i < playList.length;i++) 
            if (chartData[i] == 0) {
                barColors[i] = document.body.style.color;
                chartData[i] = 1;
                chartData[currentSongIndex] = 2;
            } else {
                chartData[i] = 0;
                chartData[currentSongIndex] = 2;
            }

    if (chart)
        chart.destroy();
    
    chart = new Chart($("#chart"), {
        type: 'bar',
        data: {
            labels: chartData,
            datasets: [{
                data:  chartData,
                backgroundColor: barColors
            }]
        },
        options: {
            legend: { display: false },
            animation: { duration: 0 },               
            responsive: true,
            aspectRatio: 14,
            title: { display: false },            
            tooltips: {
                enabled: false, // disable on-canvas tooltips
                mode: 'nearest', //index point dataset nearest x
                position: 'nearest',
                intersect: false,
                custom: customTooltips
            },
            scales: {
                xAxes: [{ 
                        ticks: {
                            autoSkip: false,
                            fontColor: '#0d0',
                            fontSize: '16',
                            callback: function(_value, _index, _values) {
                                if (playList[_index] != undefined)                         
                                    if ((playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) && (!showPlayed || state.log.includes(_index))) {
                                        lastLetter = playList[_index].slice(0,1);
                                        lastIndex = _index;
                                        return lastLetter;
                                }
                            }  // callback: function(_value, _index, _values) { 
                        } // ticks: {
                    }], 
                yAxes: [{ ticks: { callback: function(_value, _index, _values) { return; } } }]
            } // scales: { 
        } // options: {
    }); //  chart = new Chart(ctx, {
} // function drawChart() {
 
function getSearchInputSongIndex() {
    return playList.indexOf($("#searchinput").val());
}

function log(_type,_msg) {
    if (DEBUG)
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.dir(_msg);
}
