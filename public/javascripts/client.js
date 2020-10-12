"use strict";
// bb doesnt like the let, includes, const keyword, async functions, promises... ()=> syntax
// ooo...neat https://en.wikipedia.org/wiki/Trie
var DEBUG      = true;
var itsTheBB   = true;
var showPlayed = true;
var TEXT       = true;
var DIR        = false;
var newSelect  = false;
var userAdjustingProgressBar = false;
var serverUrl  = "winamp:6502";
var chart;
var playList   = [];
var songLog    = [];
var state      = { 
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

    if (itsTheBB)
        sendCommand("getbbplaylist");
    
    setupKBEvents();
    setupMouseEvents();
    setupVolumeControl();
    setupClock();
    setupTitleTicker();
 
    window.onresize = drawChart;
    document.body.style.color = "#0d0"; // set chart bar default color 
}); // $(document).ready(function() {

function charsAllowed(_value) {
    return new RegExp(/^[a-zA-Z\s]+$/).test(_value);
}

function drawChart(_logMsg) {
    log(TEXT,"drawChart(" + _logMsg + ")");

    if (itsTheBB) 
        return;

    var barColors  = [];
    var chartData  = [];
    var lastLetter = "";
    var lastIndex  = -50;
    var yMax       = 0;
    var currentSongIndex = -1;

    var customTooltips = function(_ttModel) {
        var chartToolTip = document.getElementById('charttooltip');
        var innerHTML = "<table>";
        var chartPopupIndex = -1;

        // Hide if no tooltip
        if (this._active.length == 0 || !songLog.includes(this._active[0]._index) && showPlayed) {
            $("#charttooltip").remove();
            chartPopupIndex = -1;
            return;
        }

        if (!chartToolTip) {
            log(TEXT,"creating tooltip div")
            chartToolTip = document.createElement('div');
            chartToolTip.id = 'charttooltip';
            chartToolTip.innerHTML = innerHTML;
            this._chart.canvas.parentNode.appendChild(chartToolTip);
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
                sendCommand("playsong/" + chartPopupIndex);
        });

        // highlight currently playing song
        if (chartPopupIndex == songLog[songLog.length - 1]) {
            chartToolTip.style.color = "#fd1";
            chartToolTip.style.border = "1px solid #fd1";
            innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
            } else {
                    chartToolTip.style.color = "#0d0";
                    chartToolTip.style.border = "1px solid #0d0";
                    innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
                    }

        innerHTML += '<tbody><tr><td>&nbsp<td></tr><tr><td>Right click for songs ' + (showPlayed ? "not" : "") + ' played.</td></tr></tbody></table>';

        chartToolTip.querySelector('table').innerHTML = innerHTML;
        chartToolTip.style.opacity = 1;
        chartToolTip.style.left    = (_ttModel.caretX / 1.4) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
    };  // var customTooltips = function(_ttModel) {

    $("#chartcontainer").css("display","inline-block");
    
    currentSongIndex = songLog[songLog.length - 1];
    chartData.length = barColors.length = playList.length;
    chartData.fill(0);
    barColors.fill(document.body.style.color);
    
    for (var i = 0; i < songLog.length;i++) {
        barColors[songLog[i]] = document.body.style.color;
        chartData[songLog[i]]++;

        if (chartData[songLog[i]] > yMax)
            yMax = chartData[songLog[i]] + 1;
    }

    chartData[currentSongIndex] = yMax;

    if (!showPlayed) { 
        for (var i = 0; i < chartData.length;i++) {
            if (chartData[i] > 0) {
                barColors[i] = "#000";
                chartData[i] = 0;
            } else {
                    barColors[i] = document.body.style.color;
                    chartData[i] = 1;
                    }
        
        chartData[currentSongIndex] = 2;
        }
    }

    barColors[currentSongIndex] = "#fd1"; // highlight currently playing

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
                        beginAtZero: true,
                        ticks: {
                            autoSkip: false,
                            fontColor: '#0d0',
                            fontSize: '16',
                            callback: function(_value, _index, _values) {
                                    if ((playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) && (!showPlayed || songLog.includes(_index))) {
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

function sendCommand(_command) {
    log(TEXT,"sendCommand(" + _command + ")");
    var postRefresh = true;

    if (!postRefresh)
        updateUI('sendCommand(' + _command + ')');

    if (!itsTheBB) {
        $.getJSON(_command, function (_newState) {
            log(TEXT, "new state");
            log(DIR, _newState);
            
            updateState(_newState);

           if (postRefresh || _command != "pause" || _command != "shuffle")
                updateUI('sendCommand(' + _command + ')');
        });
    } else {
            if (_command.split("/")[0] == "queuesong") {
                state.popupDialog = playList[_command.split("/")[1]] + " queued";
                updateUI('sendCommand(' + _command + ')');
            }

            $.getJSON(_command, function (_newState) {
                updateState(_newState);
            });

            setTimeout(function() {
                $.getJSON("getstate", function (_newState) {
                    updateState(_newState);
                    updateUI('sendCommand(' + _command + ')');
                });
            }, 750);
    }
}

function setupClock() {
    log(TEXT,"setupClock()");

    setInterval(function() {
        if (state.duration - state.progress > -1) 
            $("#clock").text('-' + (state.duration - state.progress).toMMSS());
                else
                    $("#clock").text('-00:00');

        if (!state.pause) {            
            var left = (++state.progress / state.duration) * 375;
             
            if (state.progress >= state.duration) {  // clamp the clock the bb wont get
                sendCommand("getstate");            // the websocket state, so we ask for it here
                left = 375;
            }
            
            if (!userAdjustingProgressBar)
                $("#progressbarhandle").css("left", left);
        } // if (!state.pause) { 
    }, 1000); 
};

function setupKBEvents() {
    var index;

    log(TEXT,"setupKBEvents()");
    
    $("body").keyup(function(_event) {
        log(TEXT,"body keyup -> " + _event.which);
        
        switch (_event.which) {
            case 90 || 122: // Z z
                sendCommand("prev");
            break;

            case 66 || 98: // B b
                sendCommand("next");
            break;

            case 77 || 109: // M m
                sendCommand("setvolume/mute");
            break;

            case 67 || 99: // C c
                sendCommand("pause");
            break;

            case 83 || 115: // S s
                sendCommand("shuffle");
            break;

            case 81 || 113: // Q q
                sendCommand("queuesong/" + getSearchInputSongIndex());
            break;

            case 79 || 111: // O o
                $("#volume").slider("value", parseInt($("#volume").slider("value") + 1));
            break;

            case 73 || 105: // I i
                $("#volume").slider("value", parseInt($("#volume").slider("value") - 1));
            break;

            case 74 || 106: // J j
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
                    //$.get("playsong/" + getSearchInputSongIndex());
                    sendCommand("playsong/" + getSearchInputSongIndex(), "playlist keyup");
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

function setupMouseEvents() {
    log(TEXT,"setupMouseEvents()");

    // this will cause slidechange jquery cb to fire
    $("#winampspan").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            $("#volume").slider("value",parseInt($("#volume").slider("value") + 1)); 
                else
                   $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
    });

    $("#winampspan").click(function() {
        if (itsTheBB)
            sendCommand("getstate");
    });

    $("#playlist").dblclick(function() {
        sendCommand("playsong/" + getSearchInputSongIndex());
    });

    $("#playsong").click(function() {
        sendCommand("playsong/" + getSearchInputSongIndex());
    });

    $("#queuesong").click(function() {
        sendCommand("queuesong/" + getSearchInputSongIndex());
    });

    $("#shuffle, #shuffleenabled,#pause,#prev, #next, #pause").click(function() {
        sendCommand((this).id);
    });

    $("#setvolume\\/mute").click(function() {
        sendCommand("setvolume/mute");
    });

    $("#progressbarhandle").draggable({
       containment: "parent",
       start: function() {
            userAdjustingProgressBar = true;
        },
        stop: function(_event, _ui) {
            sendCommand("seek/" + parseInt((_event.target.offsetLeft / 375) * 100), "seek");
            $("#progressbarhandle").css("left", parseInt(_event.target.offsetLeft));
            userAdjustingProgressBar = false;
        }  
    });

    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").val());
    });
} // function setupMouseEvents() {

function setupPlaylist() {
    log(TEXT,"setupPlaylist()");
    playList = state.playList;
    $("#playlist").attr("size", playList.length < 20 ? playList.length : 20);
    $("#playlist").empty();

    for (var i = 0; i < playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");
                 
        option.setAttribute("id", "song_" + i);
        option.text = playList[i];
        select.add(option);
    } 

    setupSearch();
} // function setupPlaylist() {

function setupSearch() {
    log(TEXT,"setupSearch()");

    $("#searchinput").focusin(function() {
        log(TEXT,"searchinput focus in");
        $("body").off("keyup");
        $("#searchinput").css("border", "1px solid #0d0");
          
        if (!newSelect) 
            $("#searchinput").val("");
                else
                    newSelect = false;
        
        $("#searchinput").keyup(function(_event) {      
            if (_event.which == 13) {
                sendCommand("playsong/" + getSearchInputSongIndex(), "searchinput keyup");
              $("#searchinput").blur();
                newSelect = false;
            }

            if (_event.which == 27)
                $("#searchinput").blur();
        });
    }); // $("#searchinput").focusin(function() {

    $("#searchinput").focusout(function() {
        log(TEXT,"searchinput focus out");
        $("#searchinput").css("border", "1px solid #888");
        $("#searchinput").off("keyup");
        $("#searchinput").val($("#playlist").val());
        setupKBEvents();
    }); // $("#searchinput").focusout(function() {

    autocomplete({  // preventSubmit: true,
        input: document.querySelector('#searchinput'),
        className: 'autocomplete-customizations',
        minLength: 2, //debounceWaitMs: 50,
        emptymessage: "MP3 not found",
        onSelect: function(_item, _inputfield) { // log(LOG,"onselect ****");
            newSelect = true;
            $("#searchinput").val(_item.label);
        },
        fetch: function(_match, _callback) {
            var match   = _match.toLowerCase();
            var items   = playList.map(function(_n) {
                return { label: _n, group: "Results" }
            });
            _callback(items.filter(function(_n) { // log(LOG,"onfetch ****")
                if (_n.label) {
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
        customize: function(_input, _inputRect, _container, _maxHeight) {
            if (_maxHeight < 100) { // // display autocomplete above the input field if there is not enough space for it.
                _container.style.top = "";
                _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} //  setupSearch() {

function setupTitleTicker() {
    log(TEXT,"setupTitleTicker()");

    setInterval(function() {
        if (playList && songLog)
            if (($("#pagetitle").text().length > 0))
                $("#pagetitle").text($("#pagetitle").text().slice(1));
                    else
                        $("#pagetitle").text(playList[songLog[songLog.length - 1]]);
    }, 250); 
} // function setupTitleTicker() {

function setupVolumeControl() {
    log(TEXT,"setupVolumeControl()");

    $("#volume").slider({
        animate: false,
        min: 1,
        max: 100,
        value: 0
    });
 
    $("#volume").on("slidechange", function(_event, _ui) {
        // vol 0% -> 40 153 28  vol 100% -> 225 31 38
        //           28  99 1c               e1 1f 26 
        var r = toHex(_ui.value * 1.85 + 40);
        var g = toHex(153 - _ui.value);
        var b = toHex(_ui.value * 0.1 + 28);

        $("#volume").css("background-color","#" + r + g + b);

        if (state.hasOwnProperty('volume')) {
            log(TEXT,"volume slidechange callback fired... not sending volume back to server. Removing volume from state volume -> " + state.volume);
            delete state.volume;
            return;
        }

        log(TEXT,"volume slidechange callback fired... sending new value -> " +  _ui.value + " color -> #" + r + g + b);
        $.get("setvolume/" + _ui.value);
    }); // $("#volume").on("slidechange", function(_event, _ui) {
} // function setupVolumeControl() {

function setupWebSocket() {
    log(TEXT,"setupWebSocket()");
    var client = new WebSocket("ws://" + serverUrl, "winamp");
    itsTheBB = false;

    client.onmessage = function(_response) {
        updateState(JSON.parse(_response.data).state); 
    } // client.onmessage = function(_response) {
} // function setupWebSocket() {

function toHex(_n) {
    var h = parseInt(_n).toString(16);
    return h.length < 2 ? "0" + h : h;;
}
 
function updateState(_state) {
    log(TEXT, "updateState()");

    state = _state;
    log(DIR, state);
    $("#pagetitle").text("");
    
    if (state.hasOwnProperty('playList'))
        setupPlaylist();

    if (state.hasOwnProperty('songLog')) 
        songLog = state.songLog;

    updateUI("client.onmessage");
}

function updateUI(_logMsg) {
    log(TEXT,"updateUI(" + _logMsg + ")");
 
    $("#setvolume\\/mute").css("display", state.mute ? "inline-block" : "none");
    $("#shuffleenabled").css("visibility",state.shuffle ? "visible" : "hidden");
    $("#ispaused").attr("src",state.pause ? "/images/paused.png" : "/images/playing.png");
    $("#connections").text(" (" + state.total_listeners + "/" + state.current_listeners + "/" + songLog.length + ")");

    // this will cause slidechange jquery cb to fire
    state.hasOwnProperty('volume') ? $("#volume").slider("value", state.volume) : null;

    if (itsTheBB) {
        $("body").css("text-align","left");
        $("#shuffleenabled").css("margin-left", "-190px");
        $("#setvolume\\/mute").css("left","5%");
        $("#setvolume\\/mute").css("top","35%");
        $("#popupdialog").css("top","30%");
        $("#popupdialog").css("left","0px");
        $("#popupdialog").css("width","40%");
    }

    if (state.hasOwnProperty('songLog')) {
        $("#songtitle").text(playList[songLog[songLog.length - 1]] + " (" + state.duration.toMMSS() + ")");
        $("#searchinput").val(playList[songLog[songLog.length - 1]]); 
        $("#searchinput").css("width",parseInt($("#playlist").css("width")) - 150);
        $("#playlist>option:eq(" + songLog[songLog.length - 1] + ")").prop("selected", true);    
        drawChart("updateUI(" + _logMsg + ")");
        delete state.songLog;
    }

    if (state.hasOwnProperty('popupDialog')) {// && !itsTheBB) {
        $("#popupdialog").css("display", "inline-block");
        $("#popupdialog").text(state.popupDialog);
        $("#popupdialog").delay(5000).hide(0);  
        delete state.popupDialog;
    } 

    if (!userAdjustingProgressBar)
        $("#progressbarhandle").css("left", (state.progress / state.duration) * 375);
} // function updateUI(_logMsg) {
    